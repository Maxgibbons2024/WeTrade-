import { getSupabaseAdmin } from '../_lib/supabase.js';
import { iclosedFetch } from '../_lib/iclosed.js';

// Backfill the booked_at column on iclosed_calls.
// iClosed's /v1/eventCalls?from=X&to=Y filters by BOOKING date (not scheduled).
// So we hit it day-by-day: each day's response = calls booked on that day.
// For each call returned, set booked_at = that day (noon UTC).
//
// Hit /api/iclosed/backfill-booked-at?key=YOUR_CRON_SECRET
//   ?since=YYYY-MM-DD  default: 14 days ago
//   ?until=YYYY-MM-DD  default: today

const MAX_PAGES_PER_DAY = 5; // Each day capped at 5 pages * 100 = 500 calls

async function fetchDayCallIds(dateStr) {
  // iClosed's pagination uses page=N (1-indexed) for /v1/eventCalls
  const ids = new Set();
  for (let page = 1; page <= MAX_PAGES_PER_DAY; page++) {
    const url = `/v1/eventCalls?from=${dateStr}T00:00:00Z&to=${dateStr}T23:59:59Z&limit=100&page=${page}`;
    const json = await iclosedFetch(url);
    const items = json?.data?.eventCalls || [];
    if (items.length === 0) break;
    for (const item of items) {
      const id = item?.id ?? item?.callId;
      if (id != null) ids.add(String(id));
    }
    if (items.length < 100) break;
  }
  return Array.from(ids);
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const queryKey = req.query?.key;
    if (!queryKey || queryKey !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  if (!process.env.ICLOSED_API_KEY) {
    return res.status(500).json({ error: 'Missing ICLOSED_API_KEY' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Determine date range
    let since = req.query?.since;
    let until = req.query?.until;
    if (!since) {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      since = d.toISOString().split('T')[0];
    }
    if (!until) {
      until = new Date().toISOString().split('T')[0];
    }

    // Build the list of dates to process
    const days = [];
    const cursor = new Date(`${since}T00:00:00Z`);
    const end = new Date(`${until}T00:00:00Z`);
    while (cursor <= end) {
      days.push(cursor.toISOString().split('T')[0]);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const perDay = [];
    let totalUpdated = 0;
    const errors = [];

    for (const dateStr of days) {
      try {
        const ids = await fetchDayCallIds(dateStr);
        if (ids.length === 0) {
          perDay.push({ date: dateStr, calls: 0, updated: 0 });
          continue;
        }
        // Set booked_at to noon UTC of this day so it's safely "in the day"
        // regardless of viewer timezone.
        const bookedAt = `${dateStr}T12:00:00Z`;
        // Update in batches of 500 ids (Postgres IN clause limit safety)
        let updated = 0;
        for (let i = 0; i < ids.length; i += 500) {
          const slice = ids.slice(i, i + 500);
          const { error, count } = await supabase
            .from('iclosed_calls')
            .update({ booked_at: bookedAt })
            .in('id', slice)
            .select('id', { count: 'exact', head: true });
          if (error) {
            errors.push(`${dateStr}: ${error.message}`);
          } else {
            updated += count || slice.length;
          }
        }
        totalUpdated += updated;
        perDay.push({ date: dateStr, calls: ids.length, updated });
      } catch (err) {
        errors.push(`${dateStr}: ${err.message}`);
        perDay.push({ date: dateStr, error: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      since,
      until,
      daysProcessed: days.length,
      totalUpdated,
      perDay,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('iClosed backfill-booked-at error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { runtime: 'nodejs', maxDuration: 300 };
