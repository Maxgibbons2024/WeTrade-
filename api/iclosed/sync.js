import { getSupabaseAdmin } from '../_lib/supabase.js';
import {
  iclosedFetch,
  iclosedListOffset,
  normaliseCall,
  pick,
} from '../_lib/iclosed.js';
import { resolveInternal } from '../_lib/closers.js';

// iClosed sync — paginate-all-then-filter.
//
// Discovery log:
//   1. /v1/eventCalls IGNORES from/to query params. Passing from=2026-04-23 &
//      to=2026-04-23 returns the SAME 200-row slice as any other date. Verified
//      by running day-by-day fetches: every day returned identical 200 rows.
//   2. Default sort is oldest-first. limit=100&page=1 returns the oldest 100
//      calls (early 2025 / Kai-era bookings). Recent calls are at page 65+.
//   3. That explains the original missing-tail bug: old pagination bailed out
//      early (consecutive-duplicate-pages heuristic or maxPages cap) and
//      therefore never reached the newest rows. We were also dropping the
//      last ~100 calls that matter most.
//
// Strategy: paginate forward through EVERY page until iClosed returns < page
// size (= genuine end of dataset). No early bailouts. No duplicate-page
// heuristics. Then upsert the full result set — Supabase's onConflict: 'id'
// handles re-writes cheaply.
//
// Runtime: ~70 pages × ~300ms = ~21s. Fits inside 300s maxDuration with
// plenty of headroom.

async function fetchAllEventCalls({ pageSize = 100, hardMaxPages = 300 } = {}) {
  const all = [];
  const seen = new Set();

  for (let page = 1; page <= hardMaxPages; page++) {
    const url = `/v1/eventCalls?limit=${pageSize}&page=${page}`;
    const json = await iclosedFetch(url);
    const items = json?.data?.eventCalls || [];

    if (items.length === 0) break; // true end of dataset

    let newItems = 0;
    for (const item of items) {
      const id = item?.id ?? item?.callId;
      const key = id != null ? String(id) : JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
      newItems += 1;
    }

    // Short page → last page (iClosed returned fewer than we asked for).
    if (items.length < pageSize) break;

    // Zero new items across a full page almost certainly means iClosed has
    // entered a pagination loop (returning the same rows). Log and stop.
    if (newItems === 0) {
      console.warn(`[iclosed/sync] page ${page} returned ${items.length} rows but all duplicates — stopping`);
      break;
    }
  }

  return all;
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

    // 2. Load user mapping
    const { data: users, error: usersErr } = await supabase.from('iclosed_users').select('*');
    if (usersErr) throw usersErr;
    const userMap = new Map((users || []).map((u) => [String(u.iclosed_user_id), u]));

    // 3. Fetch EVERYTHING from iClosed. Client-side filtering happens after.
    const rawCalls = await fetchAllEventCalls({ pageSize: 100, hardMaxPages: 300 });
    const fetchMs = Date.now() - t0;

    if (!rawCalls.length) {
      return res.status(200).json({ ok: true, message: 'No calls returned by iClosed', fetchMs });
    }

    // 4. Pre-load deals for matching
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

    // 5. Normalise every call + resolve closer/setter + match deal
    const bySetter = {};
    const byScheduledMonth = {}; // sanity metric — did we reach recent calls?
    const rows = rawCalls.map((rawCall) => {
      const norm = normaliseCall(rawCall);

      const closerUser = norm.closer_iclosed_id ? userMap.get(String(norm.closer_iclosed_id)) : null;
      const setterUser = norm.setter_iclosed_id ? userMap.get(String(norm.setter_iclosed_id)) : null;
      const closer_id = closerUser?.role === 'closer' ? closerUser.internal_id : null;
      const setter_id = setterUser?.role === 'setter' ? setterUser.internal_id : null;

      if (setter_id) bySetter[setter_id] = (bySetter[setter_id] || 0) + 1;

      if (norm.scheduled_at) {
        const ym = norm.scheduled_at.slice(0, 7);
        byScheduledMonth[ym] = (byScheduledMonth[ym] || 0) + 1;
      }

      // Deal matching: email first, then name within ±14 days of the call
      let dealMatch = null;
      if (norm.contact_email) {
        dealMatch = dealsByEmail.get(norm.contact_email.toLowerCase().trim()) || null;
      }
      if (!dealMatch && norm.contact_name) {
        const candidates = dealsByName.get(norm.contact_name.toLowerCase().trim()) || [];
        const callTime = norm.scheduled_at ? new Date(norm.scheduled_at).getTime() : 0;
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

    // 6. Upsert in batches of 500
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

    // 7. Recent-window snapshot — last 14 days + next 30 days
    const now = Date.now();
    const windowStart = now - 14 * 24 * 60 * 60 * 1000;
    const windowEnd   = now + 30 * 24 * 60 * 60 * 1000;
    const inWindow = rows.filter((r) => {
      if (!r.scheduled_at) return false;
      const t = new Date(r.scheduled_at).getTime();
      return t >= windowStart && t <= windowEnd;
    });
    const windowBySetter = {};
    for (const r of inWindow) {
      if (r.setter_id) windowBySetter[r.setter_id] = (windowBySetter[r.setter_id] || 0) + 1;
    }

    return res.status(200).json({
      ok: true,
      fetched: rawCalls.length,
      processed,
      matched,
      bySetter,
      byScheduledMonth,
      window: {
        start: new Date(windowStart).toISOString(),
        end:   new Date(windowEnd).toISOString(),
        calls: inWindow.length,
        bySetter: windowBySetter,
      },
      upsertErrors: upsertErrors.length ? upsertErrors : undefined,
      seeded: seedResult.seeded,
      elapsedMs: Date.now() - t0,
      fetchMs,
    });
  } catch (err) {
    console.error('iClosed sync error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}

// ~70 pages × ~300ms = ~21s for the fetch, plus deal matching + upserts.
// Keep maxDuration high for safety on slow iClosed responses.
export const config = { runtime: 'nodejs', maxDuration: 300 };
