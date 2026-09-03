import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext, requireManager } from '../../lib/supabase.js';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const marketplaceCatalog = [
  { key: 'machinerytrader', name: 'MachineryTrader', status: 'pilot', connection: 'provider approval required' },
  { key: 'mascus', name: 'Mascus', status: 'pilot', connection: 'provider approval required' },
  { key: 'machineryline', name: 'Machineryline', status: 'planned', connection: 'commercial agreement required' }
];

export function publicConnection(item) {
  const { configuration, nango_connection_id: _credentialReference, ...record } = item;
  const isGmail = record.provider_config_key === 'gmail';
  const gmailCanSend = !isGmail || (configuration?.granted_scopes || []).includes(GMAIL_SEND_SCOPE);
  return {
    ...record,
    status: isGmail && record.status === 'active' && !gmailCanSend ? 'reauthorisation_required' : record.status,
    account_email: configuration?.account_email || null,
    display_phone_number: configuration?.display_phone_number || null,
    verified_name: configuration?.verified_name || null,
    gmail_can_send: isGmail ? gmailCanSend : null,
    configuration: configuration?.url ? { url: configuration.url } : {}
  };
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
  try {
    const context = await organisationContext(await requireOrganisationSession(request));
    if (request.method === 'GET') {
      if (request.query?.resource === 'catalog') return response.status(200).json({ items: marketplaceCatalog });
      const { data, error } = await context.supabase.from('integration_connections').select('id, provider_config_key, nango_connection_id, display_name, configuration, status, last_synced_at, created_at').eq('organisation_id', context.organisation.id).order('created_at', { ascending: false });
      if (error) throw error;
      const items = (data || [])
        .filter((item) => !String(item.nango_connection_id || '').startsWith('pending:'))
        .map(publicConnection);
      return response.status(200).json({ items });
    }
    requireManager(context.membership);
    const providerConfigKey = requireText(request.body?.providerConfigKey, 'Provider');
    const isWebsite = providerConfigKey === 'website';
    const marketplace = marketplaceCatalog.find((item) => item.key === providerConfigKey);
    if (!isWebsite && !marketplace) {
      const error = new Error('OAuth providers must be connected from their secure connection button.');
      error.statusCode = 400;
      throw error;
    }
    const nangoConnectionId = isWebsite ? `website:${context.organisation.id}` : `marketplace:${providerConfigKey}:${context.organisation.id}`;
    const payload = {
      organisation_id: context.organisation.id,
      provider_config_key: providerConfigKey,
      nango_connection_id: nangoConnectionId,
      display_name: request.body?.displayName || providerConfigKey,
      configuration: request.body?.configuration || {},
      status: isWebsite ? 'active' : 'awaiting_access'
    };
    const { data, error } = await context.supabase.from('integration_connections').upsert(payload, { onConflict: 'organisation_id,provider_config_key' }).select('id, provider_config_key, display_name, configuration, status, last_synced_at').single();
    if (error) throw error;
    if (isWebsite && request.body?.configuration?.url) {
      await context.supabase.from('organisations').update({ website_url: request.body.configuration.url }).eq('id', context.organisation.id);
    }
    return response.status(201).json({ item: data, message: marketplace ? `${marketplace.name} has been added as a controlled pilot. It will not publish until provider access is approved.` : null });
  } catch (error) {
    return handleApiError(response, error);
  }
}
