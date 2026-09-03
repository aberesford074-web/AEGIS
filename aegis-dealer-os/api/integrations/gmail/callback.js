import { supabaseAdmin } from '../../../lib/supabase.js';
import {
  exchangeGmailCode,
  gmailCallbackURL,
  gmailProfile,
  platformGmailCallbackURL,
  sealGmailCredentials,
  verifyGmailState
} from '../../../lib/google-gmail.js';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).send('Method not allowed.');
  let platformConnection = false;
  try {
    const state = verifyGmailState(request.query.state);
    platformConnection = state.scope === 'platform';
    if (request.query.error) throw new Error(request.query.error_description || 'Google authorisation was cancelled.');
    if (!request.query.code) throw new Error('Google did not return an authorisation code.');

    const tokens = await exchangeGmailCode(request.query.code);
    const grantedScopes = String(tokens.scope || '').split(' ').filter(Boolean);
    if (!grantedScopes.includes(GMAIL_SEND_SCOPE)) {
      throw new Error('Google did not grant permission to send email. Try Reconnect Gmail and allow the requested Gmail sending permission.');
    }
    const profile = await gmailProfile(tokens.access_token);
    const supabase = supabaseAdmin();
    if (platformConnection) {
      const { data: administrator, error: administratorError } = await supabase
        .from('platform_admins')
        .select('role')
        .eq('clerk_user_id', state.clerkUserId)
        .maybeSingle();
      if (administratorError) throw administratorError;
      if (!administrator || !['owner', 'admin'].includes(administrator.role)) {
        const error = new Error('You no longer have permission to connect the Command Centre Gmail account.');
        error.statusCode = 403;
        throw error;
      }
      const configuration = {
        account_email: profile.email,
        credential: sealGmailCredentials(tokens),
        credential_version: 1,
        granted_scopes: grantedScopes
      };
      const { error } = await supabase.from('platform_integration_connections').upsert({
        provider_config_key: 'gmail',
        nango_connection_id: `google:${profile.sub}`,
        display_name: `DealerFoundry Gmail · ${profile.email}`,
        configuration,
        status: 'active',
        last_synced_at: new Date().toISOString()
      }, { onConflict: 'provider_config_key' });
      if (error) throw error;
      return response.redirect(302, platformGmailCallbackURL({ status: 'connected', email: profile.email }));
    }
    const { data: membership, error: membershipError } = await supabase
      .from('organisation_memberships')
      .select('role')
      .eq('organisation_id', state.organisationId)
      .eq('clerk_user_id', state.clerkUserId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      const error = new Error('You no longer have permission to connect Gmail for this dealer.');
      error.statusCode = 403;
      throw error;
    }

    const configuration = {
      account_email: profile.email,
      credential: sealGmailCredentials(tokens),
      credential_version: 1,
      granted_scopes: grantedScopes
    };
    const { error } = await supabase.from('integration_connections').upsert({
      organisation_id: state.organisationId,
      provider_config_key: 'gmail',
      nango_connection_id: `google:${profile.sub}`,
      display_name: `Gmail · ${profile.email}`,
      configuration,
      status: 'active',
      last_synced_at: new Date().toISOString()
    }, { onConflict: 'organisation_id,provider_config_key' });
    if (error) throw error;

    await supabase.from('audit_events').insert({
      organisation_id: state.organisationId,
      actor_clerk_user_id: state.clerkUserId,
      event_type: 'integration.gmail.connected',
      record_type: 'integration_connections',
      payload: { account_email: profile.email }
    });
    return response.redirect(302, gmailCallbackURL({ status: 'connected', email: profile.email }));
  } catch (error) {
    const message = error?.message || 'Gmail could not be connected.';
    if (platformConnection) return response.redirect(302, platformGmailCallbackURL({ status: 'error', message }));
    return response.redirect(302, gmailCallbackURL({ status: 'error', message }));
  }
}
