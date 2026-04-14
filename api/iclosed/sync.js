import { getSupabaseAdmin } from '../_lib/supabase.js';
import { iclosedListAll, normaliseCall, pick } from '../_lib/iclosed.js';

// Closes that count toward setter attribution
const CLOSED_DEAL_STATUSES = ['active', 'onboarding'];

// Auto-bootstrap: how far back to backfill the very first time the table is empty
const BOOTSTRAP_SINCE = '2025-01-01';

// Maps iClosed display names → our internal closer/setter ids.
// Used for auto-seeding the iclosed_users table on first run.
const NAME_TO_INTERNAL = [
  { match: /lloyd/i,             internal_id: 'lloyd', role: 'closer' },
  { match: /dave|david/i,        internal_id: 'dave',  role: 'closer' },
  { match: /zak|zach/i,          internal_id: 'zak',   role: 'closer' },
  { match: /joe|joseph/i,        internal_id: 'joe',   role: 'closer' },
  { match: /shea/i,              internal_id: 'shea',  role: 'closer' },
  { match: /chris|christopher/i, internal_id: 'chris', role: 'closer' },
  { match: /kai/i,               internal_id: 'kai',   role: 'setter' },
];

function resolveInternal(displayName) {
  if (!displayName) return null;
  for (const rule of NAME_TO_INTERNAL) {
    if (rule.match.test(displayName)) return rule;
  }
  return null;
}

// Auto-seed iclosed_users by calling iClosed's user list and matching names.
// Runs on first sync (when the mapping table is empty) so no manual setup is needed.
async function seedUsersIfEmpty(supabase) {
  const { data: existing, error } = await supabase.from('iclosed_users').select('iclosed_user_id').limit(1);
  if (error) throw error;
  if (existing && existing.length > 0) return { seeded: 0, alreadyPresent: true };

  console.log('[iclosed/sync] iclosed_users empty — auto-seeding from /v1/users');
  const users = await iclosedListAll('/v1/users', { pageSize: 100, maxPages: 5 });
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
  // Auth: cron secret OR allow direct call when CRON_SECRET unset (dev)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.ICLOSED_API_KEY) {
    return res.status(500).json({ error: 'Missing ICLOSED_API_KEY environment variable' });
  }

  const supabase = getSupabaseAdmin();

  try {
    // 1. Auto-seed iclosed_users on first run
    const seedResult = await seedUsersIfEmpty(supabase);

    // 2. Decide date window: explicit query > auto-backfill (if calls table empty) > last 7 days
    let since = req.query?.since;
    const until = req.query?.until || new Date().toISOString().split('T')[0];
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
    const path = `/v1/eventCalls?from=${encodeURIComponent(since)}T00:00:00Z&to=${encodeURIComponent(until)}T23:59:59Z`;
    const rawCalls = await iclosedListAll(path, { pageSize: 100, maxPages: 100 });

    if (!rawCalls.length) {
      return res.status(200).json({ ok: true, processed: 0, matched: 0, message: 'No calls returned by iClosed', since, until });
    }

    // Pre-load deals for matching (only need email + name + id + front_end + created_at)
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, client_name, email, front_end, created_at');
    if (dealsErr) throw dealsErr;

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

    let matched = 0;
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
      if (dealMatch) matched += 1;

      return {
        ...norm,
        closer_id,
        setter_id,
        deal_id: dealMatch?.id || null,
        deal_value: dealMatch ? Number(dealMatch.front_end || 0) : null,
        synced_at: new Date().toISOString(),
      };
    });

    // Upsert in batches of 500 to stay within Supabase row limits
    let processed = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error: upErr } = await supabase
        .from('iclosed_calls')
        .upsert(batch, { onConflict: 'id' });
      if (upErr) errors.push(upErr.message);
      else processed += batch.length;
    }

    return res.status(200).json({
      ok: true,
      since,
      until,
      processed,
      matched,
      seeded: seedResult.seeded,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('iClosed sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Avoid being parsed by Vercel as edge runtime
export const config = { runtime: 'nodejs' };
