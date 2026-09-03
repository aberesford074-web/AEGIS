import { requireOrganisationSession } from '../../lib/auth.js';
import { uniqueCampaignRecipients, campaignCanTransition } from '../../lib/campaigns.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext, requireManager } from '../../lib/supabase.js';

const statuses = new Set(['draft', 'scheduled']);

async function audienceRows(context, audience) {
  let query = context.supabase
    .from('contacts')
    .select('id,first_name,last_name,email,email_marketing_status')
    .eq('organisation_id', context.organisation.id)
    .not('email', 'is', null);
  if (audience !== 'all_eligible') query = query.eq('email_marketing_status', 'subscribed');
  const { data, error } = await query.limit(5000);
  if (error) throw error;
  return uniqueCampaignRecipients(data || []);
}

async function queueAudience(context, campaign, audience) {
  const recipients = await audienceRows(context, audience);
  const rows = recipients.map((recipient) => ({
    organisation_id: context.organisation.id,
    campaign_id: campaign.id,
    ...recipient
  }));
  if (rows.length) {
    const { error } = await context.supabase.from('email_campaign_recipients').upsert(rows, {
      onConflict: 'campaign_id,email', ignoreDuplicates: true
    });
    if (error) throw error;
  }
  const sendable = recipients.filter((item) => item.status === 'queued').length;
  const { data, error } = await context.supabase.from('email_campaigns').update({
    recipient_count: sendable,
    audience_filter: { marketingStatus: audience === 'all_eligible' ? 'all_eligible' : 'subscribed' }
  }).eq('id', campaign.id).eq('organisation_id', context.organisation.id).select('*').single();
  if (error) throw error;
  return data;
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    if (request.method === 'GET') {
      let query = context.supabase.from('email_campaigns').select('*').eq('organisation_id', orgId);
      if (request.query?.status) query = query.eq('status', String(request.query.status));
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(250);
      if (error) throw error;
      return response.status(200).json({ items: data || [] });
    }

    requireManager(context.membership);
    if (request.method === 'POST') {
      const status = statuses.has(request.body?.status) ? request.body.status : 'draft';
      const scheduledAt = status === 'scheduled'
        ? new Date(request.body?.scheduledAt || request.body?.scheduled_at || Date.now()).toISOString()
        : null;
      const payload = {
        organisation_id: orgId,
        name: requireText(request.body?.name, 'Campaign name'),
        subject: requireText(request.body?.subject, 'Email subject'),
        body: requireText(request.body?.body, 'Email body'),
        status,
        scheduled_at: scheduledAt,
        audience_filter: { marketingStatus: request.body?.audience === 'all_eligible' ? 'all_eligible' : 'subscribed' },
        created_by_clerk_user_id: session.clerkUserId
      };
      const { data, error } = await context.supabase.from('email_campaigns').insert(payload).select('*').single();
      if (error) throw error;
      let item = status === 'scheduled' ? await queueAudience(context, data, request.body?.audience) : data;
      if (status === 'scheduled' && item.recipient_count === 0) {
        const result = await context.supabase.from('email_campaigns').update({
          status: 'draft', scheduled_at: null,
          last_error: 'No eligible recipients. Add subscribed contacts or explicitly choose all eligible contacts.'
        }).eq('id', data.id).eq('organisation_id', orgId).select('*').single();
        if (result.error) throw result.error;
        item = result.data;
      }
      await context.supabase.from('audit_events').insert({
        organisation_id: orgId, actor_clerk_user_id: session.clerkUserId,
        event_type: status === 'scheduled' ? 'campaign.scheduled' : 'campaign.created',
        record_type: 'email_campaign', record_id: data.id,
        payload: { scheduledAt, recipients: item.recipient_count }
      });
      return response.status(201).json({ item });
    }

    const id = requireText(request.body?.id, 'Campaign ID');
    const { data: current, error: readError } = await context.supabase.from('email_campaigns').select('*')
      .eq('id', id).eq('organisation_id', orgId).maybeSingle();
    if (readError) throw readError;
    if (!current) return response.status(404).json({ error: 'Campaign not found.' });
    const action = requireText(request.body?.action, 'Campaign action');
    const nextStatus = action === 'pause' ? 'paused' : ['resume', 'schedule'].includes(action) ? 'scheduled' : action === 'cancel' ? 'cancelled' : null;
    if (!nextStatus || !campaignCanTransition(current.status, nextStatus)) {
      return response.status(409).json({ error: `Campaign cannot ${action} while it is ${current.status}.` });
    }
    let update = { status: nextStatus };
    if (nextStatus === 'scheduled') {
      update.scheduled_at = new Date(request.body?.scheduledAt || Date.now()).toISOString();
      update.last_error = null;
    }
    const { data, error } = await context.supabase.from('email_campaigns').update(update)
      .eq('id', id).eq('organisation_id', orgId).select('*').single();
    if (error) throw error;
    const item = nextStatus === 'scheduled' && current.recipient_count === 0
      ? await queueAudience(context, data, current.audience_filter?.marketingStatus)
      : data;
    await context.supabase.from('audit_events').insert({
      organisation_id: orgId, actor_clerk_user_id: session.clerkUserId,
      event_type: `campaign.${nextStatus}`, record_type: 'email_campaign', record_id: id
    });
    return response.status(200).json({ item });
  } catch (error) {
    return handleApiError(response, error);
  }
}
