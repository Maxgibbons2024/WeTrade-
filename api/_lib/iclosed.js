// iClosed API helper — handles auth, pagination, and rate limiting.
// Docs: https://public.api.iclosed.io
// Auth: Authorization: Bearer iclosed_<key>

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
 * @param {string} path - e.g. "/v1/eventCalls?limit=100"
 * @param {object} init - fetch init (method, body, headers)
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
 * Page through a list endpoint until exhausted.
 * iClosed paginates via `cursor`/`nextCursor` or `page` params; this helper
 * tries the common shapes and returns a flat array.
 */
export async function iclosedListAll(path, { pageSize = 100, maxPages = 50 } = {}) {
  const all = [];
  let cursor = null;
  let page = 1;

  for (let i = 0; i < maxPages; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const url = `${path}${sep}limit=${pageSize}${cursorParam}`;
    const json = await iclosedFetch(url);

    // Possible response shapes:
    //   { data: [...], nextCursor: "..." }
    //   { items: [...], next: "..." }
    //   { results: [...], hasMore: true, nextCursor: "..." }
    //   [ ... ]  (bare array)
    const items = Array.isArray(json)
      ? json
      : json.data || json.items || json.results || json.eventCalls || [];

    if (!items.length) break;
    all.push(...items);

    const next = json.nextCursor || json.next || (json.pagination && json.pagination.nextCursor);
    if (!next) break;
    cursor = next;
    page += 1;
  }

  return all;
}

/**
 * Defensive field accessor — iClosed payloads use camelCase but we don't
 * yet know exact keys. Tries a list of candidates and returns the first hit.
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

/**
 * Normalise an iClosed event call into our `iclosed_calls` row shape.
 * Field names are best-effort guesses based on the public docs; the raw
 * payload is always preserved in the `raw` column for re-mapping later.
 */
export function normaliseCall(call) {
  const contact = call.contact || call.invitee || {};
  const utm = call.utm || contact.utm || call.tracking || contact.tracking || {};

  return {
    id: String(pick(call, 'id', 'callId', 'eventCallId')),
    contact_id: pick(contact, 'id', 'contactId') || null,
    contact_name:
      pick(contact, 'fullName', 'name') ||
      [pick(contact, 'firstName'), pick(contact, 'lastName')].filter(Boolean).join(' ') ||
      null,
    contact_email: pick(contact, 'email') || null,
    scheduled_at: pick(call, 'scheduledAt', 'startTime', 'startsAt', 'scheduled_at'),
    ended_at: pick(call, 'endedAt', 'endTime', 'endsAt', 'ended_at') || null,
    status: pick(call, 'status', 'state') || null,
    outcome: pick(call, 'outcome', 'result') || null,
    closer_iclosed_id:
      pick(call, 'ownerId', 'closerId', 'assignedToId') ||
      pick(call.owner || {}, 'id') ||
      null,
    setter_iclosed_id:
      pick(call, 'setterId', 'setterUserId', 'bookerId') ||
      pick(call.setter || {}, 'id') ||
      null,
    event_type: pick(call, 'eventType', 'eventName', 'type') || null,
    utm_source: pick(utm, 'source', 'utm_source') || null,
    utm_medium: pick(utm, 'medium', 'utm_medium') || null,
    utm_campaign: pick(utm, 'campaign', 'utm_campaign') || null,
    utm_content: pick(utm, 'content', 'utm_content') || null,
    utm_term: pick(utm, 'term', 'utm_term') || null,
    referrer: pick(utm, 'referrer') || pick(contact, 'referrer') || null,
    raw: call,
  };
}
