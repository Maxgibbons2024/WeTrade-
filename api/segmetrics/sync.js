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

    // Fetch ads report from SegMetrics
    const url = `${SEGMETRICS_BASE}/${accountId}/report/ads?start=${since}&end=${until}&scale=day`;
    const resp = await fetch(url, {
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(502).json({
        error: `SegMetrics API error: ${resp.status}`,
        detail: errText,
      });
    }

    const data = await resp.json();

    // Debug mode: dump raw response structure so we can see actual field names
    if (req.query?.debug === '1') {
      const tableRows = data?.table?.rows || [];
      const tableFields = data?.table?.fields || [];
      return res.status(200).json({
        topLevelKeys: Object.keys(data || {}),
        kpis: data?.kpis || [],
        tableFieldCount: tableFields.length,
        tableFields,
        tableRowCount: tableRows.length,
        sampleRows: tableRows.slice(0, 3),
        graphKeys: Object.keys(data?.graph || {}),
        graphLabels: (data?.graph?.labels || []).slice(0, 5),
        graphDatasets: (data?.graph?.datasets || []).map((ds) => ({
          label: ds.label,
          key: ds.key,
          sampleData: (ds.data || []).slice(0, 3),
        })),
      });
    }

    // Extract table rows — these contain per-campaign/ad/adset data
    const tableRows = data?.table?.rows || [];
    const graphData = data?.graph || {};
    const kpis = data?.kpis || [];

    if (tableRows.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No ad data returned by SegMetrics',
        since,
        until,
        kpiCount: kpis.length,
        count: 0,
      });
    }

    // Map SegMetrics rows to our schema.
    // The exact field names depend on SegMetrics' response format. We try
    // common field names and fall back gracefully. The `raw` column stores
    // the original row so we can inspect and adjust mapping later.
    const rows = [];
    for (const row of tableRows) {
      // SegMetrics may return rows keyed by field name or by index.
      // We normalise both patterns.
      const get = (keys) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
        }
        return null;
      };

      const campaignId = get(['campaign_id', 'adcampaign_id', 'adcampaign', 'campaign']);
      const campaignName = get(['campaign_name', 'adcampaign_name', 'campaign']);
      const adSetId = get(['adset_id', 'ad_set_id']);
      const adSetName = get(['adset_name', 'ad_set_name']);
      const adId = get(['ad_id', 'ad']);
      const adName = get(['ad_name']);
      const date = get(['date', 'date_created']);
      const spend = Number(get(['spend', 'cost', 'amount_spent']) || 0);
      const clicks = Number(get(['clicks', 'link_clicks']) || 0);
      const impressions = Number(get(['impressions']) || 0);
      const leads = Number(get(['leads', 'opt_ins', 'optins', 'contacts']) || 0);
      const revenue = Number(get(['revenue', 'value', 'conversion_value']) || 0);

      // SegMetrics reports spend in cents — convert to pounds
      const spendPounds = spend > 100 ? spend / 100 : spend;
      const revenuePounds = revenue > 100 ? revenue / 100 : revenue;

      const cpc = clicks > 0 ? spendPounds / clicks : 0;
      const cpl = leads > 0 ? spendPounds / leads : 0;
      const roas = spendPounds > 0 ? revenuePounds / spendPounds : 0;

      // Use a composite key if no ad_id: campaign + adset + date
      const effectiveAdId = adId || `${campaignId || 'unknown'}_${adSetId || 'none'}_${date || 'nodate'}`;

      if (!date) continue; // Skip rows without a date

      rows.push({
        date,
        campaign_id: String(campaignId || ''),
        campaign_name: campaignName || '',
        ad_set_id: String(adSetId || ''),
        ad_set_name: adSetName || '',
        ad_id: String(effectiveAdId),
        ad_name: adName || '',
        spend: Math.round(spendPounds * 100) / 100,
        clicks,
        impressions,
        leads,
        revenue: Math.round(revenuePounds * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        cpl: Math.round(cpl * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        raw: row,
        synced_at: new Date().toISOString(),
      });
    }

    if (rows.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No parseable ad rows from SegMetrics',
        since,
        until,
        rawRowCount: tableRows.length,
        count: 0,
      });
    }

    // Dedupe by (ad_id, date) before upserting
    const seen = new Map();
    for (const r of rows) {
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
      fetched: tableRows.length,
      parsed: rows.length,
      deduped: dedupedRows.length,
      upserted,
      kpis: kpis.map((k) => ({ name: k.name, value: k.value })),
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('SegMetrics sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { runtime: 'nodejs' };
