# WeTrade — Zapier Integration Setup

## Prerequisites

- Zapier account (Team plan recommended for multi-step Zaps)
- Slack workspace with access to #sales-team-chat and #eod-reports channels
- Supabase project URL and **service_role** key (NOT the anon key — service_role bypasses RLS)

---

## ZAP 1 — Deal Posts from #sales-team-chat

### Purpose
Automatically captures deal posts from Slack and inserts them into the `deals` table.

### Trigger

1. **App**: Slack
2. **Event**: New Message Posted to Channel
3. **Channel**: #sales-team-chat

### Filter

1. **Add Filter step** (Zapier built-in)
2. Condition: **Message Text** contains ` - ` AND (**Message Text** contains `p/m` OR **Message Text** contains `down`)

### Action 1: Code by Zapier (JavaScript)

**Input Data**:
- `message_text` → `{{Message Text}}`
- `slack_user_name` → `{{User Real Name}}`
- `message_ts` → `{{Ts}}`

**Code**:

```javascript
// Parse deal message from Slack #sales-team-chat
// Format: "Layton Robinson - 2k down, 500p/m rolling, Pro free upgrade. Onboarding call - 11:00am Wednesday 1st April @Sam Ducker"

const text = inputData.message_text || '';
const slackUser = inputData.slack_user_name || '';
const messageTs = inputData.message_ts || '';

// Map Slack display names to closer IDs
const closerMap = {
  'lloyd': { id: 'lloyd', name: 'Lloyd' },
  'dave': { id: 'dave', name: 'Dave' },
  'zak': { id: 'zak', name: 'Zak' },
  'joe': { id: 'joe', name: 'Joe' },
};

// Determine closer from Slack username
const lowerUser = slackUser.toLowerCase();
let closerId = 'lloyd';
let closerName = slackUser;
for (const [key, val] of Object.entries(closerMap)) {
  if (lowerUser.includes(key)) {
    closerId = val.id;
    closerName = val.name;
    break;
  }
}

// Split on first " - " to get client name
const dashIndex = text.indexOf(' - ');
const clientName = dashIndex > 0 ? text.substring(0, dashIndex).trim() : 'Unknown';
const details = dashIndex > 0 ? text.substring(dashIndex + 3) : text;

// Extract front end amount (e.g., "2k down" → 2000, "£1500 down" → 1500)
let frontEnd = 0;
const feMatch = details.match(/(\d+(?:\.\d+)?)\s*k\s*(?:down|upfront|paid)/i)
  || details.match(/£?\s*(\d{1,6}(?:,\d{3})*)\s*(?:down|upfront|paid)/i);
if (feMatch) {
  const raw = feMatch[1].replace(/,/g, '');
  frontEnd = parseFloat(raw);
  if (details.match(/(\d+(?:\.\d+)?)\s*k\s*(?:down|upfront|paid)/i)) {
    frontEnd *= 1000;
  }
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

// Extract onboarding date (basic parsing — e.g., "11:00am Wednesday 1st April")
let onboardingDate = null;
const dateMatch = details.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:on\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i);
if (dateMatch) {
  const timeStr = dateMatch[1];
  const day = dateMatch[2];
  const month = dateMatch[3];
  const year = new Date().getFullYear();
  const dateStr = `${day} ${month} ${year} ${timeStr}`;
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    onboardingDate = parsed.toISOString();
  }
}

// Notes = full message text minus client name
const notes = details.trim();

output = [{
  client_name: clientName,
  closer_id: closerId,
  closer_name: closerName,
  front_end: frontEnd,
  monthly_amount: monthlyAmount,
  programme: programme,
  onboarding_date: onboardingDate || '',
  onboarding_assigned_to: onboardingAssignedTo || '',
  notes: notes,
  source: 'slack',
  payment_method: 'stripe',
  status: onboardingDate ? 'onboarding' : 'active',
  slack_message_ts: messageTs,
}];
```

### Action 2: Webhooks by Zapier (POST)

**URL**: `https://<YOUR_SUPABASE_PROJECT_URL>/rest/v1/deals`

**Payload Type**: JSON

**Headers**:
- `apikey`: `<YOUR_SUPABASE_SERVICE_ROLE_KEY>`
- `Authorization`: `Bearer <YOUR_SUPABASE_SERVICE_ROLE_KEY>`
- `Content-Type`: `application/json`
- `Prefer`: `return=representation`

**Data**:
```
client_name: {{client_name from Code step}}
closer_id: {{closer_id from Code step}}
closer_name: {{closer_name from Code step}}
front_end: {{front_end from Code step}}
monthly_amount: {{monthly_amount from Code step}}
programme: {{programme from Code step}}
onboarding_date: {{onboarding_date from Code step}}
onboarding_assigned_to: {{onboarding_assigned_to from Code step}}
notes: {{notes from Code step}}
source: slack
payment_method: {{payment_method from Code step}}
status: {{status from Code step}}
```

---

## ZAP 2 — EOD Reports from #eod-reports

### Purpose
Parses end-of-day reports into individual call records in the `eod_calls` table.

