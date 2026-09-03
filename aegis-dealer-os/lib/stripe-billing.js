import Stripe from 'stripe';

import { portalBaseURL, portalReadiness } from './client-onboarding.js';

const permittedStatuses = new Set([
  'not_started',
  'checkout_pending',
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused'
]);

export function stripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    const error = new Error('Stripe billing has not been configured yet. Add the server-side Stripe test key first.');
    error.statusCode = 503;
    throw error;
  }
  if (String(process.env.STRIPE_BILLING_MODE || 'test').toLowerCase() === 'test' && !secretKey.startsWith('sk_test_')) {
    const error = new Error('AEGIS billing is in test mode and requires a Stripe test key.');
    error.statusCode = 503;
    throw error;
  }
  return new Stripe(secretKey);
}

export function defaultPriceID() {
  const priceID = String(process.env.STRIPE_DEFAULT_PRICE_ID || '').trim();
  if (!priceID) {
    const error = new Error('Set STRIPE_DEFAULT_PRICE_ID to the AEGIS subscription price before creating checkout.');
    error.statusCode = 503;
    throw error;
  }
  return priceID;
}

export function subscriptionStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return permittedStatuses.has(status) ? status : 'incomplete';
}

export function subscriptionAccessActive(status) {
  return ['active', 'trialing'].includes(subscriptionStatus(status));
}

export function timestampToISOString(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function commandCentreURL() {
  try {
    const url = new URL(process.env.COMMAND_CENTER_URL || '');
    return url.origin;
  } catch {
    return portalBaseURL();
  }
}

export async function createCheckoutSession({ supabase, organisation }) {
  const stripe = stripeClient();
  const priceID = defaultPriceID();
  const { data: existing, error: existingError } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('organisation_id', organisation.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (subscriptionAccessActive(existing?.status)) {
    const active = new Error('This dealer already has an active subscription. Use Manage billing instead.');
    active.statusCode = 409;
    throw active;
  }

  let customerID = existing?.stripe_customer_id || null;
  if (!customerID) {
    const customer = await stripe.customers.create({
      name: organisation.name,
      email: organisation.client_contact_email || undefined,
      metadata: { aegis_organisation_id: organisation.id }
    });
    customerID = customer.id;
  }

  const centreURL = commandCentreURL();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerID,
    line_items: [{ price: priceID, quantity: 1 }],
    allow_promotion_codes: true,
    metadata: { aegis_organisation_id: organisation.id },
    subscription_data: { metadata: { aegis_organisation_id: organisation.id } },
    success_url: `${centreURL}/dashboard/clients?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${centreURL}/dashboard/clients?billing=cancelled`
  });
  if (!session.url) throw new Error('Stripe did not return a Checkout URL.');

  const { error } = await supabase.from('billing_subscriptions').upsert({
    organisation_id: organisation.id,
    stripe_customer_id: customerID,
    stripe_checkout_session_id: session.id,
    stripe_price_id: priceID,
    status: 'checkout_pending',
    last_event_at: new Date().toISOString()
  }, { onConflict: 'organisation_id' });
  if (error) throw error;
  const required = await supabase.from('organisations').update({ billing_required: true }).eq('id', organisation.id);
  if (required.error) throw required.error;
  return { url: session.url, customerID, sessionID: session.id, priceID };
}

export async function createCustomerPortalSession({ supabase, organisationID }) {
  const stripe = stripeClient();
  const { data: billing, error } = await supabase
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('organisation_id', organisationID)
    .maybeSingle();
  if (error) throw error;
  if (!billing?.stripe_customer_id) {
    const missing = new Error('This dealer does not have a Stripe billing customer yet.');
    missing.statusCode = 409;
    throw missing;
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
    return_url: `${commandCentreURL()}/dashboard/clients`
  });
  return { url: portal.url };
}

export async function updatePortalBillingState({ supabase, organisationID, status }) {
  const { data: organisation, error } = await supabase
    .from('organisations')
    .select('portal_status,invitation_status,website_connection_type,website_connection_status')
    .eq('id', organisationID)
    .maybeSingle();
  if (error) throw error;
  if (!organisation) return;
  const active = subscriptionAccessActive(status);
  const readiness = portalReadiness({
    invitationStatus: organisation.invitation_status,
    websiteConnectionType: organisation.website_connection_type,
    websiteConnectionStatus: organisation.website_connection_status,
    billingRequired: true,
    billingStatus: status
  });
  if (readiness.canActivate && organisation.portal_status !== 'live') {
    const { error: activateError } = await supabase
      .from('organisations')
      .update({ portal_status: 'live', portal_activated_at: new Date().toISOString() })
      .eq('id', organisationID);
    if (activateError) throw activateError;
  }
  if (!active && ['canceled', 'unpaid', 'incomplete_expired'].includes(subscriptionStatus(status)) && organisation.portal_status === 'live') {
    const { error: pauseError } = await supabase.from('organisations').update({ portal_status: 'paused' }).eq('id', organisationID);
    if (pauseError) throw pauseError;
  }
}
