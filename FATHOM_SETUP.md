# WeTrade — Fathom Integration Setup

## Prerequisites

- Fathom Video account with API access
- Zapier account
- Supabase project URL and **service_role** key

---

## Step 1: Get Your Fathom API Key

1. Log in to [fathom.video](https://fathom.video)
2. Go to **Settings → Integrations** (or **Settings → API**)
3. Generate a new API key
4. Copy and save it securely — you'll need it for Zapier

---

## Step 2: Create the Zapier Zap

### Trigger: Schedule by Zapier

1. **App**: Schedule by Zapier
2. **Event**: Every Day
3. **Time of Day**: Set to run at e.g. 23:00 (end of business day)
4. **Day of Week**: Monday–Friday only (optional)

### Action 1: Code by Zapier (JavaScript)

This step fetches yesterday's calls from the Fathom API and formats them for Supabase.

**Input Data**:
- `fathom_api_key` → your Fathom API key (store as a Zapier secret or paste directly)
- `supabase_url` → `https://<YOUR_PROJECT>.supabase.co`
- `supabase_key` → your Supabase service_role key

**Code**:

```javascript
const fathomApiKey = inputData.fathom_api_key;
const supabaseUrl = inputData.supabase_url;
const supabaseKey = inputData.supabase_key;

// Calculate yesterday's date range
const now = new Date();
const yesterday = new Date(now);
yesterday.setDate(now.getDate() - 1);
const startDate = yesterday.toISOString().split('T')[0];
const endDate = startDate; // Same day

// Map Fathom user names/emails to closer IDs
const closerMap = {
  // Adjust these to match your Fathom account user names or emails
  'lloyd': { id: 'lloyd', name: 'Lloyd' },
  'dave': { id: 'dave', name: 'Dave' },
  'zak': { id: 'zak', name: 'Zak' },
  'joe': { id: 'joe', name: 'Joe' },
};

function matchCloser(fathomUserName, fathomUserEmail) {
  const combined = `${fathomUserName} ${fathomUserEmail}`.toLowerCase();
  for (const [key, val] of Object.entries(closerMap)) {
    if (combined.includes(key)) {
      return val;
    }
  }
  return { id: 'lloyd', name: fathomUserName || 'Unknown' };
}

// Fetch calls from Fathom API
// Endpoint: GET https://api.fathom.video/v1/calls
// Query params: from (ISO date), to (ISO date)
const response = await fetch(
  `https://api.fathom.video/v1/calls?from=${startDate}T00:00:00Z&to=${endDate}T23:59:59Z`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${fathomApiKey}`,
      'Content-Type': 'application/json',
    },
  }
);

if (!response.ok) {
  output = [{ error: `Fathom API error: ${response.status} ${response.statusText}` }];
  return;
}

const data = await response.json();
const calls = data.calls || data.data || data || [];

if (!Array.isArray(calls) || calls.length === 0) {
  output = [{ message: 'No calls found for yesterday', count: 0 }];
  return;
}

// Process each call
const rows = [];
for (const call of calls) {
  const closer = matchCloser(call.user_name || call.host_name || '', call.user_email || call.host_email || '');

  // Determine if no-show (very short call or marked as no-show)
  const duration = call.duration_seconds || call.duration || 0;
  const isNoShow = duration < 60 || call.no_show === true;

  // Determine outcome from call data
  let outcome = null;
  if (call.outcome) {
    outcome = call.outcome;
  } else if (isNoShow) {
    outcome = 'no_show';
  }

  rows.push({
    call_date: startDate,
    closer_id: closer.id,
    closer_name: closer.name,
    fathom_call_id: call.id || call.call_id || `fathom_${Date.now()}_${Math.random()}`,
    duration_seconds: duration,
    talk_time_seconds: call.talk_time_seconds || call.talk_time || 0,
    outcome: outcome,
    no_show: isNoShow,
    transcript_url: call.transcript_url || call.recording_url || null,
  });
}

// Insert into Supabase
const insertResponse = await fetch(
  `${supabaseUrl}/rest/v1/fathom_calls`,
  {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(rows),
  }
);

if (!insertResponse.ok) {
  const errText = await insertResponse.text();
  output = [{ error: `Supabase insert error: ${insertResponse.status} — ${errText}` }];
  return;
}

const inserted = await insertResponse.json();
output = [{ message: `Successfully inserted ${inserted.length} Fathom calls`, count: inserted.length }];
```

### Action 2 (Optional): Notification

Add a **Slack** or **Email** notification step to alert you if the sync fails or completes.

---

## Step 3: Closer Name Matching

The `closerMap` in the code above matches Fathom user names to your closer IDs. Update it to match your actual Fathom account setup:

```javascript
const closerMap = {
  // Key = substring to search for in the Fathom user's name/email (lowercase)
  // Value = your closer_id and display name
  'lloyd': { id: 'lloyd', name: 'Lloyd' },
  'dave':  { id: 'dave',  name: 'Dave' },
  'zak':   { id: 'zak',   name: 'Zak' },
  'joe':   { id: 'joe',   name: 'Joe' },
};
```

If a Fathom user's display name is "Lloyd Smith" and email is "lloyd@wetrade.com", the matcher will find "lloyd" in both and map correctly.

---

## Fathom API Reference

### List Calls
```
GET https://api.fathom.video/v1/calls
```

**Query Parameters**:
| Param  | Type   | Description                          |
|--------|--------|--------------------------------------|
| `from` | string | ISO 8601 datetime (start of range)   |
| `to`   | string | ISO 8601 datetime (end of range)     |

**Headers**:
```
Authorization: Bearer <FATHOM_API_KEY>
Content-Type: application/json
```

**Response** (example):
```json
{
  "calls": [
    {
      "id": "call_abc123",
      "user_name": "Lloyd",
      "user_email": "lloyd@wetrade.com",
      "duration_seconds": 1800,
      "talk_time_seconds": 1200,
      "no_show": false,
      "transcript_url": "https://fathom.video/calls/abc123",
      "created_at": "2026-04-01T14:30:00Z"
    }
  ]
}
```

---

## Testing

1. Run the Zap manually in Zapier
2. Check the Zapier task history for success/error messages
3. Verify data appears in the `fathom_calls` table in Supabase
4. Check the Fathom page on the dashboard

## Troubleshooting

- **401 from Fathom**: Check your API key is valid and has read access
- **No calls returned**: Verify the date range — the code fetches yesterday's calls
- **Closer not matched**: Update the `closerMap` with the correct Fathom user names/emails
- **Supabase insert fails**: Check you're using the service_role key, not the anon key
