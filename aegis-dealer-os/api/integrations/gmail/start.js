import { requireOrganisationSession } from '../../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../../lib/http.js';
import { organisationContext, requireManager } from '../../../lib/supabase.js';
import { createGmailState, gmailAuthorizationURL } from '../../../lib/google-gmail.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    requireManager(context.membership);
    const state = createGmailState({
      organisationId: context.organisation.id,
      clerkUserId: session.clerkUserId
    });
    return response.status(200).json({
      authorizationUrl: gmailAuthorizationURL(state),
      provider: 'gmail'
    });
  } catch (error) {
    return handleApiError(response, error);
  }
}
