import { requireOrganisationSession } from '../../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../../lib/http.js';
import { organisationContext, requireManager } from '../../../lib/supabase.js';
import { createWhatsAppState, whatsappConnectURL, whatsappPlatformReadiness } from '../../../lib/meta-whatsapp.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    requireManager(context.membership);
    const readiness = whatsappPlatformReadiness();
    if (!readiness.ready) {
      const error = new Error('WhatsApp setup is not active yet. AEGIS support must finish the Meta business configuration first.');
      error.statusCode = 503;
      throw error;
    }
    const state = createWhatsAppState({
      organisationId: context.organisation.id,
      clerkUserId: session.clerkUserId
    });
    return response.status(200).json({
      authorizationUrl: whatsappConnectURL(state),
      provider: 'whatsapp'
    });
  } catch (error) {
    return handleApiError(response, error);
  }
}

