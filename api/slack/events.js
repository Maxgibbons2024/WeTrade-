import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

// ---- Closer mapping ----
const CLOSER_MAP = {
  lloyd: { id: 'lloyd', name: 'Lloyd' },
  dave: { id: 'dave', name: 'Dave' },
  zak: { id: 'zak', name: 'Zak' },
  joe: { id: 'joe', name: 'Joe' },
};

function matchCloser(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, val] of Object.entries(CLOSER_MAP)) {
    if (lower.includes(key)) return val;
  }
  return { id: 'lloyd', name: name || 'Unknown' };
}

// ---- Supabase admin client ----
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ---- Raw body reader ----
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---- Slack signature verification ----
function verifySignature(rawBody, timestamp, signature) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const hmac = crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
  const computed = `v0=${hmac}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ---- Deal message detection (multi-signal scoring) ----
function isDealMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase();

  // NEGATIVE FILTERS — reject known non-deal patterns
  if (lower.includes('leaderboard') || lower.includes('scoreboard')) return false;
  if (lower.includes(':trophy:') || lower.includes(':moneybag:') || lower.includes(':medal:')) return false;
  if (lower.includes(':first_place_medal:') || lower.includes(':second_place_medal:') || lower.includes(':third_place_medal:')) return false;
  if (lower.includes('daily update') || lower.includes('weekly update')) return false;
  // Reject messages with 5+ "Name - Value" lines (leaderboard pattern)
  const dashLines = (text.match(/ - /g) || []).length;
  if (dashLines >= 5) return false;
  // Reject percentage values (show rate lines)
  if (/\d+\.\d+%/.test(text)) return false;

  // Must contain " - " delimiter (client name - details pattern)
  if (!text.includes(' - ')) return false;

  // The part before the first dash should look like a client name
  const dashIndex = text.indexOf(' - ');
  const beforeDash = text.substring(0, dashIndex).trim();
  // Must start with a letter, be 2-50 chars, no emoji colons
  if (!/^[A-Za-z]/.test(beforeDash) || beforeDash.length < 2 || beforeDash.length > 50) return false;
  if (beforeDash.includes(':')) return false;

  const afterDash = text.substring(dashIndex + 3);

  // POSITIVE SIGNALS — require at least 2
  let signals = 0;
  if (/£\s*\d{1,6}(?:,\d{3})*(?:\.\d{2})?/.test(afterDash)) signals++;
  if (/\d+(?:\.\d+)?\s*k\b/i.test(afterDash)) signals++;
  if (/p\/m|per\s*month|\/mo|monthly/i.test(afterDash)) signals++;
  if (/(?:down|upfront)\s*/i.test(afterDash)) signals++;
  if (/\b(?:Kickstarter|Mechanical\s*Mastery|Pro|Elite)\b/i.test(afterDash)) signals++;
  if (/paid/i.test(afterDash) && /[£\d]/.test(afterDash)) signals++;

  return signals >= 2;
}

// ---- Deal message parsing ----
function parseDeal(text) {
  const dashIndex = text.indexOf(' - ');
  if (dashIndex < 0) return null;
  const clientName = text.substring(0, dashIndex).trim();
  const details = text.substring(dashIndex + 3);
  if (!clientName) return null;

  let frontEnd = 0;
  const feK = details.match(/(\d+(?:\.\d+)?)\s*k\s*(?:down|upfront|paid)/i);
  const feN = details.match(/£?\s*(\d{1,6}(?:,\d{3})*)\s*(?:down|upfront|paid)/i);
  if (feK) frontEnd = parseFloat(feK[1]) * 1000;
  else if (feN) frontEnd = parseFloat(feN[1].replace(/,/g, ''));

  let monthlyAmount = 0;
  const moMatch = details.match(/(\d+(?:\.\d+)?)\s*(?:p\/m|per\s*month|\/mo|monthly)/i);
  if (moMatch) monthlyAmount = parseFloat(moMatch[1]);

  // Reject if no financial data extracted
  if (frontEnd === 0 && monthlyAmount === 0) return null;

  let programme = 'Kickstarter';
  const progMatch = details.match(/\b(Kickstarter|Mechanical\s*Mastery|Pro|Elite)\b/i);
  if (progMatch) {
    const p = progMatch[1].toLowerCase();
    if (p === 'kickstarter') programme = 'Kickstarter';
    else if (p.includes('mechanical')) programme = 'Mechanical Mastery';
    else if (p === 'pro') programme = 'Pro';
    else if (p === 'elite') programme = 'Elite';
  }

  let onboardingAssignedTo = null;
  const assignMatch = details.match(/@([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (assignMatch) onboardingAssignedTo = assignMatch[1];

  let onboardingDate = null;
  const dateMatch = details.match(
    /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:on\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i
  );
  if (dateMatch) {
    const parsed = new Date(`${dateMatch[2]} ${dateMatch[3]} ${new Date().getFullYear()} ${dateMatch[1]}`);
    if (!isNaN(parsed.getTime())) onboardingDate = parsed.toISOString();
  }

  return {
    client_name: clientName,
    front_end: frontEnd,
    monthly_amount: monthlyAmount,
    programme,
    onboarding_date: onboardingDate,
    onboarding_assigned_to: onboardingAssignedTo,
    notes: details.trim(),
    status: onboardingDate ? 'onboarding' : 'active',
  };
}

// ---- EOD report parsing ----
function isEodMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes('eod') || lower.includes('end of day');
}

function parseEod(text) {
  const lines = text.split('\n');
  const calls = [];
  for (const line of lines) {
    const match = line.match(/^\s*\d+[.)]\s*(.+?)\s*[-\u2013\u2014]\s*(.+)$/);
    if (!match) continue;
    const clientName = match[1].trim();
    const outcomeText = match[2].trim().toLowerCase();
    let outcome = 'follow_up';
    let dealValue = null;
    if (/no\s*show|no-show|noshow/.test(outcomeText)) {
      outcome = 'no_show';
    } else if (/closed|£|signed/.test(outcomeText)) {
      outcome = 'closed';
      const valMatch = outcomeText.match(/£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)/);
      if (valMatch) dealValue = parseFloat(valMatch[1].replace(/,/g, ''));
      const kMatch = outcomeText.match(/(\d+(?:\.\d+)?)\s*k/i);
      if (kMatch && !valMatch) dealValue = parseFloat(kMatch[1]) * 1000;
    } else if (/not interested|not ready|declined/.test(outcomeText)) {
      outcome = 'not_interested';
    } else if (/reschedule|rebook|moved/.test(outcomeText)) {
      outcome = 'rescheduled';
    } else if (/follow|callback|call back|think about/.test(outcomeText)) {
      outcome = 'follow_up';
    }
    calls.push({ client_name: clientName, outcome, deal_value: dealValue, notes: match[2].trim(), raw_text: line.trim() });
  }
  return calls;
}

// ---- Payment notification parsing ----
// Format: "True £5000.00 Julian Boden" or "False £500.00 John Smith"
function parsePaymentNotification(text) {
  if (!text) return null;
  const match = text.match(/^(True|False)\s+£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)\s+(.+)$/i);
  if (!match) return null;
  return {
    success: match[1].toLowerCase() === 'true',
    amount: parseFloat(match[2].replace(/,/g, '')),
    client_name: match[3].trim(),
  };
}

// ---- Main handler ----
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.headers['x-slack-retry-num']) {
    return res.status(200).json({ ok: true, skipped: 'retry' });
  }

  let rawBody, body;
  try {
    rawBody = await readBody(req);
    body = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // Handle Slack URL verification challenge
  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  try {
    if (!verifySignature(rawBody, req.headers['x-slack-request-timestamp'], req.headers['x-slack-signature'])) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = body.event;
    if (!event || event.type !== 'message') {
      return res.status(200).json({ ok: true, ignored: 'not a message' });
    }

    const channel = event.channel;
    const text = event.text || '';
    const messageTs = event.ts || '';

    // --- Payment notification channel (allow bot messages) ---
    if (channel === process.env.SLACK_CHANNEL_DEALS) {
      const payment = parsePaymentNotification(text);
      if (!payment) {
        return res.status(200).json({ ok: true, ignored: 'not a payment notification' });
      }

      const supabase = getSupabase();

      // Dedup
      const { data: existing } = await supabase
        .from('payment_receipts')
        .select('id')
        .eq('slack_message_ts', messageTs)
        .limit(1);
      if (existing && existing.length > 0) {
        return res.status(200).json({ ok: true, skipped: 'duplicate' });
      }

      // Try to match against active payment plans
      const { data: matchedPlans } = await supabase
        .from('payment_plans')
        .select('id, client_name, monthly_amount, total_collected, total_value, months_remaining, next_due_date')
        .neq('status', 'completed')
        .ilike('client_name', `%${payment.client_name}%`);

      let paymentPlanId = null;
      let matched = false;

      if (matchedPlans && matchedPlans.length === 1) {
        const plan = matchedPlans[0];
        paymentPlanId = plan.id;
        matched = true;

        // Update the payment plan
        const newCollected = Number(plan.total_collected) + payment.amount;
        const newMonthsRemaining = Math.max(0, plan.months_remaining - 1);
        const nextDue = new Date(plan.next_due_date);
        nextDue.setMonth(nextDue.getMonth() + 1);
        const today = new Date().toISOString().split('T')[0];

        let newStatus = 'active';
        if (newMonthsRemaining === 0 || newCollected >= Number(plan.total_value)) {
          newStatus = 'completed';
        }

        await supabase.from('payment_plans').update({
          total_collected: newCollected,
          months_remaining: newMonthsRemaining,
          next_due_date: nextDue.toISOString().split('T')[0],
          last_payment_date: today,
          last_payment_confirmed: true,
          status: newStatus,
        }).eq('id', plan.id);
      }

      // Insert receipt
      await supabase.from('payment_receipts').insert([{
        client_name: payment.client_name,
        amount: payment.amount,
        success: payment.success,
        payment_plan_id: paymentPlanId,
        slack_message_ts: messageTs,
        raw_text: text,
        matched,
      }]);

      return res.status(200).json({ ok: true, type: 'payment_receipt', matched });
    }

    // --- Sales team chat & EOD (skip edits, bot messages, etc.) ---
    if (event.subtype) {
      return res.status(200).json({ ok: true, ignored: 'not a user message' });
    }
    const closer = await resolveCloser(event.user);

    if (channel === process.env.SLACK_CHANNEL_SALES && isDealMessage(text)) {
      const supabase = getSupabase();
      const { data: existing } = await supabase.from('deals').select('id').eq('source', 'slack').like('notes', `%${messageTs}%`).limit(1);
      if (existing && existing.length > 0) return res.status(200).json({ ok: true, skipped: 'duplicate' });

      const parsed = parseDeal(text);
      if (parsed) {
        await supabase.from('deals').insert([{
          ...parsed,
          closer_id: closer.id,
          closer_name: closer.name,
          source: 'slack',
          payment_method: 'stripe',
          notes: parsed.notes ? `${parsed.notes} [ts:${messageTs}]` : `[ts:${messageTs}]`,
        }]);
      }
      return res.status(200).json({ ok: true, type: 'deal' });
    }

    // --- EOD reports ---
    if (channel === process.env.SLACK_CHANNEL_EOD && isEodMessage(text)) {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from('eod_calls')
        .select('id')
        .eq('slack_message_ts', messageTs)
        .limit(1);
      if (existing && existing.length > 0) return res.status(200).json({ ok: true, skipped: 'duplicate' });

      const calls = parseEod(text);
      if (calls.length === 0) return res.status(200).json({ ok: true, ignored: 'no calls parsed' });

      const today = new Date().toISOString().split('T')[0];
      const rows = calls.map((call) => ({
        report_date: today,
        closer_id: closer.id,
        closer_name: closer.name,
        client_name: call.client_name,
        outcome: call.outcome,
        deal_value: call.deal_value,
        notes: call.notes,
        slack_message_ts: messageTs,
        raw_text: call.raw_text,
      }));

      await supabase.from('eod_calls').insert(rows);
      return res.status(200).json({ ok: true, type: 'eod' });
    }

    return res.status(200).json({ ok: true, ignored: 'no matching channel or filter' });
  } catch (err) {
    console.error('Slack events handler error:', err);
    return res.status(200).json({ ok: false, error: err.message });
  }
}

async function resolveCloser(slackUserId) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !slackUserId) return matchCloser('');

  try {
    const resp = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (data.ok && data.user) {
      const realName = data.user.real_name || data.user.profile?.real_name || data.user.name || '';
      return matchCloser(realName);
    }
  } catch (err) {
    console.error('Failed to resolve Slack user:', err);
  }

  return matchCloser('');
}
