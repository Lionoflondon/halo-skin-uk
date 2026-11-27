'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { haloFinancialEntry, pendingHaloFinancialEntry, reconcilePendingHaloFinancialEntry, validateHaloCharge } = require('../halo-financial-core');

const base = {
  id: 'txn_test_1', amount: 2500, fee: 70, net: 2430, currency: 'gbp',
  created: 1795500000, available_on: 1795586400, reporting_category: 'charge', status: 'pending'
};
const metadata = { stripeAccountId: 'acct_rothcrossTest01', orderId: 'a'.repeat(32), sourceType: 'charge', sourceId: 'ch_test_1', paymentIntentId: 'pi_test_1' };

test('stores reconciled HALO charge gross, fees, net and shared-account identity', () => {
  const entry = haloFinancialEntry({ balanceTransaction: base, ...metadata, expectedGrossPence: 2500 });
  assert.equal(entry.brand, 'HALO');
  assert.equal(entry.store, 'halo');
  assert.equal(entry.grossPence, 2500);
  assert.equal(entry.feePence, 70);
  assert.equal(entry.netPence, 2430);
  assert.equal(entry.stripeAccountId, metadata.stripeAccountId);
  assert.equal(entry.reconciliationStatus, 'reconciled');
});

test('preserves refund direction and rejects arithmetic or currency mismatches', () => {
  const refund = haloFinancialEntry({ balanceTransaction: { ...base, amount: -1000, fee: 0, net: -1000, reporting_category: 'refund' }, ...metadata, sourceType: 'refund', sourceId: 're_test_1', expectedGrossPence: -1000 });
  assert.equal(refund.grossPence, -1000);
  assert.equal(refund.netPence, -1000);
  assert.throws(() => haloFinancialEntry({ balanceTransaction: { ...base, net: 100 }, ...metadata }), /does not reconcile/);
  assert.throws(() => haloFinancialEntry({ balanceTransaction: { ...base, currency: 'usd' }, ...metadata }), /does not reconcile/);
  assert.throws(() => haloFinancialEntry({ balanceTransaction: base, ...metadata, expectedGrossPence: 2400 }), /does not reconcile/);
});

test('keeps unresolved balance transactions visible without inventing fees', () => {
  const entry = pendingHaloFinancialEntry({ ...metadata, grossPence: 2500 });
  assert.equal(entry.reconciliationStatus, 'pending_balance_transaction');
  assert.equal(entry.feePence, null);
  assert.equal(entry.netPence, null);
});

test('reconciles a pending charge only against its matching HALO PaymentIntent and amount', () => {
  const existingEntry = pendingHaloFinancialEntry({ ...metadata, grossPence: 2500 });
  const paymentIntent = { id: 'pi_test_1', metadata: { store: 'halo', brand: 'HALO Skin UK', orderId: 'a'.repeat(32) } };
  const charge = { id: 'ch_test_1', payment_intent: paymentIntent.id, paid: true, status: 'succeeded', amount_captured: 2500 };
  const resolved = reconcilePendingHaloFinancialEntry({ existingEntry, source: charge, paymentIntent, balanceTransaction: base, stripeAccountId: metadata.stripeAccountId });
  assert.equal(resolved.reconciliationStatus, 'reconciled');
  assert.equal(resolved.balanceTransactionId, base.id);
  assert.equal(resolved.netPence, 2430);
  assert.throws(() => reconcilePendingHaloFinancialEntry({ existingEntry, source: { ...charge, amount_captured: 2400 }, paymentIntent, balanceTransaction: base, stripeAccountId: metadata.stripeAccountId }), /does not match/);
  assert.throws(() => reconcilePendingHaloFinancialEntry({ existingEntry, source: charge, paymentIntent: { ...paymentIntent, metadata: { store: 'cc', orderId: 'a'.repeat(32) } }, balanceTransaction: base, stripeAccountId: metadata.stripeAccountId }), /does not match/);
  assert.throws(() => reconcilePendingHaloFinancialEntry({ existingEntry, source: charge, paymentIntent: { ...paymentIntent, metadata: { store: 'halo', brand: 'CORPVS CHRISTI', orderId: 'a'.repeat(32) } }, balanceTransaction: base, stripeAccountId: metadata.stripeAccountId }), /does not match/);
});

test('reconciles a pending refund only against its matching HALO PaymentIntent and negative amount', () => {
  const refundMetadata = { ...metadata, sourceType: 'refund', sourceId: 're_test_1' };
  const existingEntry = pendingHaloFinancialEntry({ ...refundMetadata, grossPence: -1000 });
  const paymentIntent = { id: 'pi_test_1', metadata: { store: 'halo', brand: 'HALO Skin UK', orderId: 'a'.repeat(32) } };
  const refund = { id: 're_test_1', payment_intent: paymentIntent.id, amount: 1000 };
  const transaction = { ...base, id: 'txn_refund_1', amount: -1000, fee: 0, net: -1000, reporting_category: 'refund' };
  const resolved = reconcilePendingHaloFinancialEntry({ existingEntry, source: refund, paymentIntent, balanceTransaction: transaction, stripeAccountId: metadata.stripeAccountId });
  assert.equal(resolved.grossPence, -1000);
  assert.equal(resolved.netPence, -1000);
  assert.throws(() => reconcilePendingHaloFinancialEntry({ existingEntry, source: { ...refund, amount: 900 }, paymentIntent, balanceTransaction: transaction, stripeAccountId: metadata.stripeAccountId }), /does not match/);
});

test('accepts a charge only when its currency, captured amount and PaymentIntent match the HALO order', () => {
  const order = { id: 'a'.repeat(32), brand: 'HALO', currency: 'GBP', totalPence: 2500, paymentIntentId: 'pi_test_1' };
  const charge = { payment_intent: 'pi_test_1', currency: 'gbp', paid: true, status: 'succeeded', amount: 2500, amount_captured: 2500 };
  assert.equal(validateHaloCharge({ charge, order, paymentIntentId: 'pi_test_1' }), true);
  assert.throws(() => validateHaloCharge({ charge: { ...charge, amount_captured: 2000 }, order, paymentIntentId: 'pi_test_1' }), /does not match/);
  assert.throws(() => validateHaloCharge({ charge: { ...charge, currency: 'usd' }, order, paymentIntentId: 'pi_test_1' }), /does not match/);
});
