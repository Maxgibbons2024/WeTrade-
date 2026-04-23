// iClosed API helper — auth + minimal fetch utilities.
// Docs: https://public.api.iclosed.io
// Auth: Authorization: Bearer iclosed_<key>
//
// Response shapes we've observed in the wild:
//   GET /v1/users       → { data: { users: [...], count: 12 } }
//   GET /v1/eventCalls  → { data: { eventCalls: [...], count: 6868 } }
//
// History note: we used to have a generic iclosedListAll() that paginated
// /v1/eventCalls across 70+ pages. It consistently dropped ~100 calls at the
// tail (most-recent bookings) no matter how we tuned it. The sync was
// rewritten to fetch day-by-day instead (each day is ≤100 calls = one
// request, no pagination), so iclosedListAll is gone. iclosedListOffset
// stays for /v1/users which has ≤20 rows total.

const BASE_URL = 'https://public.api.iclosed.io';

function getAuthHeader() {
  const key = process.env.ICLOSED_API_KEY;
  if (!key) throw new Error('Missing ICLOSED_API_KEY environment variable');
  // Allow either bare key or full prefixed value
  const token = key.startsWith('iclosed_') ? key : `iclosed_${key}`;
  return `Bearer ${token}`;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a single iClosed endpoint with retry on 429.
 */
export async function iclosedFetch(path, init = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });

    if (res.status === 429) {
      let retryAfter = 3;
      try {
        const body = await res.json();
        retryAfter = Math.max(1, Number(body.retryAfter || 3));
      } catch {}
      if (attempt === maxAttempts) {
        throw new Error(`iClosed 429 after ${attempt} attempts: ${url}`);
      }
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`iClosed ${res.status} ${res.statusText} (${url}) — ${text.slice(0, 300)}`);
    }

    return res.json();
  }
}

/**
 * Extract the items array from an iClosed response regardless of wrapping.
 * Handles:
 *   [ ... ]                              bare array
 *   { data: [ ... ] }                    single-wrap
 *   { data: { eventCalls: [...] } }      double-wrap (what iClosed actually uses)
 *   { data: { users: [...] } }
 */
export function extractItems(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  for (const k of ['items', 'results', 'eventCalls', 'users']) {
    if (Array.isArray(json[k])) return json[k];
  }

  if (json.data) {
    if (Array.isArray(json.data)) return json.data;
    for (const k of ['eventCalls', 'users', 'calls', 'events', 'items', 'results']) {
      if (Array.isArray(json.data[k])) return json.data[k];
    }
  }

  return [];
}

/**
 * Offset-based pagination for small endpoints (/v1/users).
 *
 * NOT intended for /v1/eventCalls — that endpoint has ~7000 rows and its
 * pagination is unstable at the tail. Use the day-by-day approach in
 * api/iclosed/sync.js instead.
 */
export async function iclosedListOffset(path, { pageSize = 100, maxPages = 5 } = {}) {
  const all = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let p = 0; p < maxPages; p++) {
    const url = `${path}${sep}limit=${pageSize}&offset=${p * pageSize}`;
    const json = await iclosedFetch(url);
    const items = extractItems(json);
    if (!items.length) break;
    all.push(...items);
    if (items.length < pageSize) break;
  }
  return all;
}

/**
 * Defensive field accessor — tries multiple candidate keys.
 */
export function pick(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (k.includes('.')) {
      const parts = k.split('.');
      let v = obj;
      for (const p of parts) {
        if (v == null) break;
        v = v[p];
      }
      if (v != null) return v;
    } else if (obj[k] != null) {
      return obj[k];
    }
  }
  return undefined;
}

// iClosed task.outcome values we've seen in the wild:
//   WON       — deal closed
//   NO_SALE   — call happened, did not close (includes noSaleReason ADMIN_CANCELLED
//               for cancellations, but cancelledBy catches those earlier)
//   null      — task not yet completed (upcoming or no-show)
const CLOSED_OUTCOMES = new Set(['WON']);

/**
 * Normalise an iClosed event call into our `iclosed_calls` row shape.
 * Based on real payloads observed from /v1/eventCalls.
 */
export function normaliseCall(call) {
  // The call's userId is the CLOSER (owner/host)
  const closer_iclosed_id = call.userId != null ? String(call.userId) : null;

  // Setter extraction — two possible sources:
  //   1. secondaryAnswers with a "Set By" question (manually tagged by team)
  //   2. SettedClaim.user.id — iClosed's record of who claimed/set the booking
  //      Skip when claimStatus is USER_SCHEDULED (that means the lead self-
  //      booked via the public link — no setter involved). Team-set calls
  //      (ADMIN_SCHEDULED, SET_BY_USER, etc.) attribute to the team member.
  let setter_iclosed_id = null;
  if (Array.isArray(call.secondaryAnswers)) {
    for (const sa of call.secondaryAnswers) {
      if (sa.statement === 'Set By' && Array.isArray(sa.answer)) {
        for (const a of sa.answer) {
          if (a && a.userId != null) { setter_iclosed_id = String(a.userId); break; }
        }
        if (setter_iclosed_id) break;
      }
    }
  }
  if (!setter_iclosed_id && call.SettedClaim && call.SettedClaim.user?.id != null) {
    const claim = call.SettedClaim;
    if (claim.claimStatus !== 'USER_SCHEDULED') {
      setter_iclosed_id = String(claim.user.id);
    }
  }

  // UTMs come as an array of {utmKey, utmValue} — flatten to map
  const utmMap = {};
  if (Array.isArray(call.utm)) {
    for (const u of call.utm) {
      if (u && u.utmKey) utmMap[u.utmKey] = u.utmValue;
    }
  }

  // Derive a status we can reason about in the UI
  const task = Array.isArray(call.task) && call.task.length ? call.task[0] : null;
  const scheduledAt = call.dateTimeUTC || call.dateTime || null;
  const scheduledMs = scheduledAt ? new Date(scheduledAt).getTime() : null;
  const isPast = scheduledMs != null && scheduledMs < Date.now();

  let status = 'BOOKED';
  if (call.cancelReason || call.cancelledBy) {
    status = 'CANCELLED';
  } else if (task && task.completed) {
    // The closer marked the call complete. WON = closed, everything else
    // (NO_SALE, null, etc.) means the call happened but didn't convert.
    status = CLOSED_OUTCOMES.has(task.outcome) ? 'CLOSED' : 'SHOWED';
  } else if (isPast) {
    // Past scheduled time with no completed task → no-show.
    status = 'NO_SHOW';
  }

  return {
    id: String(call.id ?? call.callId ?? ''),
    contact_id: call.contactId != null ? String(call.contactId) : null,
    contact_name: (call.inviteeName || '').trim() || null,
    contact_email: (call.inviteeEmail || '').trim().toLowerCase() || null,
    scheduled_at: scheduledAt,
    ended_at: null,
    status,
    outcome: task?.outcome || null,
    closer_iclosed_id,
    setter_iclosed_id,
    event_type: call.name || call.callType || null,
    utm_source: utmMap.utm_source || null,
    utm_medium: utmMap.utm_medium || null,
    utm_campaign: utmMap.utm_campaign || null,
    utm_content: utmMap.utm_content || null,
    utm_term: utmMap.utm_term || null,
    referrer: utmMap.referrer || null,
    raw: call,
  };
}
