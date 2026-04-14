// iClosed API helper — handles auth, pagination, and rate limiting.
// Docs: https://public.api.iclosed.io
// Auth: Authorization: Bearer iclosed_<key>
//
// Response shapes we've observed in the wild:
//   GET /v1/users       → { data: { users: [...], count: 12 } }
//   GET /v1/eventCalls  → { data: { eventCalls: [...], count: 6868 } }
// Pagination is offset-based: ?limit=100&offset=0

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
function extractItems(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  // Single-wrap patterns
  for (const k of ['items', 'results', 'eventCalls', 'users']) {
    if (Array.isArray(json[k])) return json[k];
  }

  // Double-wrap under .data
  if (json.data) {
    if (Array.isArray(json.data)) return json.data;
    for (const k of ['eventCalls', 'users', 'calls', 'events', 'items', 'results']) {
      if (Array.isArray(json.data[k])) return json.data[k];
    }
  }

  return [];
}

/**
 * Page through a list endpoint until exhausted.
 *
 * iClosed ignores `offset` on /v1/eventCalls (verified empirically — it returns
 * the same first page over and over), so we use `page=N` (1-indexed) instead.
 * We also short-circuit if a page adds zero new ids, which protects against
 * any pagination param being silently ignored in future.
 */
export async function iclosedListAll(path, { pageSize = 100, maxPages = 200 } = {}) {
  const seen = new Set();
  const all = [];
  const sep = path.includes('?') ? '&' : '?';

  for (let page = 1; page <= maxPages; page++) {
    const url = `${path}${sep}limit=${pageSize}&page=${page}`;
    const json = await iclosedFetch(url);
    const items = extractItems(json);

    if (!items.length) break;

    // Count how many of this page's items we haven't already seen.
    let added = 0;
    for (const item of items) {
      const id = item?.id ?? item?.callId ?? item?.userId;
      const key = id != null ? String(id) : JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
      added += 1;
    }

    // Pagination param is being ignored — bail rather than spin forever.
    if (added === 0) break;

    // Last page — fewer results than the page size.
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

  // Setter is hidden in secondaryAnswers as "Set By" question
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
