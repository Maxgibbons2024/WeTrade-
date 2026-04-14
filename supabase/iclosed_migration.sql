-- ============================================================
-- iClosed Integration Migration
-- Run this once in the Supabase SQL Editor to create the tables
-- needed for the iClosed sync (api/iclosed/sync.js).
-- Safe to re-run.
-- ============================================================

-- Maps iClosed user IDs to internal closer/setter IDs
create table if not exists iclosed_users (
  iclosed_user_id text primary key,
  internal_id     text not null,
  role            text not null check (role in ('closer','setter')),
  display_name    text not null,
  active          boolean not null default true
);

-- One row per iClosed event call (synced every 15 min)
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

-- RLS
alter table iclosed_users enable row level security;
alter table iclosed_calls enable row level security;

drop policy if exists "Public full access on iclosed_users"  on iclosed_users;
drop policy if exists "Public full access on iclosed_calls"  on iclosed_calls;

create policy "Public full access on iclosed_users"
  on iclosed_users for all using (true) with check (true);

create policy "Public full access on iclosed_calls"
  on iclosed_calls for all using (true) with check (true);

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table iclosed_calls;
  exception when duplicate_object then null;
  end;
end $$;
