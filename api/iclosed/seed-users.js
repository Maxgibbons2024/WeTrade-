import { getSupabaseAdmin } from '../_lib/supabase.js';
import { iclosedListAll, pick } from '../_lib/iclosed.js';

// Maps iClosed display names → our internal closer/setter ids.
// Edit this list once if names differ from what iClosed returns.
const NAME_TO_INTERNAL = [
  { match: /lloyd/i,            internal_id: 'lloyd', role: 'closer' },
  { match: /dave|david/i,       internal_id: 'dave',  role: 'closer' },
  { match: /zak|zach/i,         internal_id: 'zak',   role: 'closer' },
  { match: /joe|joseph/i,       internal_id: 'joe',   role: 'closer' },
  { match: /shea/i,             internal_id: 'shea',  role: 'closer' },
  { match: /chris|christopher/i,internal_id: 'chris', role: 'closer' },
  { match: /kai/i,              internal_id: 'kai',   role: 'setter' },
];

function resolveInternal(displayName) {
  if (!displayName) return null;
  for (const rule of NAME_TO_INTERNAL) {
    if (rule.match.test(displayName)) return rule;
  }
  return null;
}

export default async function handler(req, res) {
  // Auth: cron secret OR allow direct call when CRON_SECRET unset
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.ICLOSED_API_KEY) {
    return res.status(500).json({ error: 'Missing ICLOSED_API_KEY environment variable' });
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
        ? 'Edit NAME_TO_INTERNAL in api/iclosed/seed-users.js if any expected user is missing.'
        : undefined,
    });
  } catch (err) {
    console.error('iClosed seed-users error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { runtime: 'nodejs' };
