-- Insert payment plans from spreadsheet (April 2026)
-- Run this in Supabase SQL Editor

INSERT INTO payment_plans (client_name, closer_id, monthly_amount, total_value, total_collected, months_remaining, next_due_date, status, notes)
VALUES
  ('Bob Wilkinson',    'zak',   250,  5000, 2250, 11, '2026-04-14', 'active', NULL),
  ('Sean Bushell',     'zak',  1000,  5000, 3000,  2, '2026-04-16', 'active', NULL),
  ('Adrian Sunderman', 'zak',  1000,  5000, 4000,  1, '2026-04-16', 'active', NULL),
  ('Richard de silva', 'zak',  3000,  5000, 2000,  1, '2026-04-16', 'active', 'Told us he''ll be paying in full owes £3k'),
  ('Omid Atr Forosh',  'dave', 1000,  5000, 2000,  3, '2026-04-16', 'active', NULL),
  ('Imran Iqbal',      'zak',  1000,  5000, 1000,  4, '2026-04-16', 'active', NULL),
  ('Harry Haynes',     'shea', 1000,  5000, 2000,  3, '2026-04-17', 'active', NULL),
  ('Robin Taylor',     'lloyd',  500, 5000, 3000,  4, '2026-04-18', 'active', NULL);
