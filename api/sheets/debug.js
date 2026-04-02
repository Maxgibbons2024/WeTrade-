export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHEET_ID = '1Y4BQq_MiotUPkeX51YKfBGssMBhENHNs0spDZg5lQag';
  const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_SHEETS_API_KEY not configured' });
  }

  const tabName = req.query.tab || 'BIG LLOYD';
  const maxRow = Number(req.query.rows) || 300;

  try {
    const range = encodeURIComponent(`'${tabName}'!A1:AJ${maxRow}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}&valueRenderOption=UNFORMATTED_VALUE`;
    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const rows = data.values || [];

    // Return first 3 columns of each row to find month headers
    const summary = rows.map((row, i) => ({
      row: i,
      cols: row.slice(0, 5).map((c) => c === undefined || c === null ? null : c),
    })).filter((r) => r.cols.some((c) => c !== null && c !== ''));

    res.status(200).json({ totalRows: rows.length, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
