import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseModules, portalTier, publicSlug } from '../lib/client-portals.js';
import {
  initialWebsiteStatus,
  normaliseEmail,
  normaliseWebsiteConnectionType,
  normaliseWebsiteURL,
  portalReadiness,
  verifyWebsiteConnection
} from '../lib/client-onboarding.js';

test('a new client portal defaults to website and stock only', () => {
  assert.deepEqual(normaliseModules(undefined), ['website', 'stock']);
  assert.equal(portalTier(['website', 'stock']), 'website_stock');
});

test('unknown modules are removed and full operations select the full tier', () => {
  const modules = normaliseModules(['website', 'stock', 'whatsapp', 'made-up']);
  assert.deepEqual(modules, ['website', 'stock', 'whatsapp']);
  assert.equal(portalTier(modules), 'full');
});

test('client names become safe portal slugs', () => {
  assert.equal(publicSlug('  Aaron & Sons Machinery Ltd. '), 'aaron-sons-machinery-ltd');
});

test('customer onboarding requires a valid portal email', () => {
  assert.equal(normaliseEmail(' Dealer@Example.com '), 'dealer@example.com');
  assert.throws(() => normaliseEmail('not-an-email'), /valid customer portal email/i);
});

test('website connection choices and URLs are validated', () => {
  assert.equal(normaliseWebsiteConnectionType('wordpress'), 'wordpress');
  assert.equal(normaliseWebsiteURL('https://dealer.example/stock', 'wordpress'), 'https://dealer.example');
  assert.equal(initialWebsiteStatus('none'), 'not_started');
  assert.equal(initialWebsiteStatus('custom'), 'awaiting_access');
  assert.throws(() => normaliseWebsiteURL('', 'wordpress'), /website URL is required/i);
});

test('a portal only activates after invitation acceptance and required website verification', () => {
  assert.equal(portalReadiness({ invitationStatus: 'pending', websiteConnectionType: 'none', websiteConnectionStatus: 'not_started' }).canActivate, false);
  assert.equal(portalReadiness({ invitationStatus: 'accepted', websiteConnectionType: 'none', websiteConnectionStatus: 'not_started' }).canActivate, true);
  assert.equal(portalReadiness({ invitationStatus: 'accepted', websiteConnectionType: 'stock_feed', websiteConnectionStatus: 'awaiting_access' }).canActivate, false);
  assert.equal(portalReadiness({ invitationStatus: 'accepted', websiteConnectionType: 'stock_feed', websiteConnectionStatus: 'connected' }).canActivate, true);
});

test('stock feed verification reports a genuine connected state only after a successful response', async () => {
  const connected = await verifyWebsiteConnection({
    type: 'stock_feed',
    publicSlug: 'dealer',
    fetcher: async () => ({ ok: true, status: 200 })
  });
  assert.equal(connected.status, 'connected');
  const failed = await verifyWebsiteConnection({
    type: 'stock_feed',
    publicSlug: 'dealer',
    fetcher: async () => ({ ok: false, status: 503 })
  });
  assert.equal(failed.status, 'failed');
});
