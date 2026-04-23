import { getSupabaseAdmin } from '../_lib/supabase.js';
import {
  iclosedFetch,
  iclosedListOffset,
  normaliseCall,
  pick,
} from '../_lib/iclosed.js';
import { resolveInternal } from '../_lib/closers.js';

// Day-by-day iClosed sync.
//
// Why day-by-day: /v1/eventCalls has ~7000 rows total. Traditional pagination
// (limit=100, page=1..N) was consistently dropping the last ~100 calls — the
// tail of the result set — no matter what we tried (serial vs parallel, dup
// tolerance, offset vs page). That meant the most recent bookings (Connor's
// newly-set calls, today's reschedules) never landed in Supabase.
//
// The team books ~20–40 calls/day, well under iClosed's limit=100/request cap.
// So we query each day individually: 1 request per day = ZERO pagination risk.
// Total: ~44 requests per cron run (14 days back + 30 forward) × ~300ms each
// = ~15s. Easy fit inside the 300s maxDuration.
//
// Default window: today-14 → today+30.
//   * 14 back: catches reschedules, completions, cancellations on recently-
//     booked calls so our status/outcome fields stay fresh.
//   * 30 forward: captures all upcoming bookings — the core use case now that
//     we need to see Connor's set calls for the week ahead.

const DAYS_BACK = 14;
const DAYS_FORWARD = 30;

// Fetch all calls in one day via iClosed's from/to filter.
// Defensive: if a single day ever exceeds 100 calls, spill to page 2.
async function fetchDay(dateStr) {
  const from = `${dateStr}T00:00:00Z`;
  const to = `${dateStr}T23:59:59Z`;
  const url1 = `/v1/eventCalls?from=${from}&to=${to}&limit=100&page=1`;
  const json1 = await iclosedFetch(url1);
  const items = json1?.data?.eventCalls || [];

  if (items.length === 100) {
    // Rare overflow path — log so we notice if the team ever triples in size.
    const url2 = `/v1/eventCalls?from=${from}&to=${to}&limit=100&page=2`;
    const json2 = await iclosedFetch(url2);
    const more = json2?.data?.eventCalls || [];
    console.warn(`[iclosed/sync] ${dateStr} hit 100 calls — spilled to page 2 (+${more.length})`);
    items.push(...more);
  }

  return items;
}

// Seed iclosed_users from /v1/users on first run (when the mapping table is empty).
async function seedUsersIfEmpty(supabase) {
  const { data: existing, error } = await supabase
    .from('iclosed_users')
    .select('iclosed_user_id')
    .limit(1);
  if (error) throw error;
  if (existing && existing.length > 0) return { seeded: 0, alreadyPresent: true };

  console.log('[iclosed/sync] iclosed_users empty — auto-seeding from /v1/users');
  const users = await iclosedListOffset('/v1/users', { pageSize: 100, maxPages: 5 });
  const rows = [];
  for (const u of users) {
    const id = pick(u, 'id', 'userId');
    const name =
      pick(u, 'fullName', 'name', 'displayName') ||
      [pick(u, 'firstName'), pick(u, 'lastName')].filter(Boolean).join(' ');
    const rule = resolveInternal(name);
    if (!id || !rule) continue;
    rows.push({
      iclosed_user_id: String(id),
      internal_id: rule.internal_id,
      role: rule.role,
      display_name: name,
      active: true,
    });
  }
  if (rows.length) {
    const { error: upErr } = await supabase
      .from('iclosed_users')
      .upsert(rows, { onConflict: 'iclosed_user_id' });
    if (upErr) throw upErr;
  }
  return { seeded: rows.length, alreadyPresent: false };
}

