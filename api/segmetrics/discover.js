// Probe SegMetrics API for undocumented ad-level endpoints.
// The public docs only expose campaign-level data via /report/ads, but their
// web UI shows ad-level breakdowns (Account | Campaign | Set | Ad tabs).
// This tries a bunch of plausible URL variations to see which returns
// ad-level rows, so we can wire it into the main sync.
//
// Hit: /api/segmetrics/discover?key=YOUR_CRON_SECRET
// Optional: &report_id=abc123 if you have a saved SegMetrics report id

const SEGMETRICS_BASE = 'https://api.segmetrics.io';

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
  if (!apiKey || !accountId) {
    return res.status(500).json({ error: 'Missing SEGMETRICS_API_KEY or SEGMETRICS_ACCOUNT_ID' });
  }

  // Try a range of yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const since = req.query?.since || yesterday.toISOString().split('T')[0];
  const until = req.query?.until || since;
  const reportId = req.query?.report_id || '';
  const bt = req.query?.bt || '';

  const dateRange = `start=${since}&end=${until}`;
  const probes = [
    // Try the "bt" board-token from the UI URL as report_id / dimension_id
    ...(bt ? [
      `/${accountId}/report/ads/${bt}?${dateRange}`,
      `/${accountId}/report/ads?${dateRange}&bt=${bt}`,
      `/${accountId}/report/ads?${dateRange}&board=${bt}`,
      `/${accountId}/board/${bt}?${dateRange}`,
      `/${accountId}/advertising/${bt}?${dateRange}`,
    ] : []),
    // If user supplied an explicit report id
    ...(reportId ? [`/${accountId}/report/ads/${reportId}?${dateRange}`] : []),
    // Dimension/group_by query params (control group — already known campaign-level)
    `/${accountId}/report/ads?${dateRange}&dimension=ad_name`,
    `/${accountId}/report/ads?${dateRange}&tab=ad`,
    `/${accountId}/report/ads?${dateRange}&view=ad`,
    // Nested paths on /overview
    `/${accountId}/overview/advertising?${dateRange}`,
    `/${accountId}/overview/advertising/ads?${dateRange}`,
  ];

  const results = [];
  for (const path of probes) {
    try {
      const resp = await fetch(`${SEGMETRICS_BASE}${path}`, {
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      });
      const status = resp.status;
      let body = null;
      try {
        body = await resp.json();
      } catch {
        body = await resp.text().catch(() => null);
      }
      // Summarise body so response stays readable
      const summary = {
        path,
        status,
      };
      if (status === 200 && body && typeof body === 'object') {
        summary.topLevelKeys = Object.keys(body);
        const tableFields = body?.table?.fields || [];
        const tableRows = body?.table?.rows || [];
        summary.tableFieldKeys = tableFields.map((f) => f.key);
        summary.tableRowCount = tableRows.length;
        summary.firstRow = tableRows[0] || null;
      } else if (body && typeof body === 'object') {
        summary.errorBody = body;
      } else if (typeof body === 'string') {
        summary.errorText = body.substring(0, 200);
      }
      results.push(summary);
    } catch (err) {
      results.push({ path, error: err.message });
    }
  }

  return res.status(200).json({
    since,
    until,
    reportIdTried: reportId || null,
    probes: results,
  });
}

export const config = { runtime: 'nodejs' };