### Trigger

1. **App**: Slack
2. **Event**: New Message Posted to Channel
3. **Channel**: #eod-reports

### Filter

1. **Add Filter step**
2. Condition: **Message Text** (lowercase) contains `eod` OR **Message Text** contains `end of day`

### Action 1: Code by Zapier (JavaScript)

**Input Data**:
- `message_text` → `{{Message Text}}`
- `slack_user_name` → `{{User Real Name}}`
- `message_ts` → `{{Ts}}`

**Code**:

```javascript
// Parse EOD report from Slack #eod-reports
// Format:
// EOD Report
// 1. Rodney Wearing - no show
// 2. Marcus Chen - closed, £3500 Elite
// 3. Sophie Williams - good call, following up
// 4. Richard Preston - not interested

const text = inputData.message_text || '';
const slackUser = inputData.slack_user_name || '';
const messageTs = inputData.message_ts || '';

// Map Slack display names to closer IDs
const closerMap = {
  'lloyd': { id: 'lloyd', name: 'Lloyd' },
  'dave': { id: 'dave', name: 'Dave' },
  'zak': { id: 'zak', name: 'Zak' },
  'joe': { id: 'joe', name: 'Joe' },
};

const lowerUser = slackUser.toLowerCase();
let closerId = 'lloyd';
let closerName = slackUser;
for (const [key, val] of Object.entries(closerMap)) {
  if (lowerUser.includes(key)) {
    closerId = val.id;
    closerName = val.name;
    break;
  }
}

const today = new Date().toISOString().split('T')[0];

// Parse each numbered line
const lines = text.split('\n');
const calls = [];

for (const line of lines) {
  // Match lines like "1. Client Name - outcome details"
  const match = line.match(/^\s*\d+[\.\)]\s*(.+?)\s*[-–—]\s*(.+)$/);
  if (!match) continue;

  const clientName = match[1].trim();
  const outcomeText = match[2].trim().toLowerCase();

  // Determine outcome
  let outcome = 'follow_up';
  let dealValue = null;

  if (outcomeText.includes('no show') || outcomeText.includes('no-show') || outcomeText.includes('noshow')) {
    outcome = 'no_show';
  } else if (outcomeText.includes('closed') || outcomeText.includes('£') || outcomeText.includes('signed')) {
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
  } else if (outcomeText.includes('not interested') || outcomeText.includes('not ready') || outcomeText.includes('declined')) {
    outcome = 'not_interested';
  } else if (outcomeText.includes('reschedule') || outcomeText.includes('rebook') || outcomeText.includes('moved')) {
    outcome = 'rescheduled';
  } else if (outcomeText.includes('follow') || outcomeText.includes('callback') || outcomeText.includes('call back') || outcomeText.includes('think about')) {
    outcome = 'follow_up';
  }

  // Notes = the raw outcome text
  const notes = match[2].trim();

  calls.push({
    report_date: today,
    closer_id: closerId,
    closer_name: closerName,
    client_name: clientName,
    outcome: outcome,
    deal_value: dealValue,
    notes: notes,
    slack_message_ts: messageTs,
    raw_text: line.trim(),
  });
}

output = calls.length > 0 ? calls : [{ error: 'No calls parsed from message' }];
```

### Action 2: Looping by Zapier

1. **Add "Looping by Zapier"** step
2. **Values to Loop**: Use the output array from the Code step
3. Inside the loop, add a **Webhooks by Zapier (POST)** step:

**URL**: `https://<YOUR_SUPABASE_PROJECT_URL>/rest/v1/eod_calls`

**Payload Type**: JSON

**Headers**:
- `apikey`: `<YOUR_SUPABASE_SERVICE_ROLE_KEY>`
- `Authorization`: `Bearer <YOUR_SUPABASE_SERVICE_ROLE_KEY>`
- `Content-Type`: `application/json`
- `Prefer`: `return=representation`

**Data** (map each field from the loop iteration):
```
report_date: {{report_date}}
closer_id: {{closer_id}}
closer_name: {{closer_name}}
client_name: {{client_name}}
outcome: {{outcome}}
deal_value: {{deal_value}}
notes: {{notes}}
slack_message_ts: {{slack_message_ts}}
raw_text: {{raw_text}}
```

---

## Testing

1. Post a test deal message in #sales-team-chat:
   ```
   Test Client - 2k down, 500p/m rolling, Pro. Onboarding call - 10:00am Thursday 3rd April @Sam Ducker
   ```

2. Post a test EOD report in #eod-reports:
   ```
   EOD Report
   1. Test Client A - closed, £2000 Pro
   2. Test Client B - no show
   3. Test Client C - following up, will call tomorrow
   ```

3. Verify the data appears in your Supabase tables and on the dashboard.

## Notes

- Use the **service_role** key (not anon key) for Zapier webhooks so RLS is bypassed
- If Slack messages have rich formatting (bold, links), the parser handles plain text — Zapier strips formatting by default
- Adjust the `closerMap` in both Code steps if closer names change
