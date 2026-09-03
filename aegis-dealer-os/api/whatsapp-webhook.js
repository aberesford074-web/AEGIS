import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  normaliseWhatsAppWebhook,
  sendWhatsAppText,
  unsealWhatsAppToken,
  verifyWhatsAppWebhookSignature,
  whatsappVerifyTokenMatches
} from '../lib/meta-whatsapp.js';
import { processWhatsAppMessage } from '../lib/whatsapp-agent.js';

export const config = { api: { bodyParser: false } };

async function rawRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function connectionForPhone(supabase, phoneNumberId) {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('id, organisation_id, configuration, status')
    .eq('provider_config_key', 'whatsapp')
    .eq('configuration->>phone_number_id', phoneNumberId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function storeMessage(supabase, connection, event) {
  const now = event.timestamp || new Date().toISOString();
  const { data: conversation, error: conversationError } = await supabase
    .from('whatsapp_conversations')
    .upsert({
      organisation_id: connection.organisation_id,
      integration_connection_id: connection.id,
      whatsapp_user_id: event.from,
      phone_number: event.from,
      display_name: event.displayName,
      last_message_at: now
    }, { onConflict: 'integration_connection_id,whatsapp_user_id' })
    .select('id, participant_type, unread_count')
    .single();
  if (conversationError) throw conversationError;

  const isPaired = conversation.participant_type !== 'unpaired';
  const { data: storedMessage, error: messageError } = await supabase.from('whatsapp_messages').upsert({
    organisation_id: connection.organisation_id,
    integration_connection_id: connection.id,
    conversation_id: conversation.id,
    provider_message_id: event.providerMessageId,
    direction: 'inbound',
    sender: event.from,
    recipient: event.displayPhoneNumber,
    message_type: event.messageType,
    body: event.body,
    status: isPaired ? 'queued' : 'blocked',
    raw_payload: event.raw
  }, { onConflict: 'integration_connection_id,provider_message_id', ignoreDuplicates: true }).select('id').maybeSingle();
  if (messageError) throw messageError;
  await supabase.from('whatsapp_conversations').update({
    unread_count: Number(conversation.unread_count || 0) + 1,
    last_message_at: now
  }).eq('id', conversation.id);
  return { messageId: storedMessage?.id || null, conversation, conversationId: conversation.id };
}

function pairingHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function attemptPairing(supabase, connection, event) {
  const match = String(event.body || '').trim().toUpperCase().match(/^AEGIS\s+PAIR\s+([23456789A-HJ-NP-Z]{6})$/);
  if (!match) return null;
  const { data: pairing, error } = await supabase.from('whatsapp_pairing_codes')
    .select('id,clerk_user_id,expires_at')
    .eq('organisation_id', connection.organisation_id)
    .eq('integration_connection_id', connection.id)
    .eq('code_hash', pairingHash(match[1]))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!pairing) return { paired: false };
  const { data: conversation, error: conversationError } = await supabase.from('whatsapp_conversations').upsert({
    organisation_id: connection.organisation_id,
    integration_connection_id: connection.id,
    whatsapp_user_id: event.from,
    phone_number: event.from,
    display_name: event.displayName,
    participant_type: 'staff',
    linked_clerk_user_id: pairing.clerk_user_id,
    status: 'open',
    last_message_at: event.timestamp
  }, { onConflict: 'integration_connection_id,whatsapp_user_id' }).select('id').single();
  if (conversationError) throw conversationError;
  await supabase.from('whatsapp_pairing_codes').update({ used_at: new Date().toISOString() }).eq('id', pairing.id);
  await supabase.from('whatsapp_messages').upsert({
    organisation_id: connection.organisation_id,
    integration_connection_id: connection.id,
    conversation_id: conversation.id,
    provider_message_id: event.providerMessageId,
    direction: 'inbound',
    sender: event.from,
    recipient: event.displayPhoneNumber,
    message_type: 'text',
    body: event.body,
    status: 'completed',
    raw_payload: event.raw
  }, { onConflict: 'integration_connection_id,provider_message_id', ignoreDuplicates: true });
  return { paired: true };
}

async function sendPairingConfirmation(connection, recipient) {
  const token = unsealWhatsAppToken(connection.configuration?.credential);
  return sendWhatsAppText(token, connection.configuration?.phone_number_id, recipient,
    'Your phone is now paired with AEGIS. You can ask about stock, contacts, companies, deals and follow-ups. Actions that send or change data still require approval.');
}

async function storeStatus(supabase, connection, event) {
  const fields = { status: event.status, updated_at: new Date().toISOString() };
  if (event.status === 'sent') fields.sent_at = event.timestamp;
  if (event.status === 'delivered') fields.delivered_at = event.timestamp;
  if (event.status === 'read') fields.read_at = event.timestamp;
  await supabase.from('whatsapp_messages')
    .update(fields)
    .eq('integration_connection_id', connection.id)
    .eq('provider_message_id', event.providerMessageId);
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      if (request.query['hub.mode'] === 'subscribe' && whatsappVerifyTokenMatches(request.query['hub.verify_token'])) {
        return response.status(200).send(request.query['hub.challenge']);
      }
      return response.status(403).send('Verification failed.');
    } catch {
      return response.status(503).send('WhatsApp webhook is not configured.');
    }
  }
  if (request.method !== 'POST') return response.status(405).send('Method not allowed.');

  try {
    const rawBody = await rawRequestBody(request);
    if (!verifyWhatsAppWebhookSignature(rawBody, request.headers['x-hub-signature-256'])) {
      return response.status(401).send('Invalid signature.');
    }
    const payload = JSON.parse(rawBody.toString('utf8'));
    const supabase = supabaseAdmin();
    for (const event of normaliseWhatsAppWebhook(payload)) {
      if (!event.phoneNumberId) continue;
      const connection = await connectionForPhone(supabase, event.phoneNumberId);
      if (!connection || connection.status !== 'active') continue;
      if (event.kind === 'message') {
        const pairing = await attemptPairing(supabase, connection, event);
        if (pairing?.paired) {
          waitUntil(sendPairingConfirmation(connection, event.from).catch((error) => console.error('WhatsApp pairing confirmation failed.', error)));
        } else if (!pairing) {
          const stored = await storeMessage(supabase, connection, event);
          if (stored.messageId && stored.conversation.participant_type !== 'unpaired') {
            waitUntil(processWhatsAppMessage(stored.messageId).catch((error) => console.error('WhatsApp agent processing failed.', error)));
          }
        }
      }
      if (event.kind === 'status') await storeStatus(supabase, connection, event);
      await supabase.from('integration_connections').update({
        configuration: { ...connection.configuration, last_webhook_at: new Date().toISOString(), last_error: null },
        last_synced_at: new Date().toISOString()
      }).eq('id', connection.id);
    }
    return response.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('WhatsApp webhook processing failed.', error);
    // Return 200 after a verified webhook so Meta does not create a retry storm;
    // operational failures remain visible in server logs and connection health.
    return response.status(200).send('EVENT_ACCEPTED');
  }
}
