import { requireOrganisationSession } from '../../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../../lib/http.js';
import { organisationContext } from '../../../lib/supabase.js';
import { whatsappPlatformReadiness } from '../../../lib/meta-whatsapp.js';
import { whatsappAgentReadiness } from '../../../lib/whatsapp-agent.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
  try {
    const context = await organisationContext(await requireOrganisationSession(request));
    const { data: connection, error } = await context.supabase
      .from('integration_connections')
      .select('id, display_name, configuration, status, last_synced_at, created_at')
      .eq('organisation_id', context.organisation.id)
      .eq('provider_config_key', 'whatsapp')
      .maybeSingle();
    if (error) throw error;

    let unread = 0;
    let conversations = 0;
    if (connection?.id) {
      const [{ count: conversationCount, error: conversationError }, { data: unreadRows, error: unreadError }] = await Promise.all([
        context.supabase.from('whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('organisation_id', context.organisation.id),
        context.supabase.from('whatsapp_conversations').select('unread_count').eq('organisation_id', context.organisation.id)
      ]);
      if (conversationError) throw conversationError;
      if (unreadError) throw unreadError;
      conversations = conversationCount || 0;
      unread = (unreadRows || []).reduce((total, item) => total + Number(item.unread_count || 0), 0);
    }

    const readiness = whatsappPlatformReadiness();
    const agent = whatsappAgentReadiness();
    return response.status(200).json({
      platformReady: readiness.ready,
      agentReady: agent.ready,
      agentModel: agent.model,
      status: connection?.status || (readiness.ready ? 'ready_to_connect' : 'setup_required'),
      connection: connection ? {
        id: connection.id,
        displayName: connection.display_name,
        displayPhoneNumber: connection.configuration?.display_phone_number || null,
        verifiedName: connection.configuration?.verified_name || null,
        lastWebhookAt: connection.configuration?.last_webhook_at || null,
        lastError: connection.configuration?.last_error || null,
        lastSyncedAt: connection.last_synced_at
      } : null,
      conversations,
      unread,
      webhookUrl: readiness.webhookUrl,
      setupMessage: readiness.ready
        ? (agent.ready ? null : 'WhatsApp can connect, but AEGIS support must activate the hosted reasoning worker before automatic replies begin.')
        : 'AEGIS support must finish the Meta business verification and WhatsApp platform setup before dealers can connect.'
    });
  } catch (error) {
    return handleApiError(response, error);
  }
}
