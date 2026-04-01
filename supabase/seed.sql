-- WeTrade Sales Dashboard — Sample Seed Data
-- Run AFTER schema.sql if you want test data in the dashboard.

-- Deals
insert into deals (client_name, closer_name, closer_id, front_end, monthly_amount, programme, onboarding_date, onboarding_assigned_to, source, payment_method, status) values
  ('Layton Robinson',   'Lloyd', 'lloyd', 2000, 500,  'Pro',                '2026-04-02 11:00:00+00', 'Sam Ducker', 'slack',  'stripe',        'onboarding'),
  ('Marcus Chen',       'Dave',  'dave',  3500, 0,    'Elite',              '2026-03-28 14:00:00+00', 'Sam Ducker', 'manual', 'stripe',        'active'),
  ('Sophie Williams',   'Zak',   'zak',   1500, 300,  'Kickstarter',        null,                      null,         'slack',  'paypal',        'active'),
  ('James O''Brien',    'Joe',   'joe',   2500, 400,  'Mechanical Mastery', '2026-04-01 09:00:00+00', 'Sam Ducker', 'manual', 'bank_transfer', 'onboarding'),
  ('Richard Preston',   'Lloyd', 'lloyd', 1800, 350,  'Pro',                null,                      null,         'slack',  'stripe',        'follow_up'),
  ('Amira Hassan',      'Dave',  'dave',  4000, 0,    'Elite',              '2026-03-25 10:00:00+00', 'Sam Ducker', 'stripe', 'stripe',        'active'),
  ('Tommy Nguyen',      'Zak',   'zak',   1200, 250,  'Kickstarter',        null,                      null,         'manual', 'mamo',          'active'),
  ('Elena Kowalski',    'Joe',   'joe',   2800, 450,  'Pro',                '2026-04-03 15:00:00+00', 'Sam Ducker', 'slack',  'stripe',        'onboarding'),
  ('Daniel Foster',     'Lloyd', 'lloyd', 3000, 0,    'Elite',              '2026-03-20 12:00:00+00', 'Sam Ducker', 'manual', 'bank_transfer', 'active'),
  ('Olivia Martinez',   'Dave',  'dave',  1600, 300,  'Mechanical Mastery', null,                      null,         'slack',  'paypal',        'follow_up');

-- Payment Plans
insert into payment_plans (deal_id, client_name, closer_id, monthly_amount, total_value, total_collected, months_remaining, next_due_date, status, last_payment_date) values
  ((select id from deals where client_name = 'Layton Robinson'),  'Layton Robinson',  'lloyd', 500, 6000,  500,  11, '2026-04-15', 'active',   '2026-03-15'),
  ((select id from deals where client_name = 'Sophie Williams'),  'Sophie Williams',  'zak',   300, 3600,  600,  10, '2026-04-01', 'due_soon', '2026-03-01'),
  ((select id from deals where client_name = 'James O''Brien'),   'James O''Brien',   'joe',   400, 4800,  0,    12, '2026-03-28', 'overdue',  null),
  ((select id from deals where client_name = 'Richard Preston'),  'Richard Preston',  'lloyd', 350, 4200,  1050, 9,  '2026-04-10', 'active',   '2026-03-10'),
  ((select id from deals where client_name = 'Tommy Nguyen'),     'Tommy Nguyen',     'zak',   250, 3000,  500,  10, '2026-04-05', 'due_soon', '2026-03-05'),
  ((select id from deals where client_name = 'Elena Kowalski'),   'Elena Kowalski',   'joe',   450, 5400,  0,    12, '2026-04-20', 'active',   null);

-- EOD Calls
insert into eod_calls (report_date, closer_id, closer_name, client_name, outcome, deal_value, notes) values
  ('2026-04-01', 'lloyd', 'Lloyd', 'Layton Robinson',  'closed',         2000, 'Great call, closed on Pro'),
  ('2026-04-01', 'lloyd', 'Lloyd', 'Richard Preston',  'follow_up',      null, 'Interested but wants to think about it'),
  ('2026-04-01', 'lloyd', 'Lloyd', 'Mark Stevens',     'no_show',        null, null),
  ('2026-04-01', 'dave',  'Dave',  'Marcus Chen',      'closed',         3500, 'Signed up for Elite'),
  ('2026-04-01', 'dave',  'Dave',  'Olivia Martinez',  'follow_up',      null, 'Sending over more info'),
  ('2026-04-01', 'dave',  'Dave',  'Peter Clarke',     'not_interested', null, 'Not the right time'),
  ('2026-04-01', 'zak',   'Zak',   'Sophie Williams',  'closed',         1500, 'Kickstarter sign-up'),
  ('2026-04-01', 'zak',   'Zak',   'Tom Hardy',        'no_show',        null, null),
  ('2026-04-01', 'joe',   'Joe',   'James O''Brien',   'closed',         2500, 'Mechanical Mastery'),
  ('2026-04-01', 'joe',   'Joe',   'Elena Kowalski',   'rescheduled',    null, 'Moved to Thursday');

-- Fathom Calls
insert into fathom_calls (call_date, closer_id, closer_name, fathom_call_id, duration_seconds, talk_time_seconds, outcome, no_show) values
  ('2026-04-01', 'lloyd', 'Lloyd', 'fathom_001', 1800, 1200, 'closed',    false),
  ('2026-04-01', 'lloyd', 'Lloyd', 'fathom_002', 900,  600,  'follow_up', false),
  ('2026-04-01', 'lloyd', 'Lloyd', 'fathom_003', 0,    0,    'no_show',   true),
  ('2026-04-01', 'dave',  'Dave',  'fathom_004', 2100, 1500, 'closed',    false),
  ('2026-04-01', 'dave',  'Dave',  'fathom_005', 1500, 900,  'follow_up', false),
  ('2026-04-01', 'dave',  'Dave',  'fathom_006', 1200, 800,  null,        false),
  ('2026-04-01', 'zak',   'Zak',   'fathom_007', 1600, 1100, 'closed',    false),
  ('2026-04-01', 'zak',   'Zak',   'fathom_008', 0,    0,    'no_show',   true),
  ('2026-04-01', 'joe',   'Joe',   'fathom_009', 2400, 1800, 'closed',    false),
  ('2026-04-01', 'joe',   'Joe',   'fathom_010', 1100, 700,  'rescheduled', false);

-- Manual Payments
insert into manual_payments (client_name, amount, payment_method, payment_date, deal_id, notes, added_by) values
  ('Sophie Williams', 300, 'paypal',        '2026-03-01', (select id from deals where client_name = 'Sophie Williams'), 'March payment',    'Max'),
  ('Tommy Nguyen',    250, 'mamo',          '2026-03-05', (select id from deals where client_name = 'Tommy Nguyen'),    'March payment',    'Max'),
  ('Daniel Foster',   500, 'bank_transfer', '2026-03-20', (select id from deals where client_name = 'Daniel Foster'),   'Additional payment','Max');
