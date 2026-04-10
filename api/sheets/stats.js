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

  // Metrics we care about
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
      // Use FORMATTED_VALUE so dates formatted as "April" come through as text
      const range = encodeURIComponent(`'${tabName}'!A1:AJ300`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}&valueRenderOption=FORMATTED_VALUE`;
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
      // The month name (e.g. "April") appears in column A, with day headers on the same row
      let monthRowIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        // Check first column for the month name
        const cellVal = String(row[0] || '').trim().toLowerCase();
        if (cellVal === targetMonth.toLowerCase()) {
          monthRowIdx = i;
          break;
        }
      }

      if (monthRowIdx < 0) {
        results[closerId] = { error: `Month "${targetMonth}" not found in sheet` };
        continue;
      }

      // The month header row contains day labels (Apr 1, Apr 2, etc.)
      const headerRow = rows[monthRowIdx];
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
        const cellA = String(row[0] || '').trim();

        // Stop if we hit the next month
        if (monthNames.some((m) => m.toLowerCase() === cellA.toLowerCase())) break;

        // Match metric label
        const label = METRIC_LABELS.find((m) => m.toLowerCase() === cellA.toLowerCase());
        if (!label) continue;

        const isPercent = label.includes('%');

        const dailyValues = days.map((d) => {
          const raw = row[d.col];
          if (raw === undefined || raw === null || raw === '') return null;
          const str = String(raw).trim();
          if (isPercent) {
            // Could be "75%" or "0.75" or just "75"
            if (str.endsWith('%')) return parseFloat(str) / 100;
            const num = parseFloat(str);
            return isNaN(num) ? null : (num > 1 ? num / 100 : num);
          }
          const num = parseFloat(str.replace(/[£$,]/g, ''));
          return isNaN(num) ? null : num;
        });

        let total = null;
        if (totalColIdx >= 0 && row[totalColIdx] != null && row[totalColIdx] !== '') {
          const rawTotal = String(row[totalColIdx]).trim();
          if (isPercent) {
            if (rawTotal.endsWith('%')) total = parseFloat(rawTotal) / 100;
            else {
              const num = parseFloat(rawTotal);
              total = isNaN(num) ? null : (num > 1 ? num / 100 : num);
            }
          } else {
            total = parseFloat(rawTotal.replace(/[£$,]/g, ''));
            if (isNaN(total)) total = null;
          }
        }

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
