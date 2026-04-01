export function parseDealMessage(text) {
  // Split on first " - " to get client name
  const dashIndex = text.indexOf(' - ');
  if (dashIndex < 0) return null;

  const clientName = text.substring(0, dashIndex).trim();
  const details = text.substring(dashIndex + 3);

  if (!clientName) return null;

  // Extract front end amount (e.g., "2k down" → 2000, "£1500 down" → 1500)
  let frontEnd = 0;
  const feMatchK = details.match(/(\d+(?:\.\d+)?)\s*k\s*(?:down|upfront|paid)/i);
  const feMatchNum = details.match(/£?\s*(\d{1,6}(?:,\d{3})*)\s*(?:down|upfront|paid)/i);
  if (feMatchK) {
    frontEnd = parseFloat(feMatchK[1]) * 1000;
  } else if (feMatchNum) {
    frontEnd = parseFloat(feMatchNum[1].replace(/,/g, ''));
  }

  // Extract monthly amount (e.g., "500p/m" or "£500 per month")
  let monthlyAmount = 0;
  const monthlyMatch = details.match(/(\d+(?:\.\d+)?)\s*(?:p\/m|per\s*month|\/mo|monthly)/i);
  if (monthlyMatch) {
    monthlyAmount = parseFloat(monthlyMatch[1]);
  }

  // Extract programme
  let programme = 'Kickstarter';
  const progMatch = details.match(/\b(Kickstarter|Mechanical\s*Mastery|Pro|Elite)\b/i);
  if (progMatch) {
    const p = progMatch[1].toLowerCase();
    if (p === 'kickstarter') programme = 'Kickstarter';
    else if (p.includes('mechanical')) programme = 'Mechanical Mastery';
    else if (p === 'pro') programme = 'Pro';
    else if (p === 'elite') programme = 'Elite';
  }

  // Extract onboarding assigned to (e.g., "@Sam Ducker")
  let onboardingAssignedTo = null;
  const assignMatch = details.match(/@([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (assignMatch) {
    onboardingAssignedTo = assignMatch[1];
  }

  // Extract onboarding date
  let onboardingDate = null;
  const dateMatch = details.match(
    /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:on\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i
  );
  if (dateMatch) {
    const timeStr = dateMatch[1];
    const day = dateMatch[2];
    const month = dateMatch[3];
    const year = new Date().getFullYear();
    const parsed = new Date(`${day} ${month} ${year} ${timeStr}`);
    if (!isNaN(parsed.getTime())) {
      onboardingDate = parsed.toISOString();
    }
  }

  return {
    client_name: clientName,
    front_end: frontEnd,
    monthly_amount: monthlyAmount,
    programme,
    onboarding_date: onboardingDate,
    onboarding_assigned_to: onboardingAssignedTo,
    notes: details.trim(),
    status: onboardingDate ? 'onboarding' : 'active',
  };
}

export function isDealMessage(text) {
  if (!text) return false;
  const hasDelimiter = text.includes(' - ');
  const hasDealIndicator = /p\/m|down|upfront|paid/i.test(text);
  return hasDelimiter && hasDealIndicator;
}
