import assert from 'node:assert/strict';
import test from 'node:test';

import { portalReadiness } from '../lib/client-onboarding.js';
import { invoiceSubscriptionID } from '../api/stripe-webhook.js';
import { subscriptionAccessActive, subscriptionStatus, timestampToISOString } from '../lib/stripe-billing.js';

test('Stripe subscription statuses are normalised to the supported AEGIS values', () => {
  assert.equal(subscriptionStatus('ACTIVE'), 'active');
  assert.equal(subscriptionStatus(' trialing '), 'trialing');
  assert.equal(subscriptionStatus('unexpected'), 'incomplete');
});

test('only active and trialing subscriptions grant billing access', () => {
  assert.equal(subscriptionAccessActive('active'), true);
  assert.equal(subscriptionAccessActive('trialing'), true);
  assert.equal(subscriptionAccessActive('past_due'), false);
  assert.equal(subscriptionAccessActive('canceled'), false);
});

test('a billing-required portal cannot activate until its subscription is active', () => {
  const pending = portalReadiness({
    invitationStatus: 'accepted',
    websiteConnectionType: 'none',
    websiteConnectionStatus: 'not_required',
    billingRequired: true,
    billingStatus: 'checkout_pending'
  });
  const active = portalReadiness({
    invitationStatus: 'accepted',
    websiteConnectionType: 'none',
    websiteConnectionStatus: 'not_required',
    billingRequired: true,
    billingStatus: 'active'
  });
  assert.equal(pending.canActivate, false);
  assert.equal(active.canActivate, true);
});

test('Stripe timestamps convert safely to ISO dates', () => {
  assert.equal(timestampToISOString(0), null);
  assert.equal(timestampToISOString(1), '1970-01-01T00:00:01.000Z');
});

test('invoice events support Stripe legacy and nested subscription references', () => {
  assert.equal(invoiceSubscriptionID({ subscription: 'sub_legacy' }), 'sub_legacy');
  assert.equal(invoiceSubscriptionID({ parent: { subscription_details: { subscription: 'sub_current' } } }), 'sub_current');
  assert.equal(invoiceSubscriptionID({}), null);
});
