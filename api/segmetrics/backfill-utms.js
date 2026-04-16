import { getSupabaseAdmin } from '../_lib/supabase.js';

// One-time backfill: copies utm_campaign/utm_source/utm_medium from
// iclosed_calls to their matched deals. Much higher match rate than
// the SegMetrics contact API approach because iClosed already tracks
// UTMs on every booking and the sync already links calls to deals.
//
// Hit /api/segmetrics/backfill-utms?key=YOUR_CRON_SECRET

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const queryKey = req.query?.key;
    if (!queryKey || queryKey !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get all iClosed calls that have a deal_id AND utm_campaign
    const { data: calls, error: callsErr } = await supabase
      .from('iclosed_calls')
      .select('deal_id, utm_campaign, utm_source, utm_medium, contact_email')
      .not('deal_id', 'is', null)
      .not('utm_campaign', 'is', null)
      .neq('utm_campaign', '');

    if (callsErr) throw callsErr;

    if (!calls || calls.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No iClosed calls with both deal_id and utm_campaign found',
        count: 0,
      });
    }

    // Dedupe: one deal might have multiple calls, take the first one with UTM data
    const dealUtmMap = new Map();
    for (const call of calls) {
      if (!dealUtmMap.has(call.deal_id)) {
        dealUtmMap.set(call.deal_id, {
          utm_campaign: call.utm_campaign,
          utm_source: call.utm_source || null,
          utm_medium: call.utm_medium || null,
          email: call.contact_email || null,
        });
      }
    }

    // Get deals that don't have utm_campaign yet
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id')
      .or('utm_campaign.is.null,utm_campaign.eq.');

    if (dealsErr) throw dealsErr;

    const unattributedIds = new Set((deals || []).map((d) => d.id));

    // Update each unattributed deal that has a matching iClosed call
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const [dealId, utmData] of dealUtmMap.entries()) {
      if (!unattributedIds.has(dealId)) {
        skipped++;
        continue;
      }

      const updates = { utm_campaign: utmData.utm_campaign };
      if (utmData.utm_source) updates.utm_source = utmData.utm_source;
      if (utmData.utm_medium) updates.utm_medium = utmData.utm_medium;
      if (utmData.email) updates.email = utmData.email;

      const { error: updateErr } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', dealId);

      if (updateErr) {
        errors.push(`${dealId}: ${updateErr.message}`);
      } else {
        updated++;
      }
    }

    return res.status(200).json({
      ok: true,
      callsWithUtm: calls.length,
      uniqueDeals: dealUtmMap.size,
      unattributedDeals: unattributedIds.size,
      updated,
      skipped,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('UTM backfill error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { runtime: 'nodejs' };
