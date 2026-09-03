import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext } from '../../lib/supabase.js';

function cleanRecordType(value) {
  const type = requireText(value, 'Record type').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  if (!type || type.length > 80) {
    const error = new Error('Record type must be a short descriptive name.');
    error.statusCode = 400;
    throw error;
  }
  return type;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;

    if (request.method === 'GET') {
      const type = String(request.query?.type || '').trim().toLowerCase();
      let query = context.supabase
        .from('business_records')
        .select('*')
        .eq('organisation_id', orgId);
      if (type) query = query.eq('record_type', type);
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(100);
      if (error) throw error;
      return response.status(200).json({ items: data || [] });
    }

    const payload = {
      organisation_id: orgId,
      record_type: cleanRecordType(request.body?.recordType),
      title: requireText(request.body?.title, 'Title'),
      summary: request.body?.summary || null,
      status: request.body?.status || null,
      source: request.body?.source || 'aegis-agent',
      data: objectValue(request.body?.data),
      relationships: objectValue(request.body?.relationships),
      created_by_clerk_user_id: session.clerkUserId
    };
    const { data, error } = await context.supabase
      .from('business_records')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    await context.supabase.from('audit_events').insert({
      organisation_id: orgId,
      actor_clerk_user_id: session.clerkUserId,
      event_type: 'business_record.created',
      record_type: payload.record_type,
      record_id: data.id,
      payload: { title: payload.title, source: payload.source }
    });
    return response.status(201).json({ item: data });
  } catch (error) {
    return handleApiError(response, error);
  }
}
