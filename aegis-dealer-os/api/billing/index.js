import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../lib/http.js';
import { createCustomerPortalSession } from '../../lib/stripe-billing.js';
import { organisationContext } from '../../lib/supabase.js';

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
  try {
    const context = await organisationContext(await requireOrganisationSession(request));
    const organisationID = context.organisation.id;
    if (request.method === 'GET') {
      const { data, error } = await context.supabase.from('billing_subscriptions')
        .select('status,cancel_at_period_end,current_period_end,last_payment_at,last_payment_failed_at')
        .eq('organisation_id', organisationID)
        .maybeSingle();
      if (error) throw error;
      return response.status(200).json({ billing: data || { status: context.organisation.billing_required ? 'not_started' : 'not_required' } });
    }
    if (!['owner', 'manager'].includes(context.membership.role)) {
      return response.status(403).json({ error: 'Only a portal owner or manager can manage billing.' });
    }
    const portal = await createCustomerPortalSession({ supabase: context.supabase, organisationID });
    return response.status(200).json(portal);
  } catch (error) {
    return handleApiError(response, error);
  }
}
