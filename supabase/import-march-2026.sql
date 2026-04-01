-- WeTrade March 2026 Historical Data Import
-- Run this in the Supabase SQL Editor

-- ============================================================
-- STEP 1: Update closer_id constraint to include Shea and Chris
-- ============================================================

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_closer_id_check;
ALTER TABLE deals ADD CONSTRAINT deals_closer_id_check
  CHECK (closer_id IN ('lloyd','dave','zak','joe','shea','chris'));

ALTER TABLE eod_calls DROP CONSTRAINT IF EXISTS eod_calls_closer_id_check;

-- ============================================================
-- STEP 2: Insert March 2026 Deals
-- ============================================================

-- Lloyd's deals
INSERT INTO deals (client_name, closer_name, closer_id, front_end, monthly_amount, programme, source, payment_method, status, created_at)
VALUES
  ('Julian Boden', 'Lloyd', 'lloyd', 5000, 0, 'Elite', 'manual', 'stripe', 'active', '2026-03-01T10:00:00Z'),
  ('Louis McKenzie', 'Lloyd', 'lloyd', 3000, 250, 'Pro', 'manual', 'stripe', 'active', '2026-03-01T10:00:00Z'),
  ('Finley Grant', 'Lloyd', 'lloyd', 500, 200, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-03T10:00:00Z'),
  ('Rory Campbell', 'Lloyd', 'lloyd', 1000, 250, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-03T10:00:00Z'),
  ('Alexander Lewis', 'Lloyd', 'lloyd', 2000, 300, 'Pro', 'manual', 'stripe', 'active', '2026-03-04T10:00:00Z'),
  ('Ethan Walsh', 'Lloyd', 'lloyd', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-05T10:00:00Z'),
  ('James O''Sullivan', 'Lloyd', 'lloyd', 1500, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-07T10:00:00Z'),
  ('Nathan Brooks', 'Lloyd', 'lloyd', 3000, 300, 'Pro', 'manual', 'stripe', 'active', '2026-03-10T10:00:00Z'),
  ('Connor Reid', 'Lloyd', 'lloyd', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-12T10:00:00Z'),
  ('Harry Sutton', 'Lloyd', 'lloyd', 2500, 250, 'Pro', 'manual', 'stripe', 'active', '2026-03-15T10:00:00Z'),
  ('Leo Patterson', 'Lloyd', 'lloyd', 1000, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-18T10:00:00Z'),
  ('Oliver Hughes', 'Lloyd', 'lloyd', 5000, 0, 'Elite', 'manual', 'stripe', 'active', '2026-03-20T10:00:00Z'),
  ('George Mitchell', 'Lloyd', 'lloyd', 500, 175, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-22T10:00:00Z'),
  ('Ryan Clarke', 'Lloyd', 'lloyd', 2000, 250, 'Pro', 'manual', 'stripe', 'active', '2026-03-25T10:00:00Z'),
  ('Daniel Foster', 'Lloyd', 'lloyd', 1500, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-28T10:00:00Z');

-- Dave's deals
INSERT INTO deals (client_name, closer_name, closer_id, front_end, monthly_amount, programme, source, payment_method, status, created_at)
VALUES
  ('Marcus Johnson', 'Dave', 'dave', 1000, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-01T10:00:00Z'),
  ('Tyler Bennett', 'Dave', 'dave', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-02T10:00:00Z'),
  ('Callum Ward', 'Dave', 'dave', 2000, 250, 'Pro', 'manual', 'stripe', 'active', '2026-03-04T10:00:00Z'),
  ('Adam Fisher', 'Dave', 'dave', 500, 175, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-06T10:00:00Z'),
  ('Luke Harrison', 'Dave', 'dave', 3000, 300, 'Pro', 'manual', 'stripe', 'active', '2026-03-08T10:00:00Z'),
  ('Ben Taylor', 'Dave', 'dave', 1500, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-11T10:00:00Z'),
  ('Tom Edwards', 'Dave', 'dave', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-14T10:00:00Z'),
  ('Sam Wright', 'Dave', 'dave', 2500, 275, 'Pro', 'manual', 'stripe', 'active', '2026-03-17T10:00:00Z'),
  ('Jake Morgan', 'Dave', 'dave', 1000, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-21T10:00:00Z'),
  ('Chris Evans', 'Dave', 'dave', 5000, 0, 'Elite', 'manual', 'stripe', 'active', '2026-03-24T10:00:00Z');

-- Zak's deals
INSERT INTO deals (client_name, closer_name, closer_id, front_end, monthly_amount, programme, source, payment_method, status, created_at)
VALUES
  ('Aiden Murphy', 'Zak', 'zak', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-01T10:00:00Z'),
  ('Kai Robinson', 'Zak', 'zak', 2000, 250, 'Pro', 'manual', 'stripe', 'active', '2026-03-03T10:00:00Z'),
  ('Max Turner', 'Zak', 'zak', 1000, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-05T10:00:00Z'),
  ('Liam Cooper', 'Zak', 'zak', 3000, 300, 'Pro', 'manual', 'stripe', 'active', '2026-03-09T10:00:00Z'),
  ('Noah Jenkins', 'Zak', 'zak', 500, 175, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-13T10:00:00Z'),
  ('Oscar Barnes', 'Zak', 'zak', 1500, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-16T10:00:00Z'),
  ('Alfie Palmer', 'Zak', 'zak', 5000, 0, 'Elite', 'manual', 'stripe', 'active', '2026-03-19T10:00:00Z'),
  ('Charlie Stevens', 'Zak', 'zak', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-23T10:00:00Z');

-- Joe's deals
INSERT INTO deals (client_name, closer_name, closer_id, front_end, monthly_amount, programme, source, payment_method, status, created_at)
VALUES
  ('Will Simpson', 'Joe', 'joe', 1000, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-02T10:00:00Z'),
  ('Jack Henderson', 'Joe', 'joe', 2000, 250, 'Pro', 'manual', 'stripe', 'active', '2026-03-06T10:00:00Z'),
  ('Freddie Cole', 'Joe', 'joe', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-10T10:00:00Z'),
  ('Archie Dixon', 'Joe', 'joe', 3000, 300, 'Pro', 'manual', 'stripe', 'active', '2026-03-14T10:00:00Z'),
  ('Henry Russell', 'Joe', 'joe', 1500, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-19T10:00:00Z'),
  ('Theo Marshall', 'Joe', 'joe', 500, 175, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-23T10:00:00Z');

-- Shea's deals
INSERT INTO deals (client_name, closer_name, closer_id, front_end, monthly_amount, programme, source, payment_method, status, created_at)
VALUES
  ('Declan Murray', 'Shea', 'shea', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-03T10:00:00Z'),
  ('Sean Kelly', 'Shea', 'shea', 2000, 250, 'Pro', 'manual', 'stripe', 'active', '2026-03-07T10:00:00Z'),
  ('Ciaran Walsh', 'Shea', 'shea', 1000, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-12T10:00:00Z'),
  ('Patrick Doyle', 'Shea', 'shea', 500, 175, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-17T10:00:00Z'),
  ('Ronan Quinn', 'Shea', 'shea', 3000, 300, 'Pro', 'manual', 'stripe', 'active', '2026-03-22T10:00:00Z');

-- Chris's deals
INSERT INTO deals (client_name, closer_name, closer_id, front_end, monthly_amount, programme, source, payment_method, status, created_at)
VALUES
  ('Mike Thornton', 'Chris', 'chris', 1500, 200, 'Mechanical Mastery', 'manual', 'stripe', 'active', '2026-03-02T10:00:00Z'),
  ('Ashley Reed', 'Chris', 'chris', 500, 150, 'Kickstarter', 'manual', 'stripe', 'active', '2026-03-08T10:00:00Z'),
  ('Jordan Watts', 'Chris', 'chris', 2500, 275, 'Pro', 'manual', 'stripe', 'active', '2026-03-15T10:00:00Z'),
  ('Rob Pearson', 'Chris', 'chris', 5000, 0, 'Elite', 'manual', 'stripe', 'active', '2026-03-26T10:00:00Z');

-- ============================================================
-- STEP 3: Insert Payment Plans (for deals with monthly_amount > 0)
-- ============================================================

-- We create payment plans linked by client_name lookup
-- Each plan: 12 months total, first payment = front_end already collected

-- Lloyd's payment plans
INSERT INTO payment_plans (deal_id, client_name, closer_id, monthly_amount, total_value, total_collected, months_remaining, next_due_date, status)
SELECT d.id, d.client_name, d.closer_id, d.monthly_amount,
  d.front_end + (d.monthly_amount * 12),
  d.front_end,
  12,
  (d.created_at::date + interval '1 month')::date,
  CASE
    WHEN (d.created_at::date + interval '1 month')::date < CURRENT_DATE THEN 'overdue'
    WHEN (d.created_at::date + interval '1 month')::date <= CURRENT_DATE + interval '5 days' THEN 'due_soon'
    ELSE 'active'
  END
FROM deals d
WHERE d.monthly_amount > 0
  AND d.source = 'manual'
  AND d.created_at >= '2026-03-01'
  AND d.created_at < '2026-04-01'
  AND NOT EXISTS (
    SELECT 1 FROM payment_plans pp WHERE pp.deal_id = d.id
  );
