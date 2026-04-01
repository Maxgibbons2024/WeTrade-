# WeTrade Sales Dashboard — Deployment Guide

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose a region (London for UK, or closest to UAE)
3. Set a strong database password
4. Wait for the project to finish provisioning

## 2. Run the Schema

1. Go to **SQL Editor** in your Supabase dashboard
2. Open `supabase/schema.sql` from this repo
3. Paste the entire contents and click **Run**
4. Verify all tables were created under **Table Editor**
5. (Optional) Run `supabase/seed.sql` to add sample data for testing

### Enable pg_cron (for payment plan status updates)

1. Go to **Database → Extensions** in Supabase dashboard
2. Search for `pg_cron` and enable it
3. The `update_payment_plan_status()` function and cron schedule are included in schema.sql

### Enable Realtime

1. Go to **Database → Replication** in Supabase dashboard
2. Ensure `deals` and `payment_plans` tables have realtime enabled
3. This is handled by the schema.sql but verify it's active

## 3. Get Your Supabase Keys

1. Go to **Settings → API** in your Supabase dashboard
2. Copy the **Project URL** (`https://xxxxx.supabase.co`)
3. Copy the **anon/public key** (starts with `eyJ...`)

## 4. Local Development

```bash
# Clone the repo
git clone <your-repo-url>
cd wetrade-sales-dashboard

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env and add your Supabase credentials
# VITE_SUPABASE_URL=https://xxxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...

# Start dev server
npm run dev
```

## 5. Push to GitHub

```bash
git add .
git commit -m "WeTrade sales dashboard"
git push origin main
```

## 6. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New → Project**
3. Import your GitHub repository
4. Framework Preset will auto-detect **Vite**
5. Add environment variables (see `.env.example` for the full list):
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
   - `SUPABASE_URL` → same URL (for server-side API routes)
   - `SUPABASE_SERVICE_ROLE_KEY` → from Supabase Settings → API
   - Plus Slack and Fathom vars (see `API_SETUP.md`)
6. Click **Deploy**
7. Your dashboard will be live at `https://your-project.vercel.app`

## 7. Set Up Integrations

Follow `API_SETUP.md` for complete step-by-step instructions to set up:
- **Slack** — auto-captures deals and EOD reports from your Slack channels
- **Fathom** — daily sync of call data from Fathom (runs automatically via Vercel Cron)

## Troubleshooting

- **Blank page**: Check browser console for errors. Verify env vars are set correctly.
- **No data showing**: Check Supabase table editor to confirm data exists. Check RLS policies.
- **Realtime not working**: Verify realtime is enabled on the tables in Supabase dashboard.
- **Build fails on Vercel**: Ensure all env vars are prefixed with `VITE_`.
