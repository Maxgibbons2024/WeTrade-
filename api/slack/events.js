import { verifySlackSignature, getRawBody } from '../_lib/verify-slack.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';
import { matchCloserByName } from '../_lib/closers.js';
import { isDealMessage, parseDealMessage } from '../_lib/parse-deal.js';
import { isEodMessage, parseEodReport } from '../_lib/parse-eod.js';

// Disable Vercel's default body parser so we can read the raw body for signature verification
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Skip Slack retries to avoid duplicate inserts
  if (req.headers['x-slack-retry-num']) {
    return res.status(200).json({ ok: true, skipped: 'retry' });
  }

  try {
    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody);

    // Handle Slack URL verification challenge (sent during app setup)
    if (body.type === 'url_verification') {
      return res.status(200).json({ challenge: body.challenge });
    }

    // Verify Slack signature
    const timestamp = req.headers['x-slack-request-timestamp'];
    const signature = req.headers['x-slack-signature'];

    if (!verifySlackSignature(rawBody, timestamp, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Only process message events (ignore edits, bot messages, etc.)
    const event = body.event;
    if (!event || event.type !== 'message' || event.subtype) {
      return res.status(200).json({ ok: true, ignored: 'not a user message' });
    }

    const channel = event.channel;
    const text = event.text || '';
    const messageTs = event.ts || '';

    const salesChannel = process.env.SLACK_CHANNEL_SALES;
    const eodChannel = process.env.SLACK_CHANNEL_EOD;

    // Resolve Slack user ID to real name for closer matching
    const closer = await resolveCloser(event.user);

    if (channel === salesChannel && isDealMessage(text)) {
      await handleDealMessage(text, closer, messageTs);
      return res.status(200).json({ ok: true, type: 'deal' });
    }

    if (channel === eodChannel && isEodMessage(text)) {
      await handleEodMessage(text, closer, messageTs);
      return res.status(200).json({ ok: true, type: 'eod' });
    }

    return res.status(200).json({ ok: true, ignored: 'no matching channel or filter' });
  } catch (err) {
    console.error('Slack events handler error:', err);
    // Return 200 to Slack even on errors to prevent retries
    return res.status(200).json({ ok: false, error: err.message });
  }
}

async function resolveCloser(slackUserId) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !slackUserId) {
    return matchCloserByName('');
  }

  try {
    const resp = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (data.ok && data.user) {
      const realName = data.user.real_name || data.user.profile?.real_name || data.user.name || '';
      return matchCloserByName(realName);
    }
  } catch (err) {
    console.error('Failed to resolve Slack user:', err);
  }

  return matchCloserByName('');
}

async function handleDealMessage(text, closer, messageTs) {
  const supabase = getSupabaseAdmin();

  // Deduplicate: check if we already have a deal from this Slack message
  const { data: existing } = await supabase
    .from('deals')
    .select('id')
    .eq('source', 'slack')
    .like('notes', `%${messageTs}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    return; // Already processed
  }

  const parsed = parseDealMessage(text);
  if (!parsed) return;

  const row = {
    ...parsed,
    closer_id: closer.id,
    closer_name: closer.name,
    source: 'slack',
    payment_method: 'stripe',
    notes: parsed.notes ? `${parsed.notes} [ts:${messageTs}]` : `[ts:${messageTs}]`,
  };

  const { error } = await supabase.from('deals').insert([row]);
  if (error) {
    console.error('Failed to insert deal:', error);
    throw error;
  }
}

async function handleEodMessage(text, closer, messageTs) {
  const supabase = getSupabaseAdmin();

  // Deduplicate: check if we already have EOD calls from this Slack message
  const { data: existing } = await supabase
    .from('eod_calls')
    .select('id')
    .eq('slack_message_ts', messageTs)
    .limit(1);

  if (existing && existing.length > 0) {
    return; // Already processed
  }

  const calls = parseEodReport(text);
  if (calls.length === 0) return;

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

  const { error } = await supabase.from('eod_calls').insert(rows);
  if (error) {
    console.error('Failed to insert EOD calls:', error);
    throw error;
  }
}
