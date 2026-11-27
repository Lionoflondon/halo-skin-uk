'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { haloRefundOrderId, nextOrderStatus, stripeEventOrderUpdate, stripeRefundOrderUpdate, stripeRefundIdempotencyKey, validatePendingCheckoutCancellation } = require('../halo-order-core');

const order = { id: 'order_halo_01', status: 'pending_payment', paymentStatus: 'pending', stripeSessionId: 'cs_test_halo_01', totalPence: 3899 };
function event(type, object) { return { id: 'evt_test_01', type, livemode: false, data: { object } }; }
const sessionMeta = { store: 'halo', orderId: order.id };
function session(extra = {}) { return { id: order.stripeSessionId, currency: 'gbp', amount_total: order.totalPence, payment_status: 'paid', payment_intent: 'pi_test_halo_01', metadata: sessionMeta, ...extra }; }

test('accepts a matching successful test checkout and separates payment from fulfilment', () => {
  const patch = stripeEventOrderUpdate(order, event('checkout.session.completed', {
    ...session()
  }));
  assert.equal(patch.status, 'paid');
  assert.equal(patch.paymentStatus, 'paid');
  assert.equal(patch.paymentIntentId, 'pi_test_halo_01');
});

test('declined and abandoned sessions update payment status without marking an order paid', () => {
  const failed = stripeEventOrderUpdate(order, event('payment_intent.payment_failed', {
    id: 'pi_test_halo_01', metadata: sessionMeta
  }));
  assert.equal(failed.status, undefined);
  assert.equal(failed.paymentStatus, 'failed');
  const abandoned = stripeEventOrderUpdate(order, event('checkout.session.expired', {
    id: order.stripeSessionId, metadata: sessionMeta
  }));
  assert.equal(abandoned.paymentStatus, 'abandoned');
  const expiredAfterDecline = stripeEventOrderUpdate({ ...order, paymentStatus: 'failed' }, event('checkout.session.expired', {
    id: order.stripeSessionId, metadata: sessionMeta
  }));
  assert.equal(expiredAfterDecline.paymentStatus, 'abandoned');
});

test('failed payment events must identify HALO and match any linked PaymentIntent', () => {
  const failedPayment = { id: 'pi_test_halo_01', metadata: sessionMeta };
  assert.equal(stripeEventOrderUpdate(order, event('payment_intent.payment_failed', failedPayment)).paymentStatus, 'failed');
  for (const invalid of [
    { ...failedPayment, metadata: { store: 'cc', orderId: order.id } },
    { ...failedPayment, metadata: { orderId: order.id } },
    { ...failedPayment, metadata: { store: 'halo', orderId: 'other_halo_order' } },
    { ...failedPayment, id: 'pi_test_other_brand' }
  ]) {
    assert.throws(() => stripeEventOrderUpdate({ ...order, paymentIntentId: 'pi_test_halo_01' }, event('payment_intent.payment_failed', invalid)), /HALO order/);
  }
});

test('rejects live, wrong-store and amount-mismatched events', () => {
  const paidSession = session();
  assert.throws(() => stripeEventOrderUpdate(order, { ...event('checkout.session.completed', paidSession), livemode: true }), /test-mode/);
  assert.throws(() => stripeEventOrderUpdate(order, event('checkout.session.completed', { ...paidSession, metadata: { store: 'cc', orderId: order.id } })), /does not identify/);
  assert.throws(() => stripeEventOrderUpdate(order, event('checkout.session.completed', { ...paidSession, amount_total: 1 })), /does not match/);
});

test('ignores a separate successful payment for an already-paid order', () => {
  const patch = stripeEventOrderUpdate({ ...order, status: 'paid', paymentStatus: 'paid' }, event('checkout.session.completed', session()));
  assert.equal(patch.eventStatus, 'duplicate_payment_ignored');
  assert.equal(patch.status, undefined);
});

test('records cumulative partial and full refunds without overwriting fulfilment status', () => {
  const paid = { ...order, status: 'processing', paymentStatus: 'paid', paymentIntentId: 'pi_test_halo_01' };
  const partial = stripeRefundOrderUpdate(paid, { payment_intent: paid.paymentIntentId, currency: 'gbp', amount: paid.totalPence, amount_refunded: 1000 });
  assert.equal(partial.paymentStatus, 'partially_refunded');
  assert.equal(partial.refundedPence, 1000);
  const full = stripeRefundOrderUpdate({ ...paid, refundedPence: 1000 }, { payment_intent: paid.paymentIntentId, currency: 'gbp', amount: paid.totalPence, amount_refunded: paid.totalPence });
  assert.equal(full.paymentStatus, 'refunded');
});

