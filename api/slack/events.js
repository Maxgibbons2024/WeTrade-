import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { matchCloserByName, addMonths } from '../_lib/closers.js';

export const config = { api: { bodyParser: false } };

// Use the shared closer map from _lib/closers.js
const matchCloser = matchCloserByName;

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

  // POSITIVE SIGNALS — require at least 2
  let signals = 0;
  if (/£\s*\d{1,6}(?:,\d{3})*(?:\.\d{2})?/.test(text)) signals++;
  if (/\d+(?:\.\d+)?\s*k\b/i.test(text)) signals++;
  if (/p\/m|per\s*month|\/mo|monthly/i.test(text)) signals++;
  if (/(?:down|upfront)\s*/i.test(text)) signals++;
  if (/\b(?:Kickstarter|Mechanical\s*Mastery|Pro|Elite)\b/i.test(text)) signals++;
  if (/paid/i.test(text) && /[£\d]/.test(text)) signals++;
  if (/onboarding/i.test(text)) signals++;

  return signals >= 2;
}

// ---- Deal message parsing ----
function parseDeal(text) {
  // Try "ClientName - details" format first
  let clientName = '';
  let details = text;

  const dashIndex = text.indexOf(' - ');
  if (dashIndex > 0 && dashIndex < 50) {
    const beforeDash = text.substring(0, dashIndex).trim();
    // Check it looks like a name (starts with letter, no colons)
    if (/^[A-Za-z]/.test(beforeDash) && !beforeDash.includes(':') && beforeDash.length >= 2) {
      clientName = beforeDash;
      details = text.substring(dashIndex + 3);
    }
  }

  // If no dash format, try to extract name from start of message
  // Pattern: "FirstName [LastName...] <deal details...>"
  // The second-word group uses * (not +) so single-word names like "Maria"
  // still match — otherwise the parser silently drops them.
  if (!clientName) {
    const nameMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?=.*(?:\d+k|\d+\s*(?:down|p\/m|per month)|£|kickstarter|mechanical|pro|elite))/i);
    if (nameMatch) {
      clientName = nameMatch[1].trim();
      details = text.substring(clientName.length).trim();
    }
  }

  if (!clientName) {
    console.warn('[slack/events] parseDeal dropped message — no client name extracted:', text.slice(0, 120));
    return null;
  }

  let frontEnd = 0;
  const feK = details.match(/(\d+(?:\.\d+)?)\s*k\s*(?:down|upfront|paid)?/i);
  const feN = details.match(/£?\s*(\d{1,6}(?:,\d{3})*)\s*(?:down|upfront|paid)/i);
  if (feK) frontEnd = parseFloat(feK[1]) * 1000;
  else if (feN) frontEnd = parseFloat(feN[1].replace(/,/g, ''));

  let monthlyAmount = 0;
  const moMatch = details.match(/(\d+(?:\.\d+)?)\s*(?:p\/m|per\s*month|\/mo|monthly)/i);
  if (moMatch) monthlyAmount = parseFloat(moMatch[1]);

  // Also check for "x6 500" or "500 x 12" pattern (installments)
  if (monthlyAmount === 0) {
    const installMatch = details.match(/x\s*(\d+)\s+(\d+)/i) || details.match(/(\d+)\s*x\s*(\d+)/i);
    if (installMatch) {
      const a = parseInt(installMatch[1]);
      const b = parseInt(installMatch[2]);
      // The smaller number is likely the count, larger is the amount
      if (a <= 24 && b > a) monthlyAmount = b;
      else if (b <= 24 && a > b) monthlyAmount = a;
    }
  }

  // Reject if no financial data extracted
  if (frontEnd === 0 && monthlyAmount === 0) {
    console.warn('[slack/events] parseDeal dropped message — no £ or p/m amount extracted:', text.slice(0, 120));
    return null;
  }

  let programme = 'Kickstarter';
  const progMatch = details.match(/\b(Kickstarter|Mechanical\s*Mastery|Pro|Elite)\b/i);
  if (progMatch) {
    const p = progMatch[1].toLowerCase();
    if (p === 'kickstarter' || p === 'kickstater') programme = 'Kickstarter';
    else if (p.includes('mechanical')) programme = 'Mechanical Mastery';
    else if (p === 'pro') programme = 'Pro';
    else if (p === 'elite') programme = 'Elite';
  }
  // Also catch common typos
  if (/kickstater/i.test(details)) programme = 'Kickstarter';

  let onboardingAssignedTo = null;
  const assignMatch = details.match(/@([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (assignMatch) onboardingAssignedTo = assignMatch[1];

  let onboardingDate = null;
  const dateMatch = details.match(
    /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:on\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i
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
// Supports several message shapes seen in the #payments Slack channel.
// Returns { success, amount, client_name } or null if nothing matched.
//
// Every exit returns null via `dropped(reason)` so parser drops show up in
// Vercel logs — silent drops have bitten us before (e.g. the £500 "car"
// message was stored with client_name "car", and the "succeeded" / human
// bank-transfer messages were dropped entirely).
function parsePaymentNotification(text) {
  if (!text) return null;
  const trimmed = text.trim();

  const dropped = (reason) => {
    console.warn(`[slack/events] parsePaymentNotification dropped (${reason}):`, trimmed.slice(0, 200));
    return null;
  };

  // 1. Classic Zapier format: "True £5000.00 Julian Boden" / "False £500.00 John Smith"
  const zapier = trimmed.match(/^(True|False)\s+£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)\s+(.+)$/i);
  if (zapier) {
    return {
      success: zapier[1].toLowerCase() === 'true',
      amount: parseFloat(zapier[2].replace(/,/g, '')),
      client_name: zapier[3].trim(),
    };
  }

  // 2. Stripe "succeeded" format: "succeeded <identifier> <amount>"
  //    Identifier may be an email, a name, or something like "Mr R Monteiro Matarazzo".
  //    Amount is the last whitespace-separated token, optionally £-prefixed.
  const succeeded = trimmed.match(/^succeeded\s+(.+?)\s+£?\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)\s*$/i);
  if (succeeded) {
    return {
      success: true,
      amount: parseFloat(succeeded[2].replace(/,/g, '')),
      client_name: succeeded[1].trim(),
    };
  }

  // 3. Stripe failure lines: "<error text>requires_payment_method <name> <email> £X"
  //    We record these as failed attempts rather than dropping them — useful for
  //    chasing declined cards. Example: "Your card has insufficient funds.requires_payment_method David Paines davidpaines71@gmail.com £1000"
  const failed = trimmed.match(/requires_payment_method\s+(.+?)\s+\S+@\S+\s+£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)/i);
  if (failed) {
    return {
      success: false,
      amount: parseFloat(failed[2].replace(/,/g, '')),
      client_name: failed[1].trim(),
    };
  }

  // 4. Hand-typed bank transfer, amount first: "£1,000 bank transfer Arasartnam Puvanenthiran"
  const bankFirst = trimmed.match(/^£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)\s+bank\s*transfer\s+(.+)$/i);
  if (bankFirst) {
    return {
      success: true,
      amount: parseFloat(bankFirst[1].replace(/,/g, '')),
      client_name: bankFirst[2].trim(),
    };
  }

  // 5. Hand-typed bank transfer, name first: "Alan OConnor £1,000 Bank transfer"
  const bankLast = trimmed.match(/^(.+?)\s+£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)\s+bank\s*transfer\s*$/i);
  if (bankLast) {
    return {
      success: true,
      amount: parseFloat(bankLast[2].replace(/,/g, '')),
      client_name: bankLast[1].trim(),
    };
  }

  return dropped('no pattern matched');
}

