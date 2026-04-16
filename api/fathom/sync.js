import { getSupabaseAdmin } from '../_lib/supabase.js';
import { matchCloserByNameAndEmail } from '../_lib/closers.js';

// Correct Fathom API base URL
const FATHOM_BASE = 'https://api.fathom.ai/external/v1';

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

    // Fetch meetings from Fathom API using cursor-based pagination.
    // Fathom uses created_after/created_before for date filtering.
    const allRows = [];
    let pageCursor = null;
    let pageCount = 0;

    do {
      const params = new URLSearchParams({
        created_after: `${since}T00:00:00Z`,
        created_before: `${until}T23:59:59Z`,
      });
      if (pageCursor) params.set('cursor', pageCursor);

      const url = `${FATHOM_BASE}/meetings?${params}`;
      const fathomResp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${fathomApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!fathomResp.ok) {
        const errText = await fathomResp.text();
        return res.status(502).json({
          error: `Fathom API error: ${fathomResp.status}`,
          detail: errText,
        });
      }

      const data = await fathomResp.json();
      const meetings = data.meetings || data.data || data || [];

      if (!Array.isArray(meetings) || meetings.length === 0) break;

      for (const meeting of meetings) {
        // Resolve closer from the recorder's name/email
        const recorderName = meeting.recorded_by?.name || '';
        const recorderEmail = meeting.recorded_by?.email || '';
        const closer = matchCloserByNameAndEmail(recorderName, recorderEmail);

        // Calculate duration from recording timestamps (Fathom has no duration field)
        let duration = 0;
        if (meeting.recording_start_time && meeting.recording_end_time) {
          duration = Math.round(
            (new Date(meeting.recording_end_time) - new Date(meeting.recording_start_time)) / 1000
          );
        }

        const isNoShow = duration < 60;
        const callDate = (meeting.created_at || meeting.recording_start_time || '').split('T')[0];

        allRows.push({
          call_date: callDate || since,
          closer_id: closer.id,
          closer_name: closer.name,
          fathom_call_id: String(meeting.recording_id || meeting.id || `fathom_${Date.now()}_${Math.random().toString(36).slice(2)}`),
          duration_seconds: duration,
          talk_time_seconds: 0, // Fathom API doesn't provide talk_time directly
          outcome: isNoShow ? 'no_show' : null,
          no_show: isNoShow,
          transcript_url: meeting.url || meeting.share_url || null,
        });
      }

      // Cursor-based pagination
      pageCursor = data.cursor || data.next_cursor || null;
      pageCount++;
      if (pageCount > 100) break; // safety limit
    } while (pageCursor);

    if (allRows.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No meetings returned by Fathom',
        since,
        until,
        count: 0,
      });
    }

    // Deduplicate: check which fathom_call_ids already exist
    const fathomIds = allRows.map((r) => r.fathom_call_id);
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
        message: 'All meetings already synced',
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
      message: `Synced ${inserted} Fathom meetings`,
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
