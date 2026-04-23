import { getSupabaseAdmin } from '../_lib/supabase.js';
import {
  iclosedFetch,
  iclosedListOffset,
  normaliseCall,
  pick,
} from '../_lib/iclosed.js';
import { resolveInternal } from '../_lib/closers.js';

// iClosed sync.
//
// Per the OpenAPI spec (https://api-docs-iclosed.redocly.app/openapi/v1/openapi)
// — which we only discovered AFTER the pagination mystery — the correct
// query params for /v1/eventCalls are:
//
//   eventType  = PAST | UPCOMING | ALL   (default excludes future bookings!)
//   dateFrom   = ISO date (we were wrongly sending `from`)
//   dateTo     = ISO date (we were wrongly sending `to`)
//   page       = zero-based (we were sending 1-based, offset by one every run)
//   limit      = max 100
//   setterIds  = comma-separated iClosed user IDs (server-side setter filter)
//
// With the right param names, date filtering actually works server-side, so
// we no longer need to paginate the whole 7000-row dataset. For the 44-day
// window we typically get 200-400 rows = 2-4 pages.

const DAYS_BACK = 14;
const DAYS_FORWARD = 30;

// Fetch all calls within a date window. eventType=ALL returns both past and
// upcoming — essential for Connor's newly-set future bookings.
async function fetchCallsInWindow({ dateFrom, dateTo, pageSize = 100, maxPages = 100 } = {}) {
  const all = [];
  const seen = new Set();

  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({
      eventType: 'ALL',
      dateFrom,
      dateTo,
      limit: String(pageSize),
      page: String(page),
    });
    const json = await iclosedFetch(`/v1/eventCalls?${qs.toString()}`);
    const items = json?.data?.eventCalls || [];
    if (items.length === 0) break;

    let added = 0;
    for (const item of items) {
      const id = item?.id ?? item?.callId;
      const key = id != null ? String(id) : JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
      added += 1;
    }
    if (items.length < pageSize) break;
    if (added === 0) break; // pagination loop safety
  }

  return all;
}

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
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const queryKey = req.query?.key;
  const headerOk = !cronSecret || authHeader === `Bearer ${cronSecret}`;
  const queryOk = !cronSecret || queryKey === cronSecret;
  if (!headerOk && !queryOk) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.ICLOSED_API_KEY) {
    return res.status(500).json({ error: 'Missing ICLOSED_API_KEY environment variable' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const t0 = Date.now();

    const seedResult = await seedUsersIfEmpty(supabase);

    const { data: users, error: usersErr } = await supabase.from('iclosed_users').select('*');
    if (usersErr) throw usersErr;
    const userMap = new Map((users || []).map((u) => [String(u.iclosed_user_id), u]));

    // Compute window. ISO datetime strings (iClosed accepts the same format
    // it emits in dateTimeUTC).
    const now = new Date();
    const defaultSince = new Date(now);
    defaultSince.setUTCDate(defaultSince.getUTCDate() - DAYS_BACK);
    const defaultUntil = new Date(now);
    defaultUntil.setUTCDate(defaultUntil.getUTCDate() + DAYS_FORWARD);

    const dateFrom = (req.query?.dateFrom || req.query?.since || defaultSince.toISOString().split('T')[0]) + 'T00:00:00Z';
    const dateTo   = (req.query?.dateTo   || req.query?.until || defaultUntil.toISOString().split('T')[0]) + 'T23:59:59Z';

    // Debug mode: fetch one page + one UPCOMING-only page so we can eyeball
    // the real response shape.
    if (req.query?.debug === '1') {
      const [past, upcoming, all] = await Promise.all([
        iclosedFetch(`/v1/eventCalls?eventType=PAST&dateFrom=${dateFrom}&dateTo=${dateTo}&limit=5&page=0`),
        iclosedFetch(`/v1/eventCalls?eventType=UPCOMING&dateFrom=${dateFrom}&dateTo=${dateTo}&limit=5&page=0`),
        iclosedFetch(`/v1/eventCalls?eventType=ALL&dateFrom=${dateFrom}&dateTo=${dateTo}&limit=5&page=0`),
      ]);
      return res.status(200).json({
        dateFrom, dateTo,
        past: { count: past?.data?.count, sample: past?.data?.eventCalls?.[0] },
        upcoming: { count: upcoming?.data?.count, sample: upcoming?.data?.eventCalls?.[0] },
        all: { count: all?.data?.count, sample: all?.data?.eventCalls?.[0] },
      });
    }

    const rawCalls = await fetchCallsInWindow({ dateFrom, dateTo });
    const fetchMs = Date.now() - t0;

    if (!rawCalls.length) {
      return res.status(200).json({
        ok: true,
        message: 'No calls returned by iClosed for this window',
        dateFrom, dateTo, fetchMs,
      });
    }

    // Pre-load deals for matching
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

    const bySetter = {};
    const byStatus = {};
    const rows = rawCalls.map((rawCall) => {
      const norm = normaliseCall(rawCall);

      const closerUser = norm.closer_iclosed_id ? userMap.get(String(norm.closer_iclosed_id)) : null;
      const setterUser = norm.setter_iclosed_id ? userMap.get(String(norm.setter_iclosed_id)) : null;
      const closer_id = closerUser?.role === 'closer' ? closerUser.internal_id : null;
      const setter_id = setterUser?.role === 'setter' ? setterUser.internal_id : null;

      if (setter_id) bySetter[setter_id] = (bySetter[setter_id] || 0) + 1;
      byStatus[norm.status] = (byStatus[norm.status] || 0) + 1;

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

    return res.status(200).json({
      ok: true,
      dateFrom, dateTo,
      fetched: rawCalls.length,
      processed,
      matched,
      bySetter,
      byStatus,
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

export const config = { runtime: 'nodejs', maxDuration: 300 };
