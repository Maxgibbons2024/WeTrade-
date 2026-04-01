-- Unique clients: 48
-- PIF deals: 5
-- PP deals (with payment plans): 43
-- WeTrade Historical Data Import
-- Run in Supabase SQL Editor

-- Step 0: Clear existing data
DELETE FROM payment_receipts;
DELETE FROM payment_plans;
DELETE FROM eod_calls;
DELETE FROM fathom_calls;
DELETE FROM deals;

-- Step 1: Update closer constraint
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_closer_id_check;
ALTER TABLE deals ADD CONSTRAINT deals_closer_id_check
  CHECK (closer_id IN ('lloyd','dave','zak','joe','shea','chris'));

-- Step 2: Insert deals (one per unique client)
INSERT INTO deals (created_at, client_name, closer_name, closer_id, front_end, monthly_amount, programme, source, payment_method, status) VALUES
  ('2025-11-28', 'Steven Taylor-Smith', 'Lloyd', 'lloyd', 1000.0, 1000.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2025-01-20', 'Rosie Hunt', 'Lloyd', 'lloyd', 500.0, 500.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2025-09-01', 'Car', 'Lloyd', 'lloyd', 500.0, 500.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2025-05-07', 'Ahmet Eker', 'Lloyd', 'lloyd', 500.0, 500.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-01-30', 'Glyn Huges', 'Shea', 'shea', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-02-02', 'Julie Miller', 'Zak', 'zak', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-03-03', 'Michael Parker', 'Shea', 'shea', 5000.0, 0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-12-10', 'Adam Kyriacou', 'Zak', 'zak', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-02-04', 'Suvanne southgate', 'Zak', 'zak', 1000.0, 1000.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-02-04', 'Ahmad Waqas', 'Zak', 'zak', 2000.0, 2000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-01-03', 'Afice Folorunsho Jimoh', 'Zak', 'zak', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-03-05', 'Linda Ho', 'Lloyd', 'lloyd', 5000.0, 0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-03-05', 'lonsb65@gmail.com', 'Joe', 'joe', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-12-11', 'Neil Howe', 'Zak', 'zak', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-02-05', 'William Jenkins', 'Shea', 'shea', 1500.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-03-06', 'Freya Locke', 'Lloyd', 'lloyd', 2000.0, 750.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-02-10', 'Darren Layden', 'Zak', 'zak', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-10-14', 'Nicholas Blakemore', 'Zak', 'zak', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-03-10', 'Paul Karimlar', 'Zak', 'zak', 1000.0, 1000.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-02-10', 'Steve Swindon', 'Lloyd', 'lloyd', 500.0, 500.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2025-12-13', 'Michael Amaeshike', 'Zak', 'zak', 250.0, 250.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-01-13', 'Brad McKenzie', 'Dave', 'dave', 2000.0, 4000.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-02-13', 'Bob Wilkinson', 'Zak', 'zak', 250.0, 250.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-01-16', 'Adrian Sunderman', 'Zak', 'zak', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-03-16', 'Omid Atr Forosh', 'Dave', 'dave', 2000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-03-19', 'Imran Iqbal', 'Zak', 'zak', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-02-16', 'Sean Bushell', 'Zak', 'zak', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-02-10', 'Harry Haynes', 'Shea', 'shea', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-12-19', 'Robin Taylor', 'Lloyd', 'lloyd', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-03-18', 'Stuart Hodgson', 'Zak', 'zak', 5000.0, 0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-01-14', 'Adrian Lockstone', 'Chris', 'chris', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-12-23', 'Robert Goodfellow', 'Lloyd', 'lloyd', 400.0, 400.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-02-08', 'Tim Canning', 'Zak', 'zak', 2000.0, 1000.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2025-11-25', 'Oskar Winberg', 'Dave', 'dave', 500.0, 500.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2025-10-09', 'Annenilan Arulgnanaseelan', 'Dave', 'dave', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-02-21', 'Ryan Newson', 'Dave', 'dave', 250.0, 250.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-11-27', 'Magnus Larsson', 'Dave', 'dave', 750.0, 750.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-02-27', 'David Elliott', 'Joe', 'joe', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-01-26', 'Joanna Fossey', 'Zak', 'zak', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-11-26', 'Nicholas Hubbard', 'Zak', 'zak', 1000.0, 1000.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-03-27', 'Matt Oldroyd', 'Zak', 'zak', 5000.0, 0, 'Pro', 'manual', 'stripe', 'active'),
  ('2025-11-27', 'M Hassen', 'Zak', 'zak', 250.0, 250.0, 'Kickstarter', 'manual', 'bank_transfer', 'active'),
  ('2026-01-26', 'Issac Cheung', 'Shea', 'shea', 1000.0, 1000.0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2025-02-09', 'Paul Rudkowskyj', 'Dave', 'dave', 1500.0, 1500.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-03-31', 'Layton Robinson', 'Dave', 'dave', 2000.0, 500.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-03-31', 'Stuart Crane', 'Dave', 'dave', 1500.0, 700.0, 'Pro', 'manual', 'stripe', 'active'),
  ('2026-04-01', 'Julian Boden', 'Lloyd', 'lloyd', 5000.0, 0, 'Kickstarter', 'manual', 'stripe', 'active'),
  ('2026-04-01', 'Samson Habte', 'Zak', 'zak', 500.0, 500.0, 'Kickstarter', 'manual', 'stripe', 'active');

-- Step 3: Insert payment plans (PP clients only)
INSERT INTO payment_plans (client_name, closer_id, monthly_amount, total_value, total_collected, months_remaining, next_due_date, status, last_payment_date, last_payment_confirmed) VALUES
  ('Steven Taylor-Smith', 'lloyd', 1000.0, 8000.0, 7000.0, 1, '2026-04-27', 'active', '2026-03-27', true),
  ('Rosie Hunt', 'lloyd', 500.0, 8000.0, 6500.0, 3, '2026-04-27', 'active', '2026-03-27', true),
  ('Car', 'lloyd', 500.0, 8000.0, 4000.0, 4, '2026-05-01', 'active', '2026-04-01', true),
  ('Ahmet Eker', 'lloyd', 500.0, 8000.0, 7000.0, 2, '2026-04-28', 'active', '2026-03-30', true),
  ('Glyn Huges', 'shea', 1000.0, 5000.0, 2000.0, 3, '2026-04-03', 'active', '2026-03-03', true),
  ('Julie Miller', 'zak', 500.0, 5000.0, 2500.0, 5, '2026-04-03', 'active', '2026-03-03', true),
  ('Adam Kyriacou', 'zak', 1000.0, 5000.0, 4000.0, 1, '2026-04-03', 'active', '2026-03-03', true),
  ('Suvanne southgate', 'zak', 1000.0, 8000.0, 6000.0, 2, '2026-04-04', 'active', '2026-03-04', true),
  ('Ahmad Waqas', 'zak', 2000.0, 5000.0, 3000.0, 1, '2026-04-04', 'active', '2026-03-04', true),
  ('Afice Folorunsho Jimoh', 'zak', 500.0, 5000.0, 3000.0, 4, '2026-04-04', 'active', '2026-03-04', true),
  ('lonsb65@gmail.com', 'joe', 500.0, 5000.0, 500.0, 9, '2026-04-05', 'active', '2026-03-05', true),
  ('Neil Howe', 'zak', 1000.0, 5000.0, 4000.0, 1, '2026-04-06', 'active', '2026-03-06', true),
  ('William Jenkins', 'shea', 1000.0, 5000.0, 4000.0, 1, '2026-04-06', 'active', '2026-03-06', true),
  ('Freya Locke', 'lloyd', 750.0, 5000.0, 2000.0, 4, '2026-04-06', 'active', '2026-03-06', true),
  ('Darren Layden', 'zak', 1000.0, 5000.0, 2000.0, 3, '2026-04-10', 'active', '2026-03-10', true),
  ('Nicholas Blakemore', 'zak', 500.0, 5000.0, 3000.0, 4, '2026-04-10', 'active', '2026-03-10', true),
  ('Paul Karimlar', 'zak', 1000.0, 8000.0, 4000.0, 4, '2026-04-12', 'active', '2026-03-12', true),
  ('Steve Swindon', 'lloyd', 500.0, 8000.0, 5500.0, 5, '2026-04-12', 'active', '2026-03-12', true),
  ('Michael Amaeshike', 'zak', 250.0, 5000.0, 2750.0, 9, '2026-04-13', 'active', '2026-03-13', true),
  ('Brad McKenzie', 'dave', 4000.0, 8000.0, 8000.0, 0, '2026-04-13', 'completed', '2026-03-13', true),
  ('Bob Wilkinson', 'zak', 250.0, 5000.0, 2250.0, 11, '2026-04-14', 'active', '2026-03-14', true),
  ('Adrian Sunderman', 'zak', 1000.0, 5000.0, 4000.0, 1, '2026-04-16', 'active', '2026-03-16', true),
  ('Omid Atr Forosh', 'dave', 1000.0, 5000.0, 2000.0, 3, '2026-04-16', 'active', '2026-03-16', true),
  ('Imran Iqbal', 'zak', 1000.0, 5000.0, 1000.0, 4, '2026-04-16', 'active', '2026-03-16', true),
  ('Sean Bushell', 'zak', 1000.0, 5000.0, 3000.0, 2, '2026-04-17', 'active', '2026-03-17', true),
  ('Harry Haynes', 'shea', 1000.0, 5000.0, 2000.0, 3, '2026-04-17', 'active', '2026-03-17', true),
  ('Robin Taylor', 'lloyd', 500.0, 5000.0, 3000.0, 4, '2026-04-18', 'active', '2026-03-18', true),
  ('Adrian Lockstone', 'chris', 1000.0, 5000.0, 2000.0, 3, '2026-04-18', 'active', '2026-03-18', true),
  ('Robert Goodfellow', 'lloyd', 400.0, 8000.0, 5400.0, 1, '2026-04-23', 'active', '2026-03-23', true),
  ('Tim Canning', 'zak', 1000.0, 8000.0, 4000.0, 4, '2026-04-23', 'active', '2026-03-23', true),
  ('Oskar Winberg', 'dave', 500.0, 5000.0, 4000.0, 2, '2026-04-25', 'active', '2026-03-25', true),
  ('Annenilan Arulgnanaseelan', 'dave', 500.0, 5000.0, 4500.0, 1, '2026-04-26', 'active', '2026-03-26', true),
  ('Ryan Newson', 'dave', 250.0, 5000.0, 4250.0, 3, '2026-04-27', 'active', '2026-03-27', true),
  ('Magnus Larsson', 'dave', 750.0, 8000.0, 5000.0, 4, '2026-04-27', 'active', '2026-03-27', true),
  ('David Elliott', 'joe', 500.0, 5000.0, 1500.0, 7, '2026-04-27', 'active', '2026-03-27', true),
  ('Joanna Fossey', 'zak', 500.0, 5000.0, 3000.0, 4, '2026-04-27', 'active', '2026-03-27', true),
  ('Nicholas Hubbard', 'zak', 1000.0, 8000.0, 5000.0, 3, '2026-04-27', 'active', '2026-03-27', true),
  ('M Hassen', 'zak', 250.0, 5000.0, 2500.0, 10, '2026-04-28', 'active', '2026-03-28', true),
  ('Issac Cheung', 'shea', 1000.0, 5000.0, 4000.0, 1, '2026-04-28', 'active', '2026-03-28', true),
  ('Paul Rudkowskyj', 'dave', 1500.0, 8000.0, 6500.0, 1, '2026-04-28', 'active', '2026-03-29', true),
  ('Layton Robinson', 'dave', 500.0, 5000.0, 2000.0, 6, '2026-04-28', 'active', '2026-03-31', true),
  ('Stuart Crane', 'dave', 700.0, 5000.0, 1500.0, 5, '2026-04-28', 'active', '2026-03-31', true),
  ('Samson Habte', 'zak', 500.0, 5000.0, 2500.0, 5, '2026-05-01', 'active', '2026-04-01', true);

-- Summary: 48 unique deals, 43 payment plans, 5 PIF deals
