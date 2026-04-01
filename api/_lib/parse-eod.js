export function isEodMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes('eod') || lower.includes('end of day');
}

export function parseEodReport(text) {
  const lines = text.split('\n');
  const calls = [];

  for (const line of lines) {
    // Match lines like "1. Client Name - outcome details" or "1) Client Name – outcome"
    const match = line.match(/^\s*\d+[.)]\s*(.+?)\s*[-–—]\s*(.+)$/);
    if (!match) continue;

    const clientName = match[1].trim();
    const outcomeText = match[2].trim().toLowerCase();

    let outcome = 'follow_up';
    let dealValue = null;

    if (/no\s*show|no-show|noshow/.test(outcomeText)) {
      outcome = 'no_show';
    } else if (/closed|£|signed/.test(outcomeText)) {
      outcome = 'closed';
      // Try to extract deal value
      const valMatch = outcomeText.match(/£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)/);
      if (valMatch) {
        dealValue = parseFloat(valMatch[1].replace(/,/g, ''));
      }
      const kMatch = outcomeText.match(/(\d+(?:\.\d+)?)\s*k/i);
      if (kMatch && !valMatch) {
        dealValue = parseFloat(kMatch[1]) * 1000;
      }
    } else if (/not interested|not ready|declined/.test(outcomeText)) {
      outcome = 'not_interested';
    } else if (/reschedule|rebook|moved/.test(outcomeText)) {
      outcome = 'rescheduled';
    } else if (/follow|callback|call back|think about/.test(outcomeText)) {
      outcome = 'follow_up';
    }

    calls.push({
      client_name: clientName,
      outcome,
      deal_value: dealValue,
      notes: match[2].trim(),
      raw_text: line.trim(),
    });
  }

  return calls;
}