test('enforces pending-to-delivered order lifecycle and disallows skipping steps', () => {
  assert.equal(nextOrderStatus('pending_payment', 'paid'), 'paid');
  assert.equal(nextOrderStatus('paid', 'processing'), 'processing');
  assert.equal(nextOrderStatus('processing', 'dispatched'), 'dispatched');
  assert.equal(nextOrderStatus('dispatched', 'delivered'), 'delivered');
  assert.throws(() => nextOrderStatus('paid', 'delivered'), /cannot move/);
});

test('allows pending HALO cancellation only after matching test Checkout Session expires unpaid', () => {
  const pending = { ...order, id: order.id, brand: 'HALO', stripeMode: 'test' };
  const expired = { id: order.stripeSessionId, livemode: false, status: 'expired', payment_status: 'unpaid', metadata: sessionMeta };
  assert.equal(validatePendingCheckoutCancellation(pending, expired, order.id), true);
  for (const invalid of [
    { ...expired, status: 'open' },
    { ...expired, payment_status: 'paid' },
    { ...expired, livemode: true },
    { ...expired, metadata: { store: 'cc', orderId: order.id } },
    { ...expired, id: 'cs_test_other' }
  ]) {
    assert.throws(() => validatePendingCheckoutCancellation(pending, invalid, order.id), /expired, unpaid/);
  }
});

test('captures UK shipping details from current and legacy Checkout Session shapes', () => {
  const details = {
    name: 'Test Customer',
    address: { line1: '1 Test Street', city: 'London', postal_code: 'SW1A 1AA', country: 'GB' }
  };
  for (const fields of [{ collected_information: { shipping_details: details } }, { shipping_details: details }]) {
    const patch = stripeEventOrderUpdate(order, event('checkout.session.completed', session(fields)));
    assert.deepEqual(patch.shippingDetails, {
      name: 'Test Customer', line1: '1 Test Street', line2: '', city: 'London',
      region: '', postcode: 'SW1A 1AA', country: 'GB'
    });
  }
  assert.equal(stripeEventOrderUpdate(order, event('checkout.session.completed', session())).shippingDetails, null);
});

test('an older refund event cannot decrease the recorded cumulative refund', () => {
  const refunded = { ...order, paymentIntentId: 'pi_test_halo_01', refundedPence: order.totalPence };
  const charge = { payment_intent: refunded.paymentIntentId, currency: 'gbp', amount: order.totalPence, amount_refunded: 1000 };
  assert.deepEqual(stripeRefundOrderUpdate(refunded, charge), { eventStatus: 'older_refund_total_ignored' });
});

test('resolves refunds from PaymentIntent metadata on the shared Rothcross Stripe account', () => {
  const orderId = 'a'.repeat(32);
  const paymentIntent = { id: 'pi_test_halo_01', metadata: { store: 'halo', orderId } };
  assert.equal(haloRefundOrderId(paymentIntent.id, paymentIntent), orderId);
  assert.equal(haloRefundOrderId(paymentIntent.id, { ...paymentIntent, metadata: { store: 'cc', orderId } }), null);
  assert.equal(haloRefundOrderId(paymentIntent.id, { ...paymentIntent, metadata: { store: 'halo', orderId: 'invalid' } }), null);
  assert.equal(haloRefundOrderId('pi_test_other', paymentIntent), null);
});

test('refund idempotency keys are stable and scoped to the HALO order', () => {
  const requestKey = 'e6f2bb51-d112-4f57-b8cc-5ff12c773b20';
  const first = stripeRefundIdempotencyKey('0123456789abcdef0123456789abcdef', requestKey);
  assert.equal(first, stripeRefundIdempotencyKey('0123456789abcdef0123456789abcdef', requestKey));
  assert.notEqual(first, stripeRefundIdempotencyKey('abcdef0123456789abcdef0123456789', requestKey));
  assert.match(first, /^halo_refund_0123456789abcdef0123456789abcdef_[a-f0-9]{64}$/);
  assert.throws(() => stripeRefundIdempotencyKey('invalid', requestKey), /invalid/);
});
