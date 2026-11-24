'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { haloFinancialEntry, pendingHaloFinancialEntry } = require('../halo-financial-core');

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
