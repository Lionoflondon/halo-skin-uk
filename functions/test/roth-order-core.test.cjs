'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHaloShippingDetails, processRothOrderPayment, rothOrderFingerprint } = require('../roth-order-core');

const order = {
  id: 'a'.repeat(32), brand: 'HALO', paymentProvider: 'roth',
  status: 'pending_payment', paymentStatus: 'pending', totalPence: 3299
};

function adapters(overrides = {}) {
  const calls = [];
  const roth = {
    async wallet(externalId) { calls.push(['wallet', externalId]); return { businessId: 'halo-merchant', allocatedPence: 5000, reservedPence: 0 }; },
    async reserve(input) { calls.push(['reserve', input]); return { businessId: 'halo-merchant', reservationId: 'rsv_1', amountPence: 3299, status: 'active' }; },
    async confirm(input) { calls.push(['confirm', input]); return { reservationId: 'rsv_1', journalId: 'journal_1', amountPence: 3299, status: 'confirmed' }; },
    async receipt(journalId) { calls.push(['receipt', journalId]); return { id: journalId, type: 'redemption_confirmed', amountPence: 3299, status: 'posted' }; },
    ...overrides
  };
  return { calls, roth };
}

test('normalizes a GB shipping address for non-Stripe checkout and rejects unsupported countries', () => {
  assert.deepEqual(normalizeHaloShippingDetails({
    firstName: 'Ada', lastName: 'Lovelace', address: '1 St James Square', city: 'London', postcode: 'sw1y 4lb', country: 'United Kingdom'
  }), {
    name: 'Ada Lovelace', line1: '1 St James Square', line2: '', city: 'London', region: '', postcode: 'SW1Y 4LB', country: 'GB'
  });
  assert.throws(() => normalizeHaloShippingDetails({ firstName: 'Ada', lastName: 'Lovelace', address: '1 Main St', city: 'London', postcode: 'SW1', country: 'US' }), /limited to the United Kingdom/);
  assert.throws(() => normalizeHaloShippingDetails({ firstName: 'Ada', lastName: 'Lovelace', address: '', city: 'London', postcode: 'SW1' }), /delivery address/);
});

test('ROTH checkout fingerprints include payment provider and shipping details', () => {
  const base = { items: [{ id: 'cream', quantity: 1 }], email: 'buyer@example.com', deliveryMethod: 'standard', customerUid: 'u1' };
  const shipping = { name: 'Ada Lovelace', line1: '1 Main St', city: 'London', postcode: 'SW1', country: 'GB' };
  assert.notEqual(rothOrderFingerprint({ ...base, shippingDetails: shipping }), rothOrderFingerprint({ ...base, shippingDetails: { ...shipping, postcode: 'EC1' } }));
  assert.notEqual(rothOrderFingerprint({ ...base, shippingDetails: shipping }), JSON.stringify({ items: base.items, email: base.email, deliveryMethod: base.deliveryMethod, customerUid: base.customerUid }));
});

test('reserves the complete server-priced order then confirms and commits it', async () => {
  const f = adapters();
  const persisted = [];
  const committed = [];
  const result = await processRothOrderPayment({
    orderId: order.id, order, externalId: 'firebase-user-1', expectedBusinessId: 'halo-merchant', roth: f.roth,
    persistReservation: async data => persisted.push(data), commit: async data => committed.push(data)
  });
  assert.deepEqual(result, { status: 'paid', paymentStatus: 'paid', reservationId: 'rsv_1', journalId: 'journal_1' });
  assert.deepEqual(f.calls, [
    ['wallet', 'firebase-user-1'],
    ['reserve', { externalId: 'firebase-user-1', orderId: order.id, amountPence: 3299 }],
    ['confirm', { orderId: order.id, reservationId: 'rsv_1' }],
    ['receipt', 'journal_1']
  ]);
  assert.deepEqual(persisted, [{ reservationId: 'rsv_1', status: 'active' }]);
  assert.deepEqual(committed, [{ reservationId: 'rsv_1', journalId: 'journal_1', amountPence: 3299 }]);
});

