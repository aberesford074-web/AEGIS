import { createClerkClient } from '@clerk/backend';

import { initialWebsiteStatus, normaliseEmail, portalBaseURL } from './client-onboarding.js';
import { normaliseModules, portalTier, publicSlug } from './client-portals.js';
import { defaultPriceID, stripeClient } from './stripe-billing.js';

const planDefinitions = {
  website_stock: {
    name: 'Website + Stock Dashboard',
    priceVariable: 'STRIPE_WEBSITE_STOCK_DEPOSIT_PRICE_ID',
    modules: ['website', 'stock']
  }
};

function websiteBaseURL() {
  try {
    return new URL(process.env.MARKETING_SITE_URL || 'https://aegis-dealer-os-site.vercel.app').origin;
  } catch {
    return 'https://aegis-dealer-os-site.vercel.app';
  }
}

function signupEnabled() {
  return String(process.env.AEGIS_PUBLIC_SIGNUP_ENABLED || '').toLowerCase() === 'true';
}

function signupPriceID(plan) {
  const explicit = String(process.env[plan.priceVariable] || '').trim();
  if (explicit) return explicit;
  if (String(process.env.AEGIS_ALLOW_TEST_PUBLIC_SIGNUP || '').toLowerCase() === 'true') return defaultPriceID();
  const error = new Error(`Online checkout is not available for ${plan.name} yet.`);
  error.statusCode = 503;
  throw error;
}

function cleanBusinessName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) {
    const error = new Error('Enter a business name between 2 and 120 characters.');
    error.statusCode = 400;
    throw error;
  }
  return name;
}

function cleanStockSize(value) {
  return String(value || '').trim().slice(0, 60) || null;
}

