// Probes the iClosed API for availability / event type data.
// GET /api/iclosed/availability?key=...
//
// Tries several endpoints to discover what's available:
//   /v1/eventTypes  — event templates (may include max slots / capacity)
//   /v1/availability — calendar availability
//   /v1/slots       — open slots
//
// Returns whatever the API supports so we can wire it into the dashboard.

import { iclosedFetch } from '../_lib/iclosed.js';

export default async function handler(req, res) {
  // Auth — same pattern as sync.js
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const queryKey = req.query?.key;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && queryKey !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {};

  // 1. Try /v1/eventTypes — event templates with capacity info
  const endpointsToTry = [
    { key: 'eventTypes', path: '/v1/eventTypes?limit=100' },
    { key: 'events', path: '/v1/events?limit=100' },
    { key: 'availability', path: '/v1/availability' },
    { key: 'slots', path: '/v1/slots' },
    { key: 'calendars', path: '/v1/calendars' },
    { key: 'schedule', path: '/v1/schedule' },
  ];

  for (const ep of endpointsToTry) {
    try {
      const data = await iclosedFetch(ep.path);
      results[ep.key] = {
        ok: true,
        topLevelKeys: data && !Array.isArray(data) ? Object.keys(data) : null,
        isArray: Array.isArray(data),
        count: Array.isArray(data) ? data.length
          : data?.data ? (Array.isArray(data.data) ? data.data.length : 'object')
          : null,
        sample: data,
      };
    } catch (e) {
      results[ep.key] = { ok: false, status: e.message };
    }
  }

  // 2. Also try eventCalls for today to show what's already booked
  const today = new Date().toISOString().split('T')[0];
  try {
    const todayCalls = await iclosedFetch(
      `/v1/eventCalls?from=${today}T00:00:00Z&to=${today}T23:59:59Z&limit=100`
    );
    const items = extractItems(todayCalls);
    results.todayBooked = {
      ok: true,
      count: items.length,
      calls: items.map((c) => ({
        id: c.id,
        name: c.inviteeName,
        time: c.dateTimeUTC || c.dateTime,
        eventType: c.name || c.callType,
        userId: c.userId,
        cancelled: !!(c.cancelReason || c.cancelledBy),
      })),
    };
  } catch (e) {
    results.todayBooked = { ok: false, error: e.message };
  }

  return res.status(200).json(results);
}

// Inline extract since we don't need the full sync machinery
function extractItems(json) {
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