// ---- Session booking parsing (Calendly via Zapier) ----
// Messages typically contain student name, date/time, and mentor name
function parseSessionBooking(text) {
  if (!text) return null;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let studentName = null;
  let sessionDate = null;
  let mentorName = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Look for name patterns
    const nameMatch = line.match(/(?:name|student|client|invitee)[:\s]+(.+)/i);
    if (nameMatch) studentName = nameMatch[1].trim();

    // Look for date patterns
    const dateMatch = line.match(/(?:date|time|scheduled|start)[:\s]+(.+)/i);
    if (dateMatch) sessionDate = dateMatch[1].trim();

    // Look for mentor/host patterns
    const mentorMatch = line.match(/(?:mentor|host|with|assigned)[:\s]+(.+)/i);
    if (mentorMatch) mentorName = mentorMatch[1].trim();
  }

  // If no structured fields found, try to extract name from first line
  if (!studentName && lines.length > 0) {
    const firstLine = lines[0];
    // Skip if it looks like a bot header or URL
    if (!/^http|^<|^new\s+event/i.test(firstLine)) {
      studentName = firstLine.replace(/[:\-].*$/, '').trim();
    }
  }

  if (!studentName) return null;
  return { studentName, sessionDate, mentorName };
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

      // Only bump a plan's total_collected on a SUCCESSFUL payment. Failed
      // attempts (declined cards, insufficient funds, etc.) are still
      // recorded as receipts so the merge UI can show them, but they must
      // not affect the plan's cash totals.
      if (payment.success && matchedPlans && matchedPlans.length === 1) {
        const plan = matchedPlans[0];
        paymentPlanId = plan.id;
        matched = true;

        // Update the payment plan
        const newCollected = Number(plan.total_collected) + payment.amount;
        const newMonthsRemaining = Math.max(0, plan.months_remaining - 1);
        const nextDue = addMonths(new Date(plan.next_due_date), 1);
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

    // --- Community channel (Calendly session bookings) ---
    if (channel === process.env.SLACK_CHANNEL_COMMUNITY) {
      const session = parseSessionBooking(text);
      if (!session) {
        return res.status(200).json({ ok: true, ignored: 'not a session booking' });
      }

      const supabase = getSupabase();

      // Find student by name (case-insensitive partial match)
      const { data: matches } = await supabase
        .from('deals')
        .select('id, client_name, session_count, last_session_date, mentor_name')
        .ilike('client_name', `%${session.studentName}%`);

      if (!matches || matches.length === 0) {
        return res.status(200).json({ ok: true, ignored: `no student found: ${session.studentName}` });
      }

      const student = matches[0];
      const today = new Date().toISOString().split('T')[0];
      const updatePayload = {
        session_count: (student.session_count || 0) + 1,
        last_session_date: today,
      };
      // Update mentor if provided and not already set
      if (session.mentorName && !student.mentor_name) {
        updatePayload.mentor_name = session.mentorName;
      }

      await supabase.from('deals').update(updatePayload).eq('id', student.id);
      return res.status(200).json({ ok: true, type: 'session_booking', student: student.client_name, sessions: updatePayload.session_count });
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
