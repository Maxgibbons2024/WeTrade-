import { getSupabaseAdmin } from '../_lib/supabase.js';

// Simple SegMetrics daily-stats sync.
// Pulls daily spend / impressions / clicks / leads / revenue from the
// SegMetrics `ads` report's graph datasets and stores in segmetrics_daily.
//
// We used to fetch campaign-level data day-by-day and try to do attribution
// inside this dashboard, but SegMetrics already does attribution — we just
// need the headline numbers for awareness.

const SEGMETRICS_BASE = 'https://api.segmetrics.io';
const BACKFILL_DAYS = 90;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const queryKey = req.query?.key;
    if (!queryKey || queryKey !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const apiKey = process.env.SEGMETRICS_API_KEY;
  const accountId = process.env.SEGMETRICS_ACCOUNT_ID;
  if (!apiKey) return res.status(500).json({ error: 'Missing SEGMETRICS_API_KEY' });
  if (!accountId) return res.status(500).json({ error: 'Missing SEGMETRICS_ACCOUNT_ID' });

  try {
    const supabase = getSupabaseAdmin();

    // Determine date range
    let since = req.query?.since;
    let until = req.query?.until;

    if (!since) {
      const { count } = await supabase
        .from('segmetrics_daily')
        .select('date', { count: 'exact', head: true });

      if (!count || count === 0) {
        const start = new Date();
        start.setDate(start.getDate() - BACKFILL_DAYS);
        since = start.toISOString().split('T')[0];
      } else {
        // Only resync the last 7 days on normal runs (covers any late data)
        const d = new Date();
        d.setDate(d.getDate() - 7);
        since = d.toISOString().split('T')[0];
      }
    }
    if (!until) {
      until = new Date().toISOString().split('T')[0];
    }

    // Single request — the graph.datasets contain daily time-series for each metric.
    // No need to loop day-by-day.
    const url = `${SEGMETRICS_BASE}/${accountId}/report/ads?start=${since}&end=${until}&scale=day`;
    const resp = await fetch(url, {
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(502).json({
        error: `SegMetrics API error: ${resp.status}`,
        detail: errText,
      });
    }

    const data = await resp.json();
    const labels = data?.graph?.labels || [];
    const datasets = data?.graph?.datasets || [];

    if (!labels.length || !datasets.length) {
      return res.status(200).json({
        ok: true,
        message: 'No graph data returned by SegMetrics',
        since,
        until,
        count: 0,
      });
    }

    // Build a map: metric key → daily values array (aligned with labels)
    const byKey = {};
    for (const ds of datasets) {
      if (ds.key && Array.isArray(ds.data)) {
        byKey[ds.key] = ds.data;
      }
    }

    // Compose one row per date
    const rows = labels.map((date, i) => ({
      date,
      impressions: Math.round(Number(byKey.adImpressions?.[i] || 0)),
      spend:       Math.round(Number(byKey.adSpend?.[i] || 0) * 100) / 100,
      clicks:      Math.round(Number(byKey.adClicks?.[i] || 0)),
      leads:       Math.round(Number(byKey.leads?.[i] || 0)),
      revenue:     Math.round(Number(byKey.revenue?.[i] || 0) * 100) / 100,
      synced_at:   new Date().toISOString(),
    }));

    // Upsert
    let upserted = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase
        .from('segmetrics_daily')
        .upsert(batch, { onConflict: 'date' });
      if (error) {
        console.error('[segmetrics/sync] Upsert error:', error.message);
        errors.push(error.message);
      } else {
        upserted += batch.length;
      }
    }

    return res.status(200).json({
      ok: true,
      since,
      until,
      rows: rows.length,
      upserted,
      availableKeys: Object.keys(byKey),
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('SegMetrics sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { runtime: 'nodejs' };
