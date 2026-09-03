const core = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY'
];

import { rateLimitMode } from '../lib/rate-limit.js';

function productionClerkReady() {
  return String(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').startsWith('pk_live_')
    && String(process.env.CLERK_SECRET_KEY || '').startsWith('sk_live_')
    && Boolean(process.env.CLERK_WEBHOOK_SIGNING_SECRET);
}

export default function handler(_request, response) {
  const missingCore = core.filter((name) => !process.env[name]);
  const capabilities = {
    database: missingCore.length === 0,
    authentication: Boolean(process.env.CLERK_SECRET_KEY),
    productionAuthentication: productionClerkReady(),
    integrations: Boolean(process.env.GOOGLE_GMAIL_CLIENT_ID && process.env.GOOGLE_GMAIL_CLIENT_SECRET && process.env.GMAIL_OAUTH_STATE_SECRET && process.env.GMAIL_TOKEN_ENCRYPTION_KEY),
    whatsapp: Boolean(process.env.META_WHATSAPP_APP_ID && process.env.META_WHATSAPP_APP_SECRET && process.env.META_WHATSAPP_CONFIG_ID),
    ai: Boolean(process.env.AEGIS_AGENT_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY),
    deeperAi: Boolean(process.env.OPENAI_API_KEY),
    billing: Boolean(process.env.STRIPE_SECRET_KEY),
    rateLimiting: rateLimitMode(),
    publishingQueue: true,
    persistentSpecifications: true
  };

  response.status(missingCore.length ? 503 : 200).json({
    status: missingCore.length ? 'configuration-required' : 'ready',
    capabilities,
    // Clerk publishable keys are deliberately safe to expose in a browser.
    // Keeping this on the existing health endpoint avoids adding another
    // serverless function on the Vercel Hobby plan.
    clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || null,
    environment: productionClerkReady() ? 'production' : 'setup-required',
    appName: 'DealerFoundry OS'
  });
}
