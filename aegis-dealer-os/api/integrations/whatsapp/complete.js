import { handleApiError, methodNotAllowed, requireText } from '../../../lib/http.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import {
  exchangeWhatsAppCode,
  sealWhatsAppToken,
  subscribeWhatsAppWebhook,
  verifyWhatsAppState,
  whatsappPhoneProfile
} from '../../../lib/meta-whatsapp.js';

function metaId(value, name) {
  const cleaned = requireText(value, name);
  if (!/^\d{5,40}$/.test(cleaned)) {
    const error = new Error(`${name} is invalid.`);
    error.statusCode = 400;
    throw error;
  }
  return cleaned;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  try {
    const state = verifyWhatsAppState(request.body?.state);
    const code = requireText(request.body?.code, 'Meta authorisation code');
    const wabaId = metaId(request.body?.wabaId, 'WhatsApp Business Account');
    const phoneNumberId = metaId(request.body?.phoneNumberId, 'WhatsApp phone number');
    const businessId = metaId(request.body?.businessId, 'Meta business');
    const supabase = supabaseAdmin();
    const { data: membership, error: membershipError } = await supabase
      .from('organisation_memberships')
      .select('role')
      .eq('organisation_id', state.organisationId)
      .eq('clerk_user_id', state.clerkUserId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      const error = new Error('You no longer have permission to connect WhatsApp for this dealer.');
      error.statusCode = 403;
      throw error;
    }

    const accessToken = await exchangeWhatsAppCode(code);
    await subscribeWhatsAppWebhook(accessToken, wabaId);
    const profile = await whatsappPhoneProfile(accessToken, phoneNumberId);
    const now = new Date().toISOString();
    const configuration = {
      credential: sealWhatsAppToken(accessToken),
      credential_version: 1,
      meta_business_id: businessId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: profile.display_phone_number || null,
      verified_name: profile.verified_name || null,
      quality_rating: profile.quality_rating || null,
      agent_routing: 'aegis_cloud',
      last_webhook_at: null,
      last_error: null
    };
    const display = profile.display_phone_number || phoneNumberId;
    const { data: connection, error } = await supabase.from('integration_connections').upsert({
      organisation_id: state.organisationId,
      provider_config_key: 'whatsapp',
      nango_connection_id: `meta-whatsapp:${phoneNumberId}`,
      display_name: `WhatsApp · ${display}`,
      configuration,
      status: 'active',
      last_synced_at: now
    }, { onConflict: 'organisation_id,provider_config_key' }).select('id').single();
    if (error) throw error;
    await supabase.from('audit_events').insert({
      organisation_id: state.organisationId,
      actor_clerk_user_id: state.clerkUserId,
      event_type: 'integration.whatsapp.connected',
      record_type: 'integration_connections',
      record_id: connection.id,
      payload: { display_phone_number: profile.display_phone_number || null, waba_id: wabaId }
    });
    return response.status(200).json({
      status: 'connected',
      callbackUrl: `aegis-sales-os://whatsapp/callback?status=connected&phone=${encodeURIComponent(display)}`
    });
  } catch (error) {
    return handleApiError(response, error);
  }
}