async function uniqueSlug(supabase, value) {
  const base = publicSlug(value);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix ? `${base}-${suffix + 1}` : base;
    const { data, error } = await supabase.from('organisations').select('id').eq('public_slug', candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error('AEGIS could not allocate a private workspace address.');
}

export function allowedPublicSignupOrigin(origin) {
  const configured = String(process.env.MARKETING_SITE_URL || '').trim();
  const allowed = new Set(['https://aegis-dealer-os-site.vercel.app']);
  if (configured) {
    try { allowed.add(new URL(configured).origin); } catch {}
  }
  return origin && allowed.has(origin) ? origin : null;
}

export function publicSignupCors(response, origin) {
  const allowed = allowedPublicSignupOrigin(origin);
  if (allowed) response.setHeader('Access-Control-Allow-Origin', allowed);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
}

export async function createPublicSignupCheckout({ supabase, body }) {
  if (!signupEnabled()) {
    const error = new Error('Online checkout is not open yet. Please request a setup plan and AEGIS will be in touch.');
    error.statusCode = 503;
    throw error;
  }
  const planKey = String(body?.planKey || '').trim();
  const plan = planDefinitions[planKey];
  if (!plan) {
    const error = new Error('Choose a valid AEGIS plan.');
    error.statusCode = 400;
    throw error;
  }
  const businessName = cleanBusinessName(body?.businessName);
  const ownerEmail = normaliseEmail(body?.ownerEmail);
  const stockSize = cleanStockSize(body?.stockSize);
  const depositPriceID = signupPriceID(plan);
  const id = crypto.randomUUID();
  const { error: intentError } = await supabase.from('public_signup_intents').insert({
    id,
    plan_key: planKey,
    business_name: businessName,
    owner_email: ownerEmail,
    stock_size: stockSize
  });
  if (intentError) throw intentError;

  try {
    const stripe = stripeClient();
    const customer = await stripe.customers.create({
      name: businessName,
      email: ownerEmail,
      metadata: { aegis_signup_intent_id: id, aegis_plan_key: planKey }
    });
    const successURL = `${websiteBaseURL()}/welcome.html?signup=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customer.id,
      line_items: [{ price: depositPriceID, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: id,
      metadata: { aegis_signup_intent_id: id, aegis_plan_key: planKey },
      success_url: successURL,
      cancel_url: `${websiteBaseURL()}/#plans`
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    const { error: updateError } = await supabase.from('public_signup_intents').update({
      stripe_customer_id: customer.id,
      stripe_checkout_session_id: session.id
    }).eq('id', id);
    if (updateError) throw updateError;
    return { checkoutUrl: session.url, signupId: id };
  } catch (error) {
    await supabase.from('public_signup_intents').update({ status: 'failed', failure_reason: error.message }).eq('id', id);
    throw error;
  }
}

export async function publicSignupStatus({ supabase, signupId }) {
  const { data, error } = await supabase.from('public_signup_intents')
    .select('id,status,business_name,owner_email,provisioned_at,failure_reason')
    .eq('id', signupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const missing = new Error('This AEGIS setup link is no longer available.');
    missing.statusCode = 404;
    throw missing;
  }
  return data;
}

export async function provisionPaidSignup({ supabase, checkoutSession }) {
  const signupID = String(checkoutSession?.metadata?.aegis_signup_intent_id || checkoutSession?.client_reference_id || '').trim();
  if (!signupID) return null;
  const { data: intent, error: intentError } = await supabase.from('public_signup_intents').select('*').eq('id', signupID).maybeSingle();
  if (intentError) throw intentError;
  if (!intent) return null;

  const plan = planDefinitions[intent.plan_key];
  if (!plan) throw new Error('The selected AEGIS plan is unavailable.');
  let organisation = null;
  if (intent.organisation_id) {
    const existing = await supabase.from('organisations').select('*').eq('id', intent.organisation_id).maybeSingle();
    if (existing.error) throw existing.error;
    organisation = existing.data;
  }

  if (!organisation) {
    await supabase.from('public_signup_intents').update({ status: 'provisioning', failure_reason: null }).eq('id', intent.id);
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkOrganisation = await clerk.organizations.createOrganization({ name: intent.business_name });
    try {
      const slug = await uniqueSlug(supabase, intent.business_name);
      const modules = normaliseModules(plan.modules);
      const insert = await supabase.from('organisations').insert({
        clerk_organisation_id: clerkOrganisation.id,
        name: intent.business_name,
        public_slug: slug,
        portal_status: 'setup',
        portal_tier: portalTier(modules),
        enabled_modules: modules,
        client_contact_email: intent.owner_email,
        invitation_status: 'not_sent',
        website_connection_type: 'aegis_built',
        website_connection_status: initialWebsiteStatus('aegis_built'),
        // A deposit secures the project. Subscription billing only starts after
        // the final launch invoice is paid and the dealer's website goes live.
        billing_required: false
      }).select('*').single();
      if (insert.error) throw insert.error;
      organisation = insert.data;
      const { error: linkError } = await supabase.from('public_signup_intents').update({
        organisation_id: organisation.id,
        stripe_customer_id: typeof checkoutSession.customer === 'string' ? checkoutSession.customer : intent.stripe_customer_id,
        stripe_checkout_session_id: checkoutSession.id,
        stripe_subscription_id: typeof checkoutSession.subscription === 'string' ? checkoutSession.subscription : null
      }).eq('id', intent.id);
      if (linkError) throw linkError;
      const { error: connectionError } = await supabase.from('integration_connections').upsert({
        organisation_id: organisation.id,
        provider_config_key: 'website',
        nango_connection_id: `website:${organisation.id}`,
        display_name: 'AEGIS dealer website',
        configuration: { type: 'aegis_built', stock_feed_url: `${portalBaseURL()}/api/machines?publicOrg=${encodeURIComponent(slug)}` },
        status: 'awaiting_access'
      }, { onConflict: 'organisation_id,provider_config_key' });
      if (connectionError) throw connectionError;
    } catch (error) {
      await clerk.organizations.deleteOrganization(clerkOrganisation.id).catch(() => undefined);
      throw error;
    }
  }

  if (organisation.invitation_status !== 'accepted' && organisation.invitation_status !== 'pending') {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: organisation.clerk_organisation_id,
      emailAddress: intent.owner_email,
      role: 'org:member',
      redirectUrl: `${portalBaseURL()}/?organisation=${encodeURIComponent(organisation.public_slug)}`
    });
    const updated = await supabase.from('organisations').update({
      invitation_id: invitation.id,
      invitation_status: invitation.status === 'accepted' ? 'accepted' : 'pending',
      invitation_sent_at: new Date(invitation.createdAt || Date.now()).toISOString(),
      invitation_last_error: null
    }).eq('id', organisation.id).select('*').single();
    if (updated.error) throw updated.error;
    organisation = updated.data;
  }
  const { error: completedError } = await supabase.from('public_signup_intents').update({
    status: 'provisioned',
    failure_reason: null,
    provisioned_at: new Date().toISOString(),
    stripe_customer_id: typeof checkoutSession.customer === 'string' ? checkoutSession.customer : intent.stripe_customer_id,
    stripe_subscription_id: typeof checkoutSession.subscription === 'string' ? checkoutSession.subscription : intent.stripe_subscription_id
  }).eq('id', intent.id);
  if (completedError) throw completedError;
  return { organisation, intent };
}
