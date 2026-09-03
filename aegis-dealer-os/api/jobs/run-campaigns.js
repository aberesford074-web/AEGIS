import { campaignProgress } from '../../lib/campaigns.js';
import { refreshGmailCredentials, sealGmailCredentials, sendGmailMessage, unsealGmailCredentials } from '../../lib/google-gmail.js';
import { supabaseAdmin } from '../../lib/supabase.js';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const SEND_BATCH_SIZE = 25;
const SAFE_DAILY_LIMIT = 250;

async function gmailConnection(supabase, organisationId) {
  const { data, error } = await supabase.from('integration_connections').select('id,configuration,status')
    .eq('organisation_id', organisationId).eq('provider_config_key', 'gmail').eq('status', 'active').maybeSingle();
  if (error) throw error;
  if (!data?.configuration?.credential || !(data.configuration.granted_scopes || []).includes(GMAIL_SEND_SCOPE)) {
    throw new Error('Gmail sending is not authorised for this workspace.');
  }
  let credentials = unsealGmailCredentials(data.configuration.credential);
  if (!credentials.accessToken || Number(credentials.expiresAt || 0) < Date.now() + 60_000) {
    credentials = await refreshGmailCredentials(credentials);
    const credential = sealGmailCredentials({
      access_token: credentials.accessToken, refresh_token: credentials.refreshToken,
      expires_in: Math.max(1, Math.floor((credentials.expiresAt - Date.now()) / 1000)),
      token_type: credentials.tokenType, scope: credentials.scope
    });
    const { error: updateError } = await supabase.from('integration_connections').update({
      configuration: { ...data.configuration, credential }, last_synced_at: new Date().toISOString()
    }).eq('id', data.id).eq('organisation_id', organisationId);
    if (updateError) throw updateError;
  }
  return credentials.accessToken;
}

async function runCampaign(supabase, campaign) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday, error: countError } = await supabase.from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true }).eq('organisation_id', campaign.organisation_id)
    .eq('status', 'sent').gte('sent_at', startOfDay.toISOString());
  if (countError) throw countError;
  const allowance = Math.max(0, SAFE_DAILY_LIMIT - (sentToday || 0));
  if (!allowance) return { status: 'deferred', sent: 0, failed: 0 };

  const accessToken = await gmailConnection(supabase, campaign.organisation_id);
  await supabase.from('email_campaigns').update({ status: 'sending', started_at: campaign.started_at || new Date().toISOString() }).eq('id', campaign.id);
  const { data: recipients, error } = await supabase.from('email_campaign_recipients').select('*')
    .eq('campaign_id', campaign.id).eq('status', 'queued').order('created_at').limit(Math.min(SEND_BATCH_SIZE, allowance));
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients || []) {
    const claimed = await supabase.from('email_campaign_recipients').update({ status: 'sending' })
      .eq('id', recipient.id).eq('status', 'queued').select('id').maybeSingle();
    if (!claimed.data) continue;
    try {
      const result = await sendGmailMessage(accessToken, { to: recipient.email, subject: campaign.subject, body: campaign.body });
      await supabase.from('email_campaign_recipients').update({ status: 'sent', gmail_message_id: result.id, sent_at: new Date().toISOString(), error: null }).eq('id', recipient.id);
      sent += 1;
    } catch (sendError) {
      await supabase.from('email_campaign_recipients').update({ status: 'failed', error: String(sendError?.message || sendError) }).eq('id', recipient.id);
      failed += 1;
    }
  }
  const { count: queued } = await supabase.from('email_campaign_recipients').select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id).in('status', ['queued', 'sending']);
  const counts = campaignProgress({ recipient_count: campaign.recipient_count, sent_count: campaign.sent_count + sent, failed_count: campaign.failed_count + failed });
  const completed = (queued || 0) === 0;
  await supabase.from('email_campaigns').update({
    status: completed ? 'completed' : 'sending', sent_count: counts.sent, failed_count: counts.failed,
    completed_at: completed ? new Date().toISOString() : null
  }).eq('id', campaign.id);
  return { status: completed ? 'completed' : 'sending', sent, failed };
}

export default async function handler(request, response) {
  if (!process.env.CRON_SECRET || request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({ error: 'Unauthorised cron request.' });
  }
  const supabase = supabaseAdmin();
  const { data: campaigns, error } = await supabase.from('email_campaigns').select('*')
    .in('status', ['scheduled', 'sending']).lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(10);
  if (error) return response.status(500).json({ error: 'Unable to load scheduled campaigns.' });
  const results = [];
  for (const campaign of campaigns || []) {
    try {
      results.push({ campaignId: campaign.id, ...(await runCampaign(supabase, campaign)) });
    } catch (runError) {
      const message = String(runError?.message || runError);
      await supabase.from('email_campaigns').update({ status: 'failed', last_error: message }).eq('id', campaign.id);
      results.push({ campaignId: campaign.id, status: 'failed', error: message });
    }
  }
  return response.status(200).json({ processed: results.length, results });
}
