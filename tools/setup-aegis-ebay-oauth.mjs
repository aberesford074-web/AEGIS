#!/usr/bin/env node
import { Buffer } from 'node:buffer';

const DEFAULT_SCOPE = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly'
].join(' ');

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || 'help';
const sandbox = Boolean(args.sandbox);
const authBase = sandbox ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
const apiBase = sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

if (command === 'help' || args.help) {
  printHelp();
} else if (command === 'auth-url') {
  const clientId = required('client-id');
  const ruName = required('ru-name');
  const scope = args.scope || DEFAULT_SCOPE;
  const url = new URL(`${authBase}/oauth2/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', ruName);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  console.log(url.toString());
} else if (command === 'exchange') {
  const clientId = required('client-id');
  const clientSecret = required('client-secret');
  const ruName = required('ru-name');
  const code = required('code');
  const token = await ebayTokenRequest(clientId, clientSecret, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: ruName
  });
  console.log(JSON.stringify({
    ok: true,
    environment: sandbox ? 'sandbox' : 'production',
    expiresIn: token.expires_in,
    refreshTokenExpiresIn: token.refresh_token_expires_in,
    scriptProperties: {
      EBAY_CLIENT_ID: clientId,
      EBAY_CLIENT_SECRET: '<store your client secret>',
      EBAY_REFRESH_TOKEN: token.refresh_token,
      EBAY_ENVIRONMENT: sandbox ? 'sandbox' : 'production',
      EBAY_MARKETPLACE_ID: 'EBAY_GB',
      EBAY_OAUTH_SCOPE: args.scope || DEFAULT_SCOPE
    }
  }, null, 2));
} else if (command === 'inspect') {
  const clientId = required('client-id');
  const clientSecret = required('client-secret');
  const refreshToken = required('refresh-token');
  const marketplaceId = args.marketplace || 'EBAY_GB';
  const scope = args.scope || DEFAULT_SCOPE;
  const token = await ebayTokenRequest(clientId, clientSecret, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope
  });
  const accessToken = token.access_token;
  const [payment, fulfillment, returns, locations] = await Promise.all([
    ebayGet('/sell/account/v1/payment_policy', accessToken, { marketplace_id: marketplaceId }).catch(errorResult),
    ebayGet('/sell/account/v1/fulfillment_policy', accessToken, { marketplace_id: marketplaceId }).catch(errorResult),
    ebayGet('/sell/account/v1/return_policy', accessToken, { marketplace_id: marketplaceId }).catch(errorResult),
    ebayGet('/sell/inventory/v1/location', accessToken).catch(errorResult)
  ]);
  console.log(JSON.stringify({
    ok: true,
    marketplaceId,
    paymentPolicies: payment.paymentPolicies || payment,
    fulfillmentPolicies: fulfillment.fulfillmentPolicies || fulfillment,
    returnPolicies: returns.returnPolicies || returns,
    locations: locations.locations || locations
  }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      out._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function required(name) {
  const value = args[name] || process.env[`EBAY_${name.toUpperCase().replace(/-/g, '_')}`];
  if (!value) {
    throw new Error(`Missing --${name}`);
  }
  return String(value).trim();
}

async function ebayTokenRequest(clientId, clientSecret, body) {
  const response = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`eBay OAuth failed: ${JSON.stringify(data)}`);
  }
  return data;
}

async function ebayGet(path, accessToken, query = {}) {
  const url = new URL(`${apiBase}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${path} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

function errorResult(error) {
  return { ok: false, error: error && error.message ? error.message : String(error) };
}

function printHelp() {
  console.log(`
AEGIS eBay OAuth setup

Never use or store an eBay account password for Sales OS. Use OAuth.

1. Create the seller consent URL:
   node tools/setup-aegis-ebay-oauth.mjs auth-url --client-id <CLIENT_ID> --ru-name <RUNAME>

2. Sign in to eBay with the seller account and approve access.
   Copy the "code" query parameter from the return URL.

3. Exchange the code for a refresh token:
   node tools/setup-aegis-ebay-oauth.mjs exchange --client-id <CLIENT_ID> --client-secret <CLIENT_SECRET> --ru-name <RUNAME> --code <CODE>

4. Inspect seller policy/location IDs:
   node tools/setup-aegis-ebay-oauth.mjs inspect --client-id <CLIENT_ID> --client-secret <CLIENT_SECRET> --refresh-token <REFRESH_TOKEN>

Then save these as Apps Script properties:
EBAY_CLIENT_ID
EBAY_CLIENT_SECRET
EBAY_REFRESH_TOKEN
EBAY_MERCHANT_LOCATION_KEY
EBAY_PAYMENT_POLICY_ID
EBAY_FULFILLMENT_POLICY_ID
EBAY_RETURN_POLICY_ID
EBAY_CATEGORY_ID
EBAY_MARKETPLACE_ID=EBAY_GB
`);
}
