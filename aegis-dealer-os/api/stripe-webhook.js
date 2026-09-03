import { supabaseAdmin } from '../lib/supabase.js';
import {
  stripeClient,
  subscriptionStatus,
  timestampToISOString,
  updatePortalBillingState
} from '../lib/stripe-billing.js';
import { provisionPaidSignup } from '../lib/public-signup.js';

export const config = { api: { bodyParser: false } };

async function rawRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function organisationIDFor(object) {
  return String(object?.metadata?.aegis_organisation_id || '').trim() || null;
}

export function invoiceSubscriptionID(invoice) {
  return String(
    invoice?.subscription ||
    invoice?.parent?.subscription_details?.subscription ||
    ''
  ).trim() || null;
}

async function billingForStripeReference(supabase, reference, column) {
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('organisation_id')
    .eq(column, reference)
    .maybeSingle();
  if (error) throw error;
  return data?.organisation_id || null;
}

async function recordAudit(supabase, organisationID, eventType, payload = {}) {
  if (!organisationID) return;
  const { error } = await supabase.from('audit_events').insert({
    organisation_id: organisationID,
    event_type: eventType,
    record_type: 'billing_subscription',
    payload
  });
  if (error) console.error('Stripe audit event failed.', error);
}

async function upsertSubscription(supabase, organisationID, subscription, extras = {}) {
  const status = subscriptionStatus(subscription.status);
  const { error } = await supabase.from('billing_subscriptions').upsert({
    organisation_id: organisationID,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items?.data?.[0]?.price?.id || null,
    status,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    current_period_end: timestampToISOString(subscription.current_period_end),
    last_event_at: new Date().toISOString(),
    ...extras
  }, { onConflict: 'organisation_id' });
  if (error) throw error;
  await updatePortalBillingState({ supabase, organisationID, status });
  await recordAudit(supabase, organisationID, `stripe.subscription.${status}`, { stripe_subscription_id: subscription.id });
}

async function processEvent(supabase, event) {
  const object = event.data?.object;
  if (!object) return null;
  if (event.type === 'checkout.session.completed') {
    const provisioned = await provisionPaidSignup({ supabase, checkoutSession: object });
    if (provisioned?.organisation) {
      const subscriptionID = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
      if (subscriptionID) {
        const subscription = await stripeClient().subscriptions.retrieve(subscriptionID);
        await upsertSubscription(supabase, provisioned.organisation.id, subscription, {
          stripe_checkout_session_id: object.id
        });
      }
      await recordAudit(supabase, provisioned.organisation.id, 'public_signup.provisioned', {
        stripe_checkout_session_id: object.id,
        signup_intent_id: provisioned.intent.id
      });
      return provisioned.organisation.id;
    }
    const organisationID = organisationIDFor(object);
    if (!organisationID) return null;
    const { error } = await supabase.from('billing_subscriptions').upsert({
      organisation_id: organisationID,
      stripe_customer_id: typeof object.customer === 'string' ? object.customer : null,
      stripe_subscription_id: typeof object.subscription === 'string' ? object.subscription : null,
      stripe_checkout_session_id: object.id,
      status: 'checkout_pending',
      last_event_at: new Date().toISOString()
    }, { onConflict: 'organisation_id' });
    if (error) throw error;
    await recordAudit(supabase, organisationID, 'stripe.checkout.completed', { stripe_checkout_session_id: object.id });
    return organisationID;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const organisationID = organisationIDFor(object) || await billingForStripeReference(supabase, object.id, 'stripe_subscription_id');
    if (!organisationID) return null;
    await upsertSubscription(supabase, organisationID, object);
    return organisationID;
  }
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const subscriptionID = invoiceSubscriptionID(object);
    const organisationID = subscriptionID
      ? await billingForStripeReference(supabase, subscriptionID, 'stripe_subscription_id')
      : organisationIDFor(object?.parent?.subscription_details);
    if (!organisationID) return null;
    const field = event.type === 'invoice.paid' ? 'last_payment_at' : 'last_payment_failed_at';
    const { error } = await supabase.from('billing_subscriptions').update({ [field]: new Date().toISOString(), last_event_at: new Date().toISOString() }).eq('organisation_id', organisationID);
    if (error) throw error;
    await recordAudit(supabase, organisationID, `stripe.${event.type}`, { stripe_invoice_id: object.id });
    return organisationID;
  }
  return null;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method not allowed.');
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) return response.status(503).json({ error: 'Stripe webhook is not configured.' });
    const rawBody = await rawRequestBody(request);
    const signature = request.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) return response.status(400).send('Stripe signature is required.');
    const event = stripeClient().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    const supabase = supabaseAdmin();
    const { data: existing, error: lookupError } = await supabase
      .from('stripe_webhook_events')
      .select('stripe_event_id')
      .eq('stripe_event_id', event.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return response.status(200).json({ received: true, duplicate: true });
    const organisationID = await processEvent(supabase, event);
    const { error: eventError } = await supabase.from('stripe_webhook_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      organisation_id: organisationID,
      processed_at: new Date().toISOString(),
      payload: { livemode: event.livemode, object_id: event.data?.object?.id || null }
    });
    if (eventError?.code === '23505') return response.status(200).json({ received: true, duplicate: true });
    if (eventError) throw eventError;
    return response.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed.', error);
    return response.status(400).send('Stripe webhook could not be verified.');
  }
}