test('relies on ROTH atomic reservation to reject insufficient HALO allocation', async () => {
  const f = adapters({ async reserve() {
    f.calls.push(['reserve']);
    const error = new Error('insufficient balance');
    error.code = 'insufficient_balance';
    error.status = 409;
    throw error;
  } });
  let committed = false;
  await assert.rejects(processRothOrderPayment({
    orderId: order.id, order, externalId: 'firebase-user-1', expectedBusinessId: 'halo-merchant', roth: f.roth,
    persistReservation: async () => {}, commit: async () => { committed = true; }
  }), error => error.code === 'insufficient_balance' && error.status === 409);
  assert.deepEqual(f.calls.map(call => call[0]), ['wallet', 'reserve']);
  assert.equal(committed, false);
});

test('marks a cancelled or expired ROTH reservation as a terminal retry state', async () => {
  for (const status of ['cancelled', 'expired']) {
    const f = adapters({ async reserve(input) {
      f.calls.push(['reserve', input]);
      return { businessId: 'halo-merchant', reservationId: 'rsv_1', amountPence: 3299, status };
    } });
    await assert.rejects(processRothOrderPayment({
      orderId: order.id, order, externalId: 'user', expectedBusinessId: 'halo-merchant', roth: f.roth,
      persistReservation: async () => assert.fail('a terminal reservation must not be persisted as active'), commit: async () => assert.fail('a terminal reservation cannot commit')
    }), error => error.code === 'reservation_expired' && error.reservationId === 'rsv_1');
  }
});

test('rejects another Rothcross business and mismatched confirmation without committing the order', async () => {
  const otherBusiness = adapters({ async wallet() { return { businessId: 'corpvs-christi', allocatedPence: 5000, reservedPence: 0 }; } });
  await assert.rejects(processRothOrderPayment({ orderId: order.id, order, externalId: 'user', expectedBusinessId: 'halo-merchant', roth: otherBusiness.roth, persistReservation: async () => {}, commit: async () => {} }), /different Rothcross business/);

  const badConfirmation = adapters({ async confirm() { return { reservationId: 'rsv_1', journalId: 'journal_1', amountPence: 3298, status: 'confirmed' }; } });
  let committed = false;
  await assert.rejects(processRothOrderPayment({ orderId: order.id, order, externalId: 'user', expectedBusinessId: 'halo-merchant', roth: badConfirmation.roth, persistReservation: async () => {}, commit: async () => { committed = true; } }), /did not confirm/);
  assert.equal(committed, false);
});

test('requires the ROTH merchant receipt to match the confirmed order value', async () => {
  const f = adapters({ async receipt(journalId) { return { id: journalId, type: 'redemption_confirmed', amountPence: 3298, status: 'posted' }; } });
  let committed = false;
  await assert.rejects(processRothOrderPayment({
    orderId: order.id, order, externalId: 'user', expectedBusinessId: 'halo-merchant', roth: f.roth,
    persistReservation: async () => {}, commit: async () => { committed = true; }
  }), /receipt does not match/);
  assert.equal(committed, false);
});

test('retry uses the same order and reservation id after a transient confirmation failure', async () => {
  let confirmationAttempts = 0;
  const f = adapters({ async confirm(input) {
    f.calls.push(['confirm', input]);
    confirmationAttempts += 1;
    if (confirmationAttempts === 1) throw new Error('temporary ROTH outage');
    return { reservationId: 'rsv_1', journalId: 'journal_1', amountPence: 3299, status: 'confirmed' };
  } });
  const persisted = [];
  const args = { orderId: order.id, order, externalId: 'user', expectedBusinessId: 'halo-merchant', roth: f.roth, persistReservation: async value => persisted.push(value), commit: async () => {} };
  await assert.rejects(processRothOrderPayment(args), /temporary ROTH outage/);
  await processRothOrderPayment(args);
  assert.equal(f.calls.filter(call => call[0] === 'reserve').length, 2);
  assert.ok(f.calls.filter(call => call[0] === 'reserve').every(call => call[1].orderId === order.id));
  assert.equal(persisted.length, 2);
});
