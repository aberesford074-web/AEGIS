import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext } from '../../lib/supabase.js';

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    if (request.method === 'GET') {
      const { data, error } = await context.supabase.from('approval_queue').select('*').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return response.status(200).json({ items: data });
    }
    const actionType = requireText(request.body?.actionType, 'Action type');
    if (!request.body?.payload || typeof request.body.payload !== 'object') throw new Error('Approval payload is required.');
    if (actionType === 'send_email') {
      const to = requireText(request.body.payload.to, 'Recipient');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        const error = new Error('A valid recipient email address is required.');
        error.statusCode = 400;
        throw error;
      }
      requireText(request.body.payload.subject, 'Email subject');
      requireText(request.body.payload.body, 'Email body');
    }
    const { data, error } = await context.supabase.from('approval_queue').insert({ organisation_id: orgId, requested_by_clerk_user_id: session.clerkUserId, action_type: actionType, payload: request.body.payload, expires_at: request.body?.expiresAt || null }).select('*').single();
    if (error) throw error;
    return response.status(201).json({ item: data });
  } catch (error) {
    return handleApiError(response, error);
  }
}
