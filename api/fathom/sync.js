import { getSupabaseAdmin } from '../_lib/supabase.js';
import { matchCloserByNameAndEmail } from '../_lib/closers.js';

export default async function handler(req, res) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const fathomApiKey = process.env.FATHOM_API_KEY;
  if (!fathomApiKey) {
    return res.status(500).json({ error: 'Missing FATHOM_API_KEY environment variable' });
  }

  try {
    // Calculate yesterday's date range (UTC)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    // Fetch calls from Fathom API
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
      return res.status(502).json({
        error: `Fathom API error: ${fathomResp.status}`,
        detail: errText,
      });
    }

    const data = await fathomResp.json();
    const calls = data.calls || data.data || data || [];

    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(200).json({ message: 'No calls found for yesterday', date: dateStr, count: 0 });
    }

    // Process each call
    const rows = calls.map((call) => {
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

      return {
        call_date: dateStr,
        closer_id: closer.id,
        closer_name: closer.name,
        fathom_call_id: call.id || call.call_id || `fathom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        duration_seconds: duration,
        talk_time_seconds: call.talk_time_seconds || call.talk_time || 0,
        outcome,
        no_show: isNoShow,
        transcript_url: call.transcript_url || call.recording_url || null,
      };
    });

    const supabase = getSupabaseAdmin();

    // Deduplicate: check which fathom_call_ids already exist
    const fathomIds = rows.map((r) => r.fathom_call_id);
    const { data: existingRows } = await supabase
      .from('fathom_calls')
      .select('fathom_call_id')
      .in('fathom_call_id', fathomIds);

    const existingIds = new Set((existingRows || []).map((r) => r.fathom_call_id));
    const newRows = rows.filter((r) => !existingIds.has(r.fathom_call_id));

    if (newRows.length === 0) {
      return res.status(200).json({ message: 'All calls already synced', date: dateStr, count: 0 });
    }

    const { error } = await supabase.from('fathom_calls').insert(newRows);
    if (error) {
      console.error('Failed to insert Fathom calls:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      message: `Synced ${newRows.length} Fathom calls`,
      date: dateStr,
      count: newRows.length,
    });
  } catch (err) {
    console.error('Fathom sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
