'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { haloFinancialEntry, pendingHaloFinancialEntry, validateHaloCharge } = require('../halo-financial-core');

const base = {
  id: 'txn_test_1', amount: 2500, fee: 70, net: 2430, currency: 'gbp',
  created: 1795500000, available_on: 1795586400, reporting_category: 'charge', status: 'pending'
};
const metadata = { stripeAccountId: 'acct_rothcrossTest01', orderId: 'a'.repeat(32), sourceType: 'charge', sourceId: 'ch_test_1', paymentIntentId: 'pi_test_1' };

test('stores reconciled HALO charge gross, fees, net and shared-account identity', () => {
  const entry = haloFinancialEntry({ balanceTransaction: base, ...metadata });
  assert.equal(entry.brand, 'HALO');
  assert.equal(entry.store, 'halo');
  assert.equal(entry.grossPence, 2500);
  assert.equal(entry.feePence, 70);
  assert.equal(entry.netPence, 2430);
  assert.equal(entry.stripeAccountId, metadata.stripeAccountId);
  assert.equal(entry.reconciliationStatus, 'reconciled');
});

test('preserves refund direction and rejects arithmetic or currency mismatches', () => {
  const refund = haloFinancialEntry({ balanceTransaction: { ...base, amount: -1000, fee: 0, net: -1000, reporting_category: 'refund' }, ...metadata, sourceType: 'refund', sourceId: 're_test_1' });
  assert.equal(refund.grossPence, -1000);
  assert.equal(refund.netPence, -1000);
  assert.throws(() => haloFinancialEntry({ balanceTransaction: { ...base, net: 100 }, ...metadata }), /does not reconcile/);
  assert.throws(() => haloFinancialEntry({ balanceTransaction: { ...base, currency: 'usd' }, ...metadata }), /does not reconcile/);
});

test('keeps unresolved balance transactions visible without inventing fees', () => {
  const entry = pendingHaloFinancialEntry({ ...metadata, grossPence: 2500 });
  assert.equal(entry.reconciliationStatus, 'pending_balance_transaction');
  assert.equal(entry.feePence, null);
  assert.equal(entry.netPence, null);
});

test('accepts a charge only when its currency, captured amount and PaymentIntent match the HALO order', () => {
  const order = { id: 'a'.repeat(32), brand: 'HALO', currency: 'GBP', totalPence: 2500, paymentIntentId: 'pi_test_1' };
  const charge = { payment_intent: 'pi_test_1', currency: 'gbp', paid: true, status: 'succeeded', amount: 2500, amount_captured: 2500 };
  assert.equal(validateHaloCharge({ charge, order, paymentIntentId: 'pi_test_1' }), true);
  assert.throws(() => validateHaloCharge({ charge: { ...charge, amount_captured: 2000 }, order, paymentIntentId: 'pi_test_1' }), /does not match/);
  assert.throws(() => validateHaloCharge({ charge: { ...charge, currency: 'usd' }, order, paymentIntentId: 'pi_test_1' }), /does not match/);
});
