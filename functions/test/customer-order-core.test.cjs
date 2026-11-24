'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { customerOrderSummary } = require('../customer-order-core');

test('customer order history returns only safe fields for a HALO order', () => {
  const createdAt = new Date('2026-11-24T12:00:00Z');
  const order = {
    brand: 'HALO', status: 'dispatched', paymentStatus: 'partially_refunded',
    totalPence: 3899, refundedPence: 1000, deliveryMethod: 'standard',
    trackingUrl: 'https://tracking.example/halo-1', customerEmail: 'private@example.com',
    shippingDetails: { name: 'Private Customer', line1: '1 Private Street' },
    paymentIntentId: 'pi_secret', customerUid: 'auth-uid',
    createdAt: { toDate: () => createdAt },
    items: [{ title: 'Lip Peptide Treatment', quantity: 2, pricePence: 1800 }]
  };
  const summary = customerOrderSummary('order-1', order);
  assert.deepEqual(summary, {
    id: 'order-1', status: 'dispatched', paymentStatus: 'partially_refunded',
    totalPence: 3899, refundedPence: 1000, deliveryMethod: 'standard', deliveryStatus: null,
    trackingUrl: 'https://tracking.example/halo-1', createdAt: '2026-11-24T12:00:00.000Z',
    items: [{ title: 'Lip Peptide Treatment', quantity: 2 }]
  });
  assert.equal('customerEmail' in summary, false);
  assert.equal('shippingDetails' in summary, false);
  assert.equal('paymentIntentId' in summary, false);
});

test('customer history refuses orders from another Rothcross brand', () => {
  assert.equal(customerOrderSummary('order-cc', { brand: 'CORPVS CHRISTI', totalPence: 1 }), null);
});
