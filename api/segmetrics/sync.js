import { getSupabaseAdmin } from '../_lib/supabase.js';

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
        .from('segmetrics_ads')
        .select('id', { count: 'exact', head: true });

      if (!count || count === 0) {
        console.log(`[segmetrics/sync] table empty — backfilling last ${BACKFILL_DAYS} days`);
        const start = new Date();
        start.setDate(start.getDate() - BACKFILL_DAYS);
        since = start.toISOString().split('T')[0];
      } else {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        since = d.toISOString().split('T')[0];
      }
    }
    if (!until) {
      until = new Date().toISOString().split('T')[0];
    }

    // Helper to fetch one day's campaign data from SegMetrics
    async function fetchDay(dateStr) {
      const url = `${SEGMETRICS_BASE}/${accountId}/report/ads?start=${dateStr}&end=${dateStr}&scale=day`;
      const resp = await fetch(url, {
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        console.error(`[segmetrics/sync] API error for ${dateStr}: ${resp.status}`);
        return [];
      }
      const data = await resp.json();
      return { rows: data?.table?.rows || [], kpis: data?.kpis || [] };
    }

    // Debug mode: dump raw response for a single day
    if (req.query?.debug === '1') {
      const debugDate = req.query?.date || until;
      const url = `${SEGMETRICS_BASE}/${accountId}/report/ads?start=${debugDate}&end=${debugDate}&scale=day`;
      const resp = await fetch(url, {
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      const tableRows = data?.table?.rows || [];
      const tableFields = data?.table?.fields || [];
      return res.status(200).json({
        date: debugDate,
        topLevelKeys: Object.keys(data || {}),
        kpis: data?.kpis || [],
        tableFields,
        tableRowCount: tableRows.length,
        sampleRows: tableRows.slice(0, 5),
        graphLabels: (data?.graph?.labels || []).slice(0, 5),
      });
    }

    // Fetch day-by-day to get per-campaign per-day data.
    // SegMetrics table rows are campaign-level aggregates for the date range,
    // so fetching one day at a time gives us daily granularity.
    const allRows = [];
    const cursor = new Date(since);
    const end = new Date(until);
    let daysProcessed = 0;
    let apiErrors = 0;

    while (cursor <= end) {
      const dateStr = cursor.toISOString().split('T')[0];
      const result = await fetchDay(dateStr);

      if (Array.isArray(result)) {
        // fetchDay returned [] on error
        apiErrors++;
      } else {
        for (const row of result.rows) {
          const campaignName = row.ad_campaign || '';
          if (!campaignName) continue;

          // SegMetrics field names (from debug output):
          // ad_campaign, leads, numOfCustomers, revenue, adClicks, adSpend,
          // ad_cpc, adCpa, adCac, adRoi
          const spend = Number(row.adSpend || 0);
          const clicks = Number(row.adClicks || 0);
          const leads = Number(row.leads || 0);
          const revenue = Number(row.revenue || 0);
          const customers = Number(row.numOfCustomers || 0);

          // Skip zero-activity rows
          if (spend === 0 && clicks === 0 && leads === 0) continue;

          const cpc = clicks > 0 ? spend / clicks : 0;
          const cpl = leads > 0 ? spend / leads : 0;
          const roas = spend > 0 ? revenue / spend : 0;

          // Use campaign name as ID (SegMetrics doesn't give a numeric campaign_id in this endpoint)
          const campaignId = campaignName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 200);

          allRows.push({
            date: dateStr,
            campaign_id: campaignId,
            campaign_name: campaignName,
            ad_set_id: '',
            ad_set_name: '',
            ad_id: `${campaignId}_${dateStr}`,
            ad_name: '',
            spend: Math.round(spend * 100) / 100,
            clicks,
            impressions: 0, // Not available in SegMetrics table response
            leads,
            revenue: Math.round(revenue * 100) / 100,
            cpc: Math.round(cpc * 100) / 100,
            cpl: Math.round(cpl * 100) / 100,
            roas: Math.round(roas * 100) / 100,
            raw: { ...row, customers, adCpa: row.adCpa, adCac: row.adCac },
            synced_at: new Date().toISOString(),
          });
        }
      }

      daysProcessed++;
      cursor.setDate(cursor.getDate() + 1);
    }

    if (allRows.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No ad activity found in date range',
        since,
        until,
        daysProcessed,
        apiErrors,
        count: 0,
      });
    }

    // Dedupe by (ad_id, date)
    const seen = new Map();
    for (const r of allRows) {
      const key = `${r.ad_id}::${r.date}`;
      seen.set(key, r);
    }
    const dedupedRows = Array.from(seen.values());

    // Upsert in batches
    let upserted = 0;
    const errors = [];
    for (let i = 0; i < dedupedRows.length; i += 500) {
      const batch = dedupedRows.slice(i, i + 500);
      const { error } = await supabase
        .from('segmetrics_ads')
        .upsert(batch, { onConflict: 'ad_id,date' });
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
      daysProcessed,
      apiErrors,
      fetched: allRows.length,
      deduped: dedupedRows.length,
      upserted,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('SegMetrics sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { runtime: 'nodejs', maxDuration: 300 };
