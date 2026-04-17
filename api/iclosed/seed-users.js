import { getSupabaseAdmin } from '../_lib/supabase.js';
import { iclosedListAll, iclosedFetch, pick } from '../_lib/iclosed.js';
import { resolveInternal } from '../_lib/closers.js';

export default async function handler(req, res) {
  // Auth: accept either the Bearer header (Vercel cron) or ?key= query
  // param (manual browser trigger). Matches the pattern used by iclosed/sync
  // and segmetrics/sync.
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const queryKey = req.query?.key;
    if (!queryKey || queryKey !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  if (!process.env.ICLOSED_API_KEY) {
    return res.status(500).json({ error: 'Missing ICLOSED_API_KEY environment variable' });
  }

  // Debug mode — dumps raw /v1/users response so we can see what iClosed
  // is actually returning. Hit /api/iclosed/seed-users?key=...&debug=1
  if (req.query?.debug === '1') {
    try {
      const raw = await iclosedFetch('/v1/users?limit=100');
      // Try common pagination variants in case the first didn't return anything
      const rawOffset = await iclosedFetch('/v1/users?limit=100&offset=0').catch((e) => ({ error: e.message }));
      const rawPage = await iclosedFetch('/v1/users?limit=100&page=1').catch((e) => ({ error: e.message }));

      const summarise = (r) => {
        if (!r || typeof r !== 'object') return { type: typeof r, value: r };
        const keys = Object.keys(r);
        const dataKeys = r.data && typeof r.data === 'object' ? Object.keys(r.data) : null;
        const inferredUsers = (() => {
          if (Array.isArray(r)) return r;
          if (Array.isArray(r.users)) return r.users;
          if (Array.isArray(r.items)) return r.items;
          if (Array.isArray(r.data)) return r.data;
          if (r.data?.users && Array.isArray(r.data.users)) return r.data.users;
          if (r.data?.items && Array.isArray(r.data.items)) return r.data.items;
          return null;
        })();
        return {
          topLevelKeys: keys,
          dataKeys,
          inferredUserCount: inferredUsers ? inferredUsers.length : null,
          sampleUser: inferredUsers?.[0] ?? null,
          rawTruncated: JSON.stringify(r).slice(0, 1500),
        };
      };

      return res.status(200).json({
        base:   summarise(raw),
        offset: summarise(rawOffset),
        page:   summarise(rawPage),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message, stack: err.stack });
    }
  }

  try {
    const users = await iclosedListAll('/v1/users', { pageSize: 100, maxPages: 5 });
    const supabase = getSupabaseAdmin();

    const rows = [];
    const skipped = [];
    for (const u of users) {
      const id = pick(u, 'id', 'userId');
      const name =
        pick(u, 'fullName', 'name', 'displayName') ||
        [pick(u, 'firstName'), pick(u, 'lastName')].filter(Boolean).join(' ');

      const rule = resolveInternal(name);
      if (!id || !rule) {
        skipped.push({ id: id || null, name: name || null, reason: rule ? 'missing id' : 'no name match' });
        continue;
      }

      rows.push({
        iclosed_user_id: String(id),
        internal_id: rule.internal_id,
        role: rule.role,
        display_name: name,
        active: true,
      });
    }

    if (rows.length) {
      const { error } = await supabase
        .from('iclosed_users')
        .upsert(rows, { onConflict: 'iclosed_user_id' });
      if (error) throw error;
    }

    return res.status(200).json({
      ok: true,
      seeded: rows.length,
      mappings: rows,
      skipped,
      hint: skipped.length
        ? 'Edit NAME_TO_INTERNAL in api/_lib/closers.js if any expected user is missing.'
        : undefined,
    });
  } catch (err) {
    console.error('iClosed seed-users error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { runtime: 'nodejs' };
