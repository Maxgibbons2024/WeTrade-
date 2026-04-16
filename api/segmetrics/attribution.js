import { getSupabaseAdmin } from '../_lib/supabase.js';

// Looks up contacts in SegMetrics by email to get their ad attribution
// (utm_campaign, utm_source, etc.), then writes that attribution back
// to the matching deal in Supabase.
//
// Chain: SegMetrics (email → campaign) → iclosed_calls (email → deal_id) → deals (utm_campaign)
//
// Run manually: /api/segmetrics/attribution?key=YOUR_CRON_SECRET
// Or on a schedule via vercel.json cron.

const SEGMETRICS_BASE = 'https://api.segmetrics.io';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const queryKey = req.query?.key;
    if (!queryKey || queryKey !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const apiKey = process.env.SEGMETRICS_API_KEY;
  const accountId = process.env.SEGMETRICS_ACCOUNT_ID;
  if (!apiKey) return res.status(500).json({ error: 'Missing SEGMETRICS_API_KEY' });
  if (!accountId) return res.status(500).json({ error: 'Missing SEGMETRICS_ACCOUNT_ID' });

  try {
    const supabase = getSupabaseAdmin();

    // 1. Get all deals that don't have utm_campaign set yet
    const { data: unattributedDeals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, client_name, email, created_at')
      .or('utm_campaign.is.null,utm_campaign.eq.');
    if (dealsErr) throw dealsErr;

    if (!unattributedDeals || unattributedDeals.length === 0) {
      return res.status(200).json({ ok: true, message: 'All deals already have attribution', count: 0 });
    }

    // 2. Get all iclosed_calls with contact_email — these link emails to deal_ids and client names
    const { data: calls, error: callsErr } = await supabase
      .from('iclosed_calls')
      .select('contact_email, contact_name, deal_id, closer_id');
    if (callsErr) throw callsErr;

    // Build lookup maps:
    // email → deal_id (from iclosed_calls that have been matched to deals)
    // client_name → email (to find emails for deals that weren't matched via deal_id)
    const emailToDealId = new Map();
    const nameLowerToEmail = new Map();
    for (const call of calls || []) {
      if (call.contact_email) {
        const email = call.contact_email.toLowerCase().trim();
        if (call.deal_id) emailToDealId.set(email, call.deal_id);
        if (call.contact_name) {
          nameLowerToEmail.set(call.contact_name.toLowerCase().trim(), email);
        }
      }
    }

    // 3. For each unattributed deal, find the contact's email
    const dealEmailPairs = [];
    for (const deal of unattributedDeals) {
      let email = deal.email?.toLowerCase().trim();

      // If deal doesn't have email directly, try to find it via iClosed name match
      if (!email && deal.client_name) {
        email = nameLowerToEmail.get(deal.client_name.toLowerCase().trim());
      }

      if (email) {
        dealEmailPairs.push({ dealId: deal.id, email, clientName: deal.client_name });
      }
    }

    if (dealEmailPairs.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No emails found for unattributed deals — cannot look up SegMetrics',
        unattributedDeals: unattributedDeals.length,
        count: 0,
      });
    }

    // 4. Look up each email in SegMetrics to get attribution
    let attributed = 0;
    let notFound = 0;
    let noAttribution = 0;
    const errors = [];
    const results = [];

    // Dedupe emails to avoid hitting the same contact multiple times
    const emailToDealIds = new Map();
    for (const pair of dealEmailPairs) {
      if (!emailToDealIds.has(pair.email)) emailToDealIds.set(pair.email, []);
      emailToDealIds.get(pair.email).push(pair.dealId);
    }

    for (const [email, dealIds] of emailToDealIds.entries()) {
      try {
        const url = `${SEGMETRICS_BASE}/${accountId}/contact/${encodeURIComponent(email)}?extend=events`;
        const resp = await fetch(url, {
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        });

        if (resp.status === 404) {
          notFound++;
          continue;
        }
        if (!resp.ok) {
          errors.push(`${email}: HTTP ${resp.status}`);
          continue;
        }

        const contact = await resp.json();

        // Extract the first-touch ad attribution from events
        const events = contact?.events || contact?.data?.events || [];
        let utmCampaign = null;
        let utmSource = null;
        let utmMedium = null;
        let adId = null;

        // Look through events for ad attribution — prefer the earliest event with a campaign
        for (const event of events) {
          if (event.utm_campaign && !utmCampaign) {
            utmCampaign = event.utm_campaign;
            utmSource = event.utm_source || null;
            utmMedium = event.utm_medium || null;
            adId = event.ad_id || null;
          }
        }

        // Also check top-level contact fields
        if (!utmCampaign) {
          utmCampaign = contact?.utm_campaign || contact?.data?.utm_campaign || null;
          utmSource = contact?.utm_source || contact?.data?.utm_source || null;
          utmMedium = contact?.utm_medium || contact?.data?.utm_medium || null;
        }

        if (!utmCampaign) {
          noAttribution++;
          continue;
        }

        // 5. Write attribution back to all deals for this email
        for (const dealId of dealIds) {
          const updates = { utm_campaign: utmCampaign };
          if (utmSource) updates.utm_source = utmSource;
          if (utmMedium) updates.utm_medium = utmMedium;
          if (!email.includes('@')) continue; // safety
          // Also store email on the deal if it doesn't have one
          updates.email = email;

          const { error: updateErr } = await supabase
            .from('deals')
            .update(updates)
            .eq('id', dealId);

          if (updateErr) {
            errors.push(`deal ${dealId}: ${updateErr.message}`);
          } else {
            attributed++;
            results.push({ dealId, email, utm_campaign: utmCampaign, utm_source: utmSource });
          }
        }

        // Rate limit: SegMetrics allows 60 req/min
        if (emailToDealIds.size > 30) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err) {
        errors.push(`${email}: ${err.message}`);
      }
    }

    return res.status(200).json({
      ok: true,
      unattributedDeals: unattributedDeals.length,
      emailsFound: dealEmailPairs.length,
      uniqueEmails: emailToDealIds.size,
      attributed,
      notFound,
      noAttribution,
      results: results.slice(0, 20), // Show first 20
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('SegMetrics attribution error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { runtime: 'nodejs', maxDuration: 300 };
