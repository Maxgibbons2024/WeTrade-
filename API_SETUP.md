# WeTrade — Slack & Fathom Integration Setup (No Zapier)

This guide sets up automatic data ingestion from Slack and Fathom into your dashboard using free Vercel serverless functions — no Zapier required.

---

## Overview

| Integration | What It Does | Endpoint |
|---|---|---|
| Slack Deal Posts | Auto-captures deals from #sales-team-chat | `/api/slack/events` |
| Slack EOD Reports | Auto-captures EOD call reports from #eod-reports | `/api/slack/events` |
| Fathom Call Sync | Daily sync of call data from Fathom | `/api/fathom/sync` |

---

## Part 1: Environment Variables

Add these in your **Vercel dashboard** under **Settings → Environment Variables**:

| Variable | Where to Get It | Example |
|---|---|---|
| `SUPABASE_URL` | Supabase → Settings → API | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (under "service_role") | `eyJ...` |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information (see Part 2) | `abc123...` |
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions (see Part 2) | `xoxb-...` |
| `SLACK_CHANNEL_SALES` | Your #sales-team-chat channel ID (see Part 2, step 10) | `C0123456789` |
| `SLACK_CHANNEL_EOD` | Your #eod-reports channel ID (see Part 2, step 10) | `C9876543210` |
| `FATHOM_API_KEY` | Fathom → Settings → API (see Part 3) | `fathom_...` |
| `CRON_SECRET` | Make up any random string | `mysecretstring123` |

**Important**: The `SUPABASE_URL` value is the same as your existing `VITE_SUPABASE_URL`. The `SUPABASE_SERVICE_ROLE_KEY` is different from the anon key — it has full database access. Find it in Supabase under **Settings → API → service_role (secret)**.

---

## Part 2: Slack App Setup (Step by Step)

### Step 1: Create the Slack App

1. Go to **https://api.slack.com/apps**
2. Click **Create New App**
3. Choose **From scratch**
4. App Name: `WeTrade Dashboard`
5. Pick your workspace
6. Click **Create App**

### Step 2: Add Bot Permissions

1. In the left sidebar, click **OAuth & Permissions**
2. Scroll down to **Scopes → Bot Token Scopes**
3. Click **Add an OAuth Scope** and add these three:
   - `channels:history` — lets the bot read messages in channels
   - `channels:read` — lets the bot see channel info
   - `users:read` — lets the bot look up who posted a message

### Step 3: Install the App

1. Scroll to the top of the **OAuth & Permissions** page
2. Click **Install to Workspace**
3. Click **Allow**
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
5. Paste it into Vercel as `SLACK_BOT_TOKEN`

### Step 4: Get the Signing Secret

1. In the left sidebar, click **Basic Information**
2. Under **App Credentials**, find **Signing Secret**
3. Click **Show** and copy it
4. Paste it into Vercel as `SLACK_SIGNING_SECRET`

### Step 5: Deploy to Vercel First

Before enabling events, you need the API endpoint live:

1. Commit and push your code (the `/api` folder) to GitHub
2. Vercel will auto-deploy
3. Your endpoint will be at: `https://your-project.vercel.app/api/slack/events`

### Step 6: Enable Event Subscriptions

1. In the Slack app settings, click **Event Subscriptions** in the left sidebar
2. Toggle **Enable Events** to **On**
3. In **Request URL**, paste: `https://your-project.vercel.app/api/slack/events`
4. Slack will send a verification challenge — if your API is deployed, it will show **Verified ✓**
5. Under **Subscribe to bot events**, click **Add Bot User Event**
6. Add: `message.channels`
7. Click **Save Changes** at the bottom

### Step 7: Invite the Bot to Your Channels

1. Open Slack
2. Go to **#sales-team-chat**
3. Type: `/invite @WeTrade Dashboard` and send
4. Go to **#eod-reports**
5. Type: `/invite @WeTrade Dashboard` and send

### Step 8: Get Channel IDs

1. In Slack, right-click on **#sales-team-chat**
2. Click **View channel details**
3. At the bottom of the popup, you'll see the Channel ID (starts with `C`)
4. Copy it and paste into Vercel as `SLACK_CHANNEL_SALES`
5. Do the same for **#eod-reports** → paste as `SLACK_CHANNEL_EOD`

### Step 9: Redeploy

After adding all the environment variables in Vercel:
1. Go to **Deployments** in Vercel
2. Click **...** on the latest deployment → **Redeploy**

### Step 10: Test It

Post a test message in **#sales-team-chat**:
```
Test Client - 2k down, 500p/m rolling, Pro. Onboarding call - 10:00am Thursday 3rd April @Sam Ducker
```

Then check your Supabase **Table Editor → deals** — a new row should appear within a few seconds.

Post a test in **#eod-reports**:
```
EOD Report
1. Test Client A - closed, £2000 Pro
2. Test Client B - no show
3. Test Client C - following up, will call tomorrow
```

Check **Table Editor → eod_calls** — three new rows should appear.

---

## Part 3: Fathom Setup

### Step 1: Get Your API Key

1. Log in to **fathom.video**
2. Go to **Settings → Integrations** (or **Settings → API**)
3. Generate a new API key
4. Copy it and paste into Vercel as `FATHOM_API_KEY`

### Step 2: Set a Cron Secret

1. Make up any random string (e.g., `wetrade-fathom-sync-2026`)
2. Add it in Vercel as `CRON_SECRET`

### Step 3: It's Automatic

The Fathom sync runs automatically every weekday at 22:00 UTC via Vercel Cron. It:
- Fetches yesterday's calls from the Fathom API
- Matches each call to a closer (Lloyd, Dave, Zak, or Joe) by name/email
- Detects no-shows (calls under 60 seconds)
- Inserts everything into the `fathom_calls` table
- Skips duplicates if it runs twice

### Step 4: Test Manually (Optional)

You can test the sync by visiting this URL in your browser or with curl:
```
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-project.vercel.app/api/fathom/sync
```

You should get a JSON response showing how many calls were synced.

### Closer Matching

The sync matches Fathom users to closers by checking if the user's name or email contains:
- `lloyd` → Lloyd
- `dave` → Dave
- `zak` → Zak
- `joe` → Joe

If your Fathom accounts use different names, update the mapping in `api/_lib/closers.js`.

---

## Troubleshooting

### Slack events not working
- **"Not verified"** when setting Request URL → Make sure you've deployed the `/api` folder to Vercel first
- **No data appearing** → Check the bot is invited to the channels, and the channel IDs are correct in env vars
- **Duplicate entries** → The handler checks for duplicates via `slack_message_ts`, but if you see dupes, check the Vercel function logs

### Fathom sync not running
- Check **Vercel → Settings → Cron Jobs** to see if the cron is registered
- Verify `FATHOM_API_KEY` is set correctly
- Check the Vercel function logs for errors

### General debugging
- Go to **Vercel → Logs** to see function execution logs
- All errors are logged with `console.error` and will appear there
