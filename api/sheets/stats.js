export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHEET_ID = '1Y4BQq_MiotUPkeX51YKfBGssMBhENHNs0spDZg5lQag';
  const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_SHEETS_API_KEY not configured' });
  }

  const TABS = {
    lloyd: 'BIG LLOYD',
    dave: "David 'Hulk Hogan'",
    zak: 'Zak Back2Back Clover',
  };

  // Which month to look for (default: current month)
  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const targetMonth = req.query.month || monthNames[now.getMonth()];

  // Metrics we care about (in order they appear in the sheet)
  const METRIC_LABELS = [
    'SCHEDULED Consults',
    'LIVE Consults',
    'Show %',
    'Offers',
    'Offer %',
    'Deposits',
    'Closes',
    'Offer Committment %',
    'Offer Close %',
    'Call Committment %',
    'Call Close %',
    'Front End',
    'Back End',
    'Front End Revenue',
    'Front End Collected',
    'FE Collected %',
    'Back End Revenue',
    'Back End Collected',
    'Back End Collected %',
    'Total Revenue',
    'Total Collected',
  ];

  try {
    const results = {};

    for (const [closerId, tabName] of Object.entries(TABS)) {
      // Fetch a broad range to find the month section
      const range = encodeURIComponent(`'${tabName}'!A1:AJ200`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}&valueRenderOption=UNFORMATTED_VALUE`;
      const response = await fetch(url);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Failed to fetch ${tabName}:`, errText);
        results[closerId] = { error: `Failed to fetch sheet: ${response.status}` };
        continue;
      }

      const data = await response.json();
      const rows = data.values || [];

      // Find the row containing the target month
      let monthRowIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        for (let j = 0; j < Math.min(row.length, 3); j++) {
          if (typeof row[j] === 'string' && row[j].trim().toLowerCase() === targetMonth.toLowerCase()) {
            monthRowIdx = i;
            break;
          }
        }
        if (monthRowIdx >= 0) break;
      }

      if (monthRowIdx < 0) {
        results[closerId] = { error: `Month "${targetMonth}" not found in sheet` };
        continue;
      }

      // The month header row contains day labels (Mar 1, Mar 2, etc.)
      const headerRow = rows[monthRowIdx];
      // Find which columns have day headers
      const days = [];
      let totalColIdx = -1;
      for (let c = 1; c < headerRow.length; c++) {
        const cell = String(headerRow[c] || '').trim();
        if (cell.toLowerCase() === 'total') {
          totalColIdx = c;
          break;
        }
        if (cell) {
          days.push({ col: c, label: cell });
        }
      }

      // Parse metric rows (they follow the month header row)
      const metrics = {};
      for (let r = monthRowIdx + 1; r < Math.min(monthRowIdx + 30, rows.length); r++) {
        const row = rows[r] || [];
        // Find the metric label - check first few columns
        let label = '';
        for (let c = 0; c < Math.min(3, row.length); c++) {
          const cell = String(row[c] || '').trim();
          if (cell && METRIC_LABELS.some((m) => m.toLowerCase() === cell.toLowerCase())) {
            label = METRIC_LABELS.find((m) => m.toLowerCase() === cell.toLowerCase());
            break;
          }
        }
        if (!label) continue;

        const dailyValues = days.map((d) => {
          const val = row[d.col];
          if (val === undefined || val === null || val === '') return null;
          return val;
        });

        const total = totalColIdx >= 0 ? (row[totalColIdx] ?? null) : null;

        metrics[label] = { daily: dailyValues, total };
      }

      results[closerId] = {
        month: targetMonth,
        days: days.map((d) => d.label),
        metrics,
      };
    }

    res.status(200).json({ ok: true, data: results });
  } catch (err) {
    console.error('Sheets API error:', err);
    res.status(500).json({ error: err.message });
  }
}
