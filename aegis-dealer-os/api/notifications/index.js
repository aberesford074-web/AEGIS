import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../lib/http.js';
import { organisationContext } from '../../lib/supabase.js';

export default async function handler(request, response) {
  if (!['GET', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'PATCH']);
  try {
    const context = await organisationContext(await requireOrganisationSession(request));
    if (request.method === 'PATCH') {
      const id = String(request.body?.id || '').trim();
      if (!id) return response.status(400).json({ error: 'Notification ID is required.' });
      const { data, error } = await context.supabase.from('notifications').update({ read_at: request.body?.read === false ? null : new Date().toISOString() })
        .eq('organisation_id', context.organisation.id).eq('id', id).select('*').maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: 'Notification not found.' });
      return response.status(200).json({ item: data });
    }
    const { data, error } = await context.supabase
      .from('notifications')
      .select('*')
      .eq('organisation_id', context.organisation.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return response.status(200).json({ items: data });
  } catch (error) {
    return handleApiError(response, error);
  }
}
