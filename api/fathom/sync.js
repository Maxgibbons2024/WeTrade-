import { getSupabaseAdmin } from '../_lib/supabase.js';
import { matchCloserByNameAndEmail } from '../_lib/closers.js';

// How far back to backfill on the very first run (when fathom_calls is empty)
const BACKFILL_DAYS = 30;

export default async function handler(req, res) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also accept ?key= for manual browser triggers (same pattern as iClosed)
    const queryKey = req.query?.key;
    if (!queryKey || queryKey !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const fathomApiKey = process.env.FATHOM_API_KEY;
  if (!fathomApiKey) {
    return res.status(500).json({ error: 'Missing FATHOM_API_KEY environment variable' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Determine date range: explicit query params > auto-backfill > yesterday
    let since = req.query?.since;
    let until = req.query?.until;

    if (!since) {
      // Check if fathom_calls table is empty — if so, backfill last N days
      const { count } = await supabase
        .from('fathom_calls')
        .select('fathom_call_id', { count: 'exact', head: true });

      if (!count || count === 0) {
        console.log(`[fathom/sync] fathom_calls empty — auto-backfilling last ${BACKFILL_DAYS} days`);
        const backfillStart = new Date();
        backfillStart.setDate(backfillStart.getDate() - BACKFILL_DAYS);
        since = backfillStart.toISOString().split('T')[0];
      } else {
        // Normal daily sync: fetch yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        since = yesterday.toISOString().split('T')[0];
      }
    }

    if (!until) {
      until = new Date().toISOString().split('T')[0];
    }

    // Fetch calls from Fathom API — iterate day-by-day to avoid hitting
    // any single-request limits and to give better progress visibility.
    const allRows = [];
    const cursor = new Date(since);
    const end = new Date(until);

    while (cursor <= end) {
      const dateStr = cursor.toISOString().split('T')[0];

      const fathomResp = await fetch(
        `https://api.fathom.video/v1/calls?from=${dateStr}T00:00:00Z&to=${dateStr}T23:59:59Z`,
        {
          headers: {
            Authorization: `Bearer ${fathomApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!fathomResp.ok) {
        const errText = await fathomResp.text();
        console.error(`[fathom/sync] API error for ${dateStr}: ${fathomResp.status} ${errText}`);
        // Continue to next day rather than aborting entire sync
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      const data = await fathomResp.json();
      const calls = data.calls || data.data || data || [];

      if (Array.isArray(calls)) {
        for (const call of calls) {
          const closer = matchCloserByNameAndEmail(
            call.user_name || call.host_name || '',
            call.user_email || call.host_email || ''
          );

          const duration = call.duration_seconds || call.duration || 0;
          const isNoShow = duration < 60 || call.no_show === true;

          let outcome = null;
          if (call.outcome) {
            outcome = call.outcome;
          } else if (isNoShow) {
            outcome = 'no_show';
          }

          allRows.push({
            call_date: dateStr,
            closer_id: closer.id,
            closer_name: closer.name,
            fathom_call_id: call.id || call.call_id || `fathom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            duration_seconds: duration,
            talk_time_seconds: call.talk_time_seconds || call.talk_time || 0,
            outcome,
            no_show: isNoShow,
            transcript_url: call.transcript_url || call.recording_url || null,
          });
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    if (allRows.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No calls returned by Fathom',
        since,
        until,
        count: 0,
      });
    }

    // Deduplicate: check which fathom_call_ids already exist
    const fathomIds = allRows.map((r) => r.fathom_call_id);
    // Batch the IN query to avoid hitting URL length limits
    const existingIds = new Set();
    for (let i = 0; i < fathomIds.length; i += 500) {
      const batch = fathomIds.slice(i, i + 500);
      const { data: existingRows } = await supabase
        .from('fathom_calls')
        .select('fathom_call_id')
        .in('fathom_call_id', batch);
      for (const r of existingRows || []) {
        existingIds.add(r.fathom_call_id);
      }
    }

    const newRows = allRows.filter((r) => !existingIds.has(r.fathom_call_id));

    if (newRows.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'All calls already synced',
        since,
        until,
        fetched: allRows.length,
        count: 0,
      });
    }

    // Insert in batches of 500
    let inserted = 0;
    const errors = [];
    for (let i = 0; i < newRows.length; i += 500) {
      const batch = newRows.slice(i, i + 500);
      const { error } = await supabase.from('fathom_calls').insert(batch);
      if (error) {
        console.error('[fathom/sync] Insert error:', error.message);
        errors.push(error.message);
      } else {
        inserted += batch.length;
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Synced ${inserted} Fathom calls`,
      since,
      until,
      fetched: allRows.length,
      alreadySynced: allRows.length - newRows.length,
      inserted,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('Fathom sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
