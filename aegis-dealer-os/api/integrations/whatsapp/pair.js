import crypto from 'node:crypto';
import { requireOrganisationSession } from '../../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../../lib/http.js';
import { organisationContext } from '../../../lib/supabase.js';

function pairingCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(6);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function codeHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const { data: connection, error } = await context.supabase
      .from('integration_connections')
      .select('id, configuration, status')
      .eq('organisation_id', context.organisation.id)
      .eq('provider_config_key', 'whatsapp')
      .maybeSingle();
    if (error) throw error;
    if (!connection || connection.status !== 'active') {
      const connectionError = new Error('Connect the dealership WhatsApp number before pairing your phone.');
      connectionError.statusCode = 409;
      throw connectionError;
    }
    const code = pairingCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await context.supabase.from('whatsapp_pairing_codes').delete()
      .eq('organisation_id', context.organisation.id)
      .eq('clerk_user_id', session.clerkUserId)
      .is('used_at', null);
    const { error: insertError } = await context.supabase.from('whatsapp_pairing_codes').insert({
      organisation_id: context.organisation.id,
      integration_connection_id: connection.id,
      clerk_user_id: session.clerkUserId,
      code_hash: codeHash(code),
      expires_at: expiresAt
    });
    if (insertError) throw insertError;
    const phone = String(connection.configuration?.display_phone_number || '').replace(/[^0-9]/g, '');
    const text = `AEGIS PAIR ${code}`;
    return response.status(201).json({
      code,
      expiresAt,
      instruction: `Send “${text}” to the dealership WhatsApp number from the phone you want to authorise.`,
      whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null
    });
  } catch (error) {
    return handleApiError(response, error);
  }
}

