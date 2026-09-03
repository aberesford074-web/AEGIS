import { requireOrganisationSession } from '../lib/auth.js';
import { compactKnowledgeItem, knowledgeCatalog, knowledgeTerms } from '../lib/business-knowledge.js';
import { handleApiError, methodNotAllowed } from '../lib/http.js';
import { organisationContext } from '../lib/supabase.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    const limit = Math.min(Math.max(Number(request.query?.limit) || 24, 1), 50);
    const entity = String(request.query?.entity || '').trim().toLowerCase();
    const query = String(request.query?.q || '').trim();
    const terms = knowledgeTerms(query);

    let recordsQuery = context.supabase
      .from('business_knowledge')
      .select('entity_type,source_table,source_record_id,title,content,relationships,occurred_at,updated_at')
      .eq('organisation_id', orgId);
    if (entity) recordsQuery = recordsQuery.eq('entity_type', entity);
    if (terms.length) {
      recordsQuery = recordsQuery.or(terms.map((term) => `searchable_text.ilike.%${term.replace(/[%_,]/g, ' ')}%`).join(','));
    }
    const { data, error } = await recordsQuery.order('updated_at', { ascending: false }).limit(limit);
    if (error) throw error;

    const { data: catalogRows, error: catalogError } = await context.supabase
      .from('business_knowledge')
      .select('entity_type,occurred_at,updated_at')
      .eq('organisation_id', orgId)
      .limit(10000);
    if (catalogError) throw catalogError;

    return response.status(200).json({
      organisation: { id: orgId, name: context.organisation.name },
      query,
      terms,
      catalog: knowledgeCatalog(catalogRows || []),
      count: data?.length || 0,
      items: (data || []).map(compactKnowledgeItem)
    });
  } catch (error) {
    return handleApiError(response, error);
  }
}

