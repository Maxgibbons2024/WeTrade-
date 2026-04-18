import { getSupabaseAdmin } from '../_lib/supabase.js';
import { iclosedListAll, iclosedFetch, normaliseCall, pick } from '../_lib/iclosed.js';
import { NAME_TO_INTERNAL, resolveInternal } from '../_lib/closers.js';

// Closes that count toward setter attribution
const CLOSED_DEAL_STATUSES = ['active', 'onboarding'];

// Auto-bootstrap: how far back to backfill the very first time the table is empty
const BOOTSTRAP_SINCE = '2025-01-01';

// Auto-seed iclosed_users by calling iClosed's user list and matching names.
// Runs on first sync (when the mapping table is empty) so no manual setup is needed.
async function seedUsersIfEmpty(supabase) {
  const { data: existing, error } = await supabase.from('iclosed_users').select('iclosed_user_id').limit(1);
  if (error) throw error;
  if (existing && existing.length > 0) return { seeded: 0, alreadyPresent: true };

  console.log('[iclosed/sync] iclosed_users empty — auto-seeding from /v1/users');
  // /v1/users uses offset-based pagination (page=N is ignored)
  const users = await iclosedListAll('/v1/users', { pageSize: 100, maxPages: 5, paginationMode: 'offset' });
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
  // Auth: accept either a Bearer cron secret header (Vercel cron) or a ?key= query param
  // (so you can trigger a manual sync from a browser bookmark). When CRON_SECRET is unset
  // the endpoint is open for local dev.
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

  // Debug mode: dumps raw iClosed responses so we can see actual endpoint shape.
  // Hit /api/iclosed/sync?key=...&debug=1
  if (req.query?.debug === '1') {
    const out = {};
    try {
      const users = await iclosedFetch('/v1/users?limit=5');
      out.users = {
        ok: true,
        isArray: Array.isArray(users),
        topLevelKeys: !Array.isArray(users) && users ? Object.keys(users) : null,
        count: Array.isArray(users) ? users.length : (users?.data?.length || users?.items?.length || null),
        sample: users,
      };
    } catch (e) { out.users = { ok: false, error: e.message }; }

    const since = req.query.since || '2025-01-01';
    const until = req.query.until || new Date().toISOString().split('T')[0];
    const pathsToTry = [
      `/v1/eventCalls?from=${since}T00:00:00Z&to=${until}T23:59:59Z&limit=5`,
      `/v1/eventCalls?limit=5`,
      `/v1/calls?limit=5`,
      `/v1/bookings?limit=5`,
      `/v1/events?limit=5`,
    ];
    out.eventCallsAttempts = [];
    for (const p of pathsToTry) {
      try {
        const r = await iclosedFetch(p);
        out.eventCallsAttempts.push({
          path: p,
          ok: true,
          isArray: Array.isArray(r),
          topLevelKeys: !Array.isArray(r) && r ? Object.keys(r) : null,
          count: Array.isArray(r) ? r.length : (r?.data?.length || r?.items?.length || r?.eventCalls?.length || null),
          sample: r,
        });
      } catch (e) {
        out.eventCallsAttempts.push({ path: p, ok: false, error: e.message });
      }
    }
    return res.status(200).json(out);
  }

  // Shape probe: inspects already-synced iclosed_calls.raw so we can see the
  // real task/outcome fields iClosed writes and tune normaliseCall.
  // Hit /api/iclosed/sync?key=...&debug=shapes
  if (req.query?.debug === 'shapes') {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('iclosed_calls')
      .select('id, status, outcome, raw')
      .order('scheduled_at', { ascending: false })
      .limit(300);
    if (error) return res.status(500).json({ error: error.message });

    // Current status distribution
    const statusCounts = {};
    const taskKeyCounts = {};
    const taskCompletedCounts = {};
    const taskOutcomeCounts = {};
    const topLevelKeySet = new Set();
    const samplesByStatus = {};

    for (const row of data || []) {
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
      if (row.raw && typeof row.raw === 'object') {
        for (const k of Object.keys(row.raw)) topLevelKeySet.add(k);
      }
      const tasks = Array.isArray(row.raw?.task) ? row.raw.task : [];
      for (const t of tasks) {
        if (t && typeof t === 'object') {
          for (const k of Object.keys(t)) taskKeyCounts[k] = (taskKeyCounts[k] || 0) + 1;
          const c = String(t.completed);
          taskCompletedCounts[c] = (taskCompletedCounts[c] || 0) + 1;
          const o = t.outcome == null ? '<null>' : String(t.outcome);
          taskOutcomeCounts[o] = (taskOutcomeCounts[o] || 0) + 1;
        }
      }
      if (!samplesByStatus[row.status] && row.raw) {
        samplesByStatus[row.status] = {
          id: row.id,
          status: row.status,
          outcome: row.outcome,
          rawTask: row.raw.task,
          rawCancelReason: row.raw.cancelReason,
          rawCancelledBy: row.raw.cancelledBy,
          dateTimeUTC: row.raw.dateTimeUTC,
          topLevelKeys: Object.keys(row.raw).sort(),
        };
      }
    }

    return res.status(200).json({
      sampled: data?.length || 0,
      statusCounts,
      topLevelKeys: Array.from(topLevelKeySet).sort(),
      taskKeyCounts,
      taskCompletedCounts,
      taskOutcomeCounts,
      samplesByStatus,
    });
  }

  // Single-row re-derive probe: reads one row from iclosed_calls.raw, runs
  // it through the CURRENT normaliseCall, and writes the fresh status back.
  // Returns before/after so we can see if the upsert actually mutates the
  // column. Hit /api/iclosed/sync?key=...&debug=rederive&id=1743263
  if (req.query?.debug === 'rederive') {
    const supabase = getSupabaseAdmin();
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id query param' });

    const { data: before, error: beforeErr } = await supabase
      .from('iclosed_calls')
      .select('id, status, outcome, raw, synced_at')
      .eq('id', id)
      .single();
    if (beforeErr) return res.status(500).json({ error: beforeErr.message });

    const fresh = normaliseCall(before.raw);

    const { error: upErr } = await supabase
      .from('iclosed_calls')
      .update({
        status: fresh.status,
        outcome: fresh.outcome,
        synced_at: new Date().toISOString(),
      })
      .eq('id', id);

    const { data: after } = await supabase
      .from('iclosed_calls')
      .select('id, status, outcome, synced_at')
      .eq('id', id)
      .single();

    return res.status(200).json({
      id,
      before: { status: before.status, outcome: before.outcome, synced_at: before.synced_at },
      freshNormalised: { status: fresh.status, outcome: fresh.outcome },
      updateError: upErr?.message || null,
      after,
      raw_task: before.raw?.task,
      raw_cancelledBy: before.raw?.cancelledBy,
      raw_cancelReason: before.raw?.cancelReason,
    });
  }

  // Bulk re-derive: walks every row in iclosed_calls, re-runs normaliseCall
  // against raw, and writes back any row whose status/outcome changed.
  // Skips the iClosed API entirely — fast fix for rows stuck with old
  // statuses from the initial buggy sync.
  // Hit /api/iclosed/sync?key=...&debug=rederiveAll
  if (req.query?.debug === 'rederiveAll') {
    const supabase = getSupabaseAdmin();
    let updated = 0;
    let scanned = 0;
    let errors = 0;
    const pageSize = 1000;
    let offset = 0;

    for (;;) {
      const { data, error } = await supabase
        .from('iclosed_calls')
        .select('id, status, outcome, raw')
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) return res.status(500).json({ error: error.message, scanned, updated });
      if (!data || data.length === 0) break;

      const toUpdate = [];
      for (const row of data) {
        scanned += 1;
        if (!row.raw) continue;
        const fresh = normaliseCall(row.raw);
        if (fresh.status !== row.status || fresh.outcome !== row.outcome) {
          toUpdate.push({ id: row.id, status: fresh.status, outcome: fresh.outcome });
        }
      }

      // Batch updates — one UPDATE per changed row. Slower than upsert but
      // keeps it simple and touches only the two columns.
      for (const u of toUpdate) {
        const { error: upErr } = await supabase
          .from('iclosed_calls')
          .update({ status: u.status, outcome: u.outcome })
          .eq('id', u.id);
        if (upErr) errors += 1;
        else updated += 1;
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return res.status(200).json({ ok: true, scanned, updated, errors });
  }
  // so we can sanity-check dashboard totals against iClosed.
  // Hit /api/iclosed/sync?key=...&debug=closer&closer=dave&since=2026-04-01&until=2026-04-30
  if (req.query?.debug === 'closer') {
    const supabase = getSupabaseAdmin();
    const closer = req.query.closer || 'dave';
    const since = req.query.since || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const until = req.query.until || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('iclosed_calls')
      .select('id, contact_name, contact_email, scheduled_at, status, outcome, closer_id, closer_iclosed_id, raw')
      .eq('closer_id', closer)
      .gte('scheduled_at', since)
      .lte('scheduled_at', until)
      .order('scheduled_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });

    const byStatus = {};
    const callIds = new Set();
    const duplicateCallIds = [];
    const contactEmails = new Map();
    const rescheduled = [];

    const calls = (data || []).map((row) => {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      // Check for reschedule flags in raw
      const rescheduleReason = row.raw?.rescheduleReason;
      const rescheduledBy = row.raw?.rescheduledBy;
      if (rescheduleReason || rescheduledBy) {
        rescheduled.push({ id: row.id, rescheduleReason, rescheduledBy });
      }
      // Check for duplicate iClosed callId vs id
      const rawCallId = row.raw?.callId;
      if (rawCallId != null && String(rawCallId) !== row.id) {
        duplicateCallIds.push({ rowId: row.id, rawCallId: String(rawCallId) });
      }
      if (callIds.has(row.id)) duplicateCallIds.push({ rowId: row.id, note: 'duplicate row id' });
      callIds.add(row.id);
      // Track contacts to spot same person showing up multiple times
      const key = (row.contact_email || row.contact_name || '').toLowerCase();
      if (key) {
        const list = contactEmails.get(key) || [];
        list.push({ id: row.id, scheduled_at: row.scheduled_at, status: row.status });
        contactEmails.set(key, list);
      }
      return {
        id: row.id,
        scheduled_at: row.scheduled_at,
        status: row.status,
        outcome: row.outcome,
        contact_name: row.contact_name,
        contact_email: row.contact_email,
        cancelledBy: row.raw?.cancelledBy || null,
        cancelReason: row.raw?.cancelReason || null,
        rescheduleReason: row.raw?.rescheduleReason || null,
        rescheduledBy: row.raw?.rescheduledBy || null,
        rawCallId: row.raw?.callId != null ? String(row.raw.callId) : null,
      };
    });

    // Contacts appearing more than once — potential reschedule duplicates
    const repeatedContacts = [];
    for (const [key, list] of contactEmails.entries()) {
      if (list.length > 1) repeatedContacts.push({ contact: key, calls: list });
    }

    return res.status(200).json({
      closer,
      since,
      until,
      totalRows: calls.length,
      byStatus,
      nonCancelled: calls.filter((c) => c.status !== 'CANCELLED').length,
      rescheduledCount: rescheduled.length,
      duplicateCallIdCount: duplicateCallIds.length,
      repeatedContactCount: repeatedContacts.length,
      rescheduled,
      duplicateCallIds,
      repeatedContacts,
      calls,
    });
  }

  const supabase = getSupabaseAdmin();
  const t0 = Date.now();
  const timings = {};
  const mark = (label) => { timings[label] = Date.now() - t0; };

  try {
    // 1. Auto-seed iclosed_users on first run
    const seedResult = await seedUsersIfEmpty(supabase);
    mark('afterSeed');

    // 2. Decide date window: explicit query > auto-backfill (if calls table empty) > last 7 days
    // `until` extends 30 days into the future so we pull upcoming BOOKED calls
    // (sales calls rarely book further out than that). Without this, dashboard
    // "Calls Booked" undercounts vs iClosed because tomorrow's calls aren't synced.
    let since = req.query?.since;
    const FUTURE_BUFFER_DAYS = 30;
    const defaultUntilDate = new Date();
    defaultUntilDate.setDate(defaultUntilDate.getDate() + FUTURE_BUFFER_DAYS);
    const until = req.query?.until || defaultUntilDate.toISOString().split('T')[0];
    if (!since) {
      const { count } = await supabase
        .from('iclosed_calls')
        .select('id', { count: 'exact', head: true });
      if (!count || count === 0) {
        console.log('[iclosed/sync] iclosed_calls empty — auto-backfilling from', BOOTSTRAP_SINCE);
        since = BOOTSTRAP_SINCE;
      } else {
        since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      }
    }

    // Load user mapping
    const { data: users, error: usersErr } = await supabase.from('iclosed_users').select('*');
    if (usersErr) throw usersErr;
    const userMap = new Map((users || []).map((u) => [String(u.iclosed_user_id), u]));

    // Fetch event calls. iClosed supports `from`/`to` query params per docs.
    // iClosed caps `limit` at 100, so we rely on parallel page fetching in
    // iclosedListAll (concurrency=5 by default) to stay under the function
    // timeout on full backfills.
    const path = `/v1/eventCalls?from=${encodeURIComponent(since)}T00:00:00Z&to=${encodeURIComponent(until)}T23:59:59Z`;
    const rawCalls = await iclosedListAll(path, { pageSize: 100, maxPages: 200, concurrency: 5 });
    mark('afterFetch');

    if (!rawCalls.length) {
      return res.status(200).json({ ok: true, processed: 0, matched: 0, message: 'No calls returned by iClosed', since, until, timings });
    }

    // Pre-load deals for matching (only need email + name + id + front_end + created_at)
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, client_name, email, front_end, created_at');
    if (dealsErr) throw dealsErr;
    mark('afterDeals');

    // Build lookup maps for deal matching
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

    const rows = rawCalls.map((rawCall) => {
      const norm = normaliseCall(rawCall);

      // Resolve internal closer/setter ids
      const closerUser = norm.closer_iclosed_id ? userMap.get(String(norm.closer_iclosed_id)) : null;
      const setterUser = norm.setter_iclosed_id ? userMap.get(String(norm.setter_iclosed_id)) : null;
      const closer_id = closerUser?.role === 'closer' ? closerUser.internal_id : null;
      const setter_id = setterUser?.role === 'setter' ? setterUser.internal_id : null;

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

    // Dedupe by id — iClosed sometimes returns the same call across pages,
    // and Postgres upsert refuses batches that conflict on the same key twice
    // ("ON CONFLICT command cannot affect row a second time"). Keep the last
    // occurrence so newer data wins.
    const byId = new Map();
    for (const r of rows) {
      if (r.id) byId.set(r.id, r);
    }
    const dedupedRows = Array.from(byId.values());
    const matched = dedupedRows.filter((r) => r.deal_id).length;
    mark('afterNormalise');

    // Upsert in batches of 500 to stay within Supabase row limits
    let processed = 0;
    const errors = [];
    for (let i = 0; i < dedupedRows.length; i += 500) {
      const batch = dedupedRows.slice(i, i + 500);
      const { error: upErr } = await supabase
        .from('iclosed_calls')
        .upsert(batch, { onConflict: 'id' });
      if (upErr) errors.push(upErr.message);
      else processed += batch.length;
    }
    mark('afterUpsert');

    return res.status(200).json({
      ok: true,
      since,
      until,
      fetched: rows.length,
      deduped: dedupedRows.length,
      processed,
      matched,
      timings,
      seeded: seedResult.seeded,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('iClosed sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Avoid being parsed by Vercel as edge runtime.
// maxDuration: full backfills fetch ~70 pages from iClosed sequentially
// plus deal matching + upserts, which can run past the 60s default on Pro.
export const config = { runtime: 'nodejs', maxDuration: 300 };