// Build YYYY-MM-DD strings for a date range (inclusive both ends).
function dayList(startDate, endDate) {
  const days = [];
  const cur = new Date(startDate);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    days.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export default async function handler(req, res) {
  // Auth: Bearer header (Vercel cron) OR ?key= query param (browser bookmark).
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const queryKey = req.query?.key;
  const headerOk = !cronSecret || authHeader === `Bearer ${cronSecret}`;
  const queryOk = !cronSecret || queryKey === cronSecret;
  if (!headerOk && !queryOk) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.ICLOSED_API_KEY) {
    return res.status(500).json({ error: 'Missing ICLOSED_API_KEY environment variable' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const t0 = Date.now();

    // 1. Seed user mapping if empty
    const seedResult = await seedUsersIfEmpty(supabase);

    // 2. Load user mapping for closer/setter resolution
    const { data: users, error: usersErr } = await supabase.from('iclosed_users').select('*');
    if (usersErr) throw usersErr;
    const userMap = new Map((users || []).map((u) => [String(u.iclosed_user_id), u]));

    // 3. Compute day window
    const now = new Date();
    const defaultSince = new Date(now);
    defaultSince.setUTCDate(defaultSince.getUTCDate() - DAYS_BACK);
    const defaultUntil = new Date(now);
    defaultUntil.setUTCDate(defaultUntil.getUTCDate() + DAYS_FORWARD);

    const since = req.query?.since || defaultSince.toISOString().split('T')[0];
    const until = req.query?.until || defaultUntil.toISOString().split('T')[0];
    const days = dayList(since, until);

    // 4. Fetch each day serially. Each request is ~300ms and fully independent.
    const rawCalls = [];
    const byDay = {};
    const dayErrors = {};
    for (const day of days) {
      try {
        const calls = await fetchDay(day);
        byDay[day] = calls.length;
        rawCalls.push(...calls);
      } catch (err) {
        console.error(`[iclosed/sync] ${day} failed:`, err.message);
        dayErrors[day] = err.message;
        byDay[day] = null;
      }
    }

    if (!rawCalls.length) {
      return res.status(200).json({
        ok: true,
        message: 'No calls returned by iClosed for this window',
        since,
        until,
        daysQueried: days.length,
        byDay,
        dayErrors: Object.keys(dayErrors).length ? dayErrors : undefined,
      });
    }

    // 5. Dedupe by id (same call shouldn't appear across day queries, but be safe)
    const byId = new Map();
    for (const c of rawCalls) {
      const id = c.id ?? c.callId;
      if (id != null) byId.set(String(id), c);
    }
    const dedupedRaw = Array.from(byId.values());

    // 6. Pre-load deals for matching
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, client_name, email, front_end, created_at');
    if (dealsErr) throw dealsErr;

    const dealsByEmail = new Map();
    const dealsByName = new Map();
    for (const d of deals || []) {
      if (d.email) dealsByEmail.set(d.email.toLowerCase().trim(), d);
      if (d.client_name) {
        const k = d.client_name.toLowerCase().trim();
        if (!dealsByName.has(k)) dealsByName.set(k, []);
        dealsByName.get(k).push(d);
      }
    }

    // 7. Normalise + resolve closer/setter + match deal
    const bySetter = {};
    const rows = dedupedRaw.map((rawCall) => {
      const norm = normaliseCall(rawCall);

      const closerUser = norm.closer_iclosed_id ? userMap.get(String(norm.closer_iclosed_id)) : null;
      const setterUser = norm.setter_iclosed_id ? userMap.get(String(norm.setter_iclosed_id)) : null;
      const closer_id = closerUser?.role === 'closer' ? closerUser.internal_id : null;
      const setter_id = setterUser?.role === 'setter' ? setterUser.internal_id : null;

      if (setter_id) {
        bySetter[setter_id] = (bySetter[setter_id] || 0) + 1;
      }

      // Deal matching: email first, then name within ±14 days of the call
      let dealMatch = null;
      if (norm.contact_email) {
        dealMatch = dealsByEmail.get(norm.contact_email.toLowerCase().trim()) || null;
      }
      if (!dealMatch && norm.contact_name) {
        const candidates = dealsByName.get(norm.contact_name.toLowerCase().trim()) || [];
        const callTime = new Date(norm.scheduled_at).getTime();
        for (const c of candidates) {
          const diffDays = Math.abs(callTime - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays <= 14) { dealMatch = c; break; }
        }
      }

      return {
        ...norm,
        closer_id,
        setter_id,
        deal_id: dealMatch?.id || null,
        deal_value: dealMatch ? Number(dealMatch.front_end || 0) : null,
        synced_at: new Date().toISOString(),
      };
    });

    const matched = rows.filter((r) => r.deal_id).length;

    // 8. Upsert in batches of 500
    let processed = 0;
    const upsertErrors = [];
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error: upErr } = await supabase
        .from('iclosed_calls')
        .upsert(batch, { onConflict: 'id' });
      if (upErr) upsertErrors.push(upErr.message);
      else processed += batch.length;
    }

    // 9. Debug mode: return a sample row so we can spot-check attribution
    const debug = req.query?.debug === '1' ? {
      sample: rows[0] ? {
        id: rows[0].id,
        scheduled_at: rows[0].scheduled_at,
        contact_name: rows[0].contact_name,
        closer_iclosed_id: rows[0].closer_iclosed_id,
        setter_iclosed_id: rows[0].setter_iclosed_id,
        closer_id: rows[0].closer_id,
        setter_id: rows[0].setter_id,
        status: rows[0].status,
      } : null,
    } : undefined;

    return res.status(200).json({
      ok: true,
      since,
      until,
      daysQueried: days.length,
      fetched: rawCalls.length,
      deduped: dedupedRaw.length,
      processed,
      matched,
      bySetter,
      byDay,
      dayErrors: Object.keys(dayErrors).length ? dayErrors : undefined,
      upsertErrors: upsertErrors.length ? upsertErrors : undefined,
      seeded: seedResult.seeded,
      elapsedMs: Date.now() - t0,
      ...(debug ? { debug } : {}),
    });
  } catch (err) {
    console.error('iClosed sync error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}

// Full sync window is ~44 days × ~300ms each = ~15s. Extra headroom for
// deal matching, upserts, and occasional 429 retries.
export const config = { runtime: 'nodejs', maxDuration: 300 };
