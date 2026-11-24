'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STANDARD_DELIVERY_PENCE, assertStripeAccountId, checkoutFingerprint, parseCart, requireTestStripeKey } = require('../halo-payment-core');

const products = [
  { id: 'lip-01', variantId: 'v-01', title: 'Lip treatment', price: 18, published: true, available: true, stockQuantity: 10 },
  { id: 'lip-02', variantId: 'v-02', title: 'Lip tint', price: 18.5, published: true, available: true, stockQuantity: 10 }
];

test('accepts only Stripe test/restricted test keys', () => {
  assert.equal(requireTestStripeKey('sk_test_example'), 'sk_test_example');
  assert.equal(requireTestStripeKey('rk_test_example'), 'rk_test_example');
  assert.throws(() => requireTestStripeKey('sk_live_example'), /test keys only/);
  assert.throws(() => requireTestStripeKey(''), /test keys only/);
});

test('pins Stripe API key to the expected Rothcross account', () => {
  assert.doesNotThrow(() => assertStripeAccountId('acct_rothcrossTest01', 'acct_rothcrossTest01'));
  assert.throws(() => assertStripeAccountId('acct_rothcrossTest01', 'acct_otherAccount01'), /expected Rothcross account/);
  assert.throws(() => assertStripeAccountId('', 'acct_rothcrossTest01'), /expected Rothcross account/);
});

test('prices cart from published server catalogue and keeps amounts in pence', () => {
  const lines = parseCart([{ id: 'lip-01', variantId: 'v-01', quantity: 2 }], products);
  assert.equal(lines[0].pricePence, 1800);
  assert.equal(lines[0].quantity, 2);
  assert.equal(STANDARD_DELIVERY_PENCE, 299);
});

test('rejects client price manipulation, unpublished products and invalid quantities', () => {
  assert.throws(() => parseCart([{ id: 'lip-01', variantId: 'wrong', quantity: 1, price: 0.01 }], products), /unavailable/);
  assert.throws(() => parseCart([{ id: 'draft', variantId: 'draft-v', quantity: 1 }], [...products, { id: 'draft', variantId: 'draft-v', price: 2, published: false }]), /unavailable/);
  assert.throws(() => parseCart([{ id: 'lip-01', variantId: 'v-01', quantity: 11 }], products), /unavailable/);
});

test('checkout request fingerprint is stable for equivalent emails', () => {
  const first = checkoutFingerprint({ items: [{ id: 'lip-01', quantity: 1 }], email: ' BUYER@example.com ', deliveryMethod: 'standard' });
  const second = checkoutFingerprint({ items: [{ id: 'lip-01', quantity: 1 }], email: 'buyer@example.com', deliveryMethod: 'standard' });
  assert.equal(first, second);
  assert.notEqual(
    checkoutFingerprint({ items: [{ id: 'lip-01', quantity: 1 }], email: 'buyer@example.com', deliveryMethod: 'standard', customerUid: 'customer-a' }),
    checkoutFingerprint({ items: [{ id: 'lip-01', quantity: 1 }], email: 'buyer@example.com', deliveryMethod: 'standard', customerUid: 'customer-b' })
  );
});
