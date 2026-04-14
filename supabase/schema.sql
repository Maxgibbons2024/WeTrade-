-- WeTrade Sales Dashboard — Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables, RLS policies, and cron function.

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  client_name text not null,
  closer_name text not null,
  closer_id text not null check (closer_id in ('lloyd','dave','zak','joe','shea','chris')),
  front_end numeric not null default 0,
  monthly_amount numeric not null default 0,
  programme text not null check (programme in ('Kickstarter','Mechanical Mastery','Pro','Elite')),
  onboarding_date timestamptz,
  onboarding_assigned_to text,
  source text not null default 'manual' check (source in ('slack','stripe','manual')),
  payment_method text not null default 'stripe' check (payment_method in ('stripe','paypal','bank_transfer','mamo')),
  notes text,
  status text not null default 'active' check (status in ('onboarding','active','follow_up','lost')),
  stripe_payment_id text,
  call_booked_at timestamptz,
  -- Community fields (managed by community manager)
  mentor_name text,
  session_count int not null default 0,
  sessions_total int,  -- null = Pro Group (unlimited)
  last_session_date date,
  trustpilot_review boolean not null default false,
  no_show_count int not null default 0,
  prop_firm_name text,
  prop_funded_amount numeric,
  community_notes text,
  email text
);

create table if not exists payment_plans (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete cascade,
  client_name text not null,
  closer_id text not null,
  monthly_amount numeric not null default 0,
  total_value numeric not null default 0,
  total_collected numeric not null default 0,
  months_remaining int not null default 0,
  next_due_date date not null,
  status text not null default 'active' check (status in ('active','overdue','due_soon','completed')),
  last_payment_date date,
  last_payment_confirmed boolean not null default false,
  notes text
);

create table if not exists eod_calls (
  id uuid primary key default gen_random_uuid(),
  report_date date not null default current_date,
  closer_id text not null,
  closer_name text not null,
  client_name text not null,
  outcome text not null check (outcome in ('closed','no_show','follow_up','not_interested','rescheduled')),
  deal_value numeric,
  notes text,
  slack_message_ts text,
  raw_text text
);

create table if not exists fathom_calls (
  id uuid primary key default gen_random_uuid(),
  call_date date not null,
  closer_id text not null,
  closer_name text not null,
  fathom_call_id text not null,
  duration_seconds int not null default 0,
  talk_time_seconds int not null default 0,
  outcome text,
  no_show boolean not null default false,
  transcript_url text
);

create table if not exists manual_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  client_name text not null,
  amount numeric not null,
  payment_method text not null check (payment_method in ('paypal','bank_transfer','mamo')),
  payment_date date not null default current_date,
  deal_id uuid references deals(id) on delete set null,
  notes text,
  added_by text not null
);

create table if not exists payment_receipts (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz default now(),
  client_name text not null,
  amount numeric not null,
  success boolean not null default true,
  payment_plan_id uuid references payment_plans(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  slack_message_ts text,
  raw_text text,
  matched boolean not null default false
);

-- ============================================================
-- iCLOSED INTEGRATION
-- ============================================================

-- Maps iClosed user IDs to internal closer/setter IDs
create table if not exists iclosed_users (
  iclosed_user_id text primary key,
  internal_id     text not null,
  role            text not null check (role in ('closer','setter')),
  display_name    text not null,
  active          boolean not null default true
);

-- One row per iClosed event call (synced every 15 min by api/iclosed/sync.js)
create table if not exists iclosed_calls (
  id                 text primary key,
  contact_id         text,
  contact_name       text,
  contact_email      text,
  scheduled_at       timestamptz not null,
  ended_at           timestamptz,
  status             text,
  outcome            text,
  closer_iclosed_id  text,
  closer_id          text,
  setter_iclosed_id  text,
  setter_id          text,
  event_type         text,
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  utm_content        text,
  utm_term           text,
  referrer           text,
  deal_id            uuid references deals(id) on delete set null,
  deal_value         numeric,
  raw                jsonb not null,
  synced_at          timestamptz not null default now()
);

create index if not exists idx_iclosed_calls_scheduled  on iclosed_calls (scheduled_at desc);
create index if not exists idx_iclosed_calls_closer     on iclosed_calls (closer_id);
create index if not exists idx_iclosed_calls_setter     on iclosed_calls (setter_id);
create index if not exists idx_iclosed_calls_utm_source on iclosed_calls (utm_source);
create index if not exists idx_iclosed_calls_utm_medium on iclosed_calls (utm_medium);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table deals enable row level security;
alter table payment_plans enable row level security;
alter table eod_calls enable row level security;
alter table fathom_calls enable row level security;
alter table manual_payments enable row level security;
alter table payment_receipts enable row level security;
alter table iclosed_users enable row level security;
alter table iclosed_calls enable row level security;

-- Policies: allow all operations for all users (including anon key)
create policy "Public full access on deals"
  on deals for all using (true) with check (true);

create policy "Public full access on payment_plans"
  on payment_plans for all using (true) with check (true);

create policy "Public full access on eod_calls"
  on eod_calls for all using (true) with check (true);

create policy "Public full access on fathom_calls"
  on fathom_calls for all using (true) with check (true);

create policy "Public full access on manual_payments"
  on manual_payments for all using (true) with check (true);

create policy "Public full access on payment_receipts"
  on payment_receipts for all using (true) with check (true);

create policy "Public full access on iclosed_users"
  on iclosed_users for all using (true) with check (true);

create policy "Public full access on iclosed_calls"
  on iclosed_calls for all using (true) with check (true);

-- ============================================================
-- REALTIME
-- ============================================================

alter publication supabase_realtime add table deals;
alter publication supabase_realtime add table payment_plans;
alter publication supabase_realtime add table payment_receipts;
alter publication supabase_realtime add table iclosed_calls;

-- ============================================================
-- CRON: update_payment_plan_status()
-- Requires pg_cron extension (enabled by default on Supabase)
-- ============================================================

create or replace function update_payment_plan_status()
returns void as $$
begin
  -- Mark overdue
  update payment_plans
  set status = 'overdue'
  where next_due_date < current_date
    and status not in ('completed', 'overdue');

  -- Mark due_soon (within 5 days)
  update payment_plans
  set status = 'due_soon'
  where next_due_date >= current_date
    and next_due_date <= current_date + interval '5 days'
    and status not in ('completed', 'overdue', 'due_soon');
end;
$$ language plpgsql security definer;

-- Schedule daily at 06:00 UTC
select cron.schedule(
  'update-payment-plan-status',
  '0 6 * * *',
  $$ select update_payment_plan_status(); $$
);
