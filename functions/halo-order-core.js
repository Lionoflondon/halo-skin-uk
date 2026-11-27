'use strict';

const { createHash } = require('node:crypto');

function stripeRefundIdempotencyKey(orderId, requestKey) {
  if (!/^[a-f0-9]{32}$/.test(String(orderId || '')) || typeof requestKey !== 'string' || requestKey.length < 16 || requestKey.length > 128) {
    throw new Error('HALO refund order and idempotency key are invalid.');
  }
  const digest = createHash('sha256').update(requestKey).digest('hex');
  return `halo_refund_${orderId}_${digest}`;
}

function validatePendingCheckoutCancellation(order, session, orderId) {
  if (!order || order.brand !== 'HALO' || order.id !== orderId ||
      typeof order.stripeSessionId !== 'string' || !order.stripeSessionId ||
      !session || session.id !== order.stripeSessionId || session.livemode !== false ||
      session.status !== 'expired' || session.payment_status === 'paid' ||
      session.metadata?.store !== 'halo' || session.metadata?.orderId !== orderId) {
    throw new Error('Stripe has not confirmed an expired, unpaid Checkout Session for this HALO order.');
  }
  return true;
}

function stripeShippingDetails(session) {
  const details = session.collected_information?.shipping_details ?? session.shipping_details;
  const address = details?.address;
  if (!details?.name || !address?.line1 || !address?.city || !address?.postal_code || address.country !== 'GB') return null;
  return {
    name: details.name,
    line1: address.line1,
    line2: address.line2 || '',
    city: address.city,
    region: address.state || '',
    postcode: address.postal_code,
    country: address.country
  };
}

function stripeEventOrderUpdate(order, event) {
  if (!order || !event || event.livemode !== false) throw new Error('Only a test-mode Stripe event can update a HALO staging order.');
  const object = event.data?.object;
  const metadata = object?.metadata || {};
  if (metadata.store !== 'halo' || metadata.orderId !== order.id) throw new Error('Stripe event does not identify this HALO order.');

  if (event.type === 'checkout.session.completed') {
    if (object.id !== order.stripeSessionId || object.currency !== 'gbp' || object.amount_total !== order.totalPence) throw new Error('Stripe payment does not match the HALO order.');
    if (object.payment_status !== 'paid') return { paymentStatus: 'pending', eventStatus: 'not_paid' };
    if (order.status !== 'pending_payment') return { paymentStatus: order.paymentStatus || 'paid', eventStatus: 'duplicate_payment_ignored' };
    return {
      status: 'paid', paymentStatus: 'paid',
      shippingDetails: stripeShippingDetails(object),
      paymentIntentId: typeof object.payment_intent === 'string' ? object.payment_intent : null,
      eventStatus: 'processed'
    };
  }

  if (event.type === 'checkout.session.expired') {
    if (object.id !== order.stripeSessionId) throw new Error('Expired Stripe session does not match the HALO order.');
    if (order.status !== 'pending_payment') return { paymentStatus: order.paymentStatus || 'paid', eventStatus: 'late_expiry_ignored' };
    return { paymentStatus: 'abandoned', eventStatus: 'processed' };
  }

  if (event.type === 'payment_intent.payment_failed') {
    if (object.id !== order.paymentIntentId && object.metadata?.orderId !== order.id) throw new Error('Failed payment does not match the HALO order.');
    if (order.status !== 'pending_payment') return { paymentStatus: order.paymentStatus || 'paid', eventStatus: 'late_failure_ignored' };
    return { paymentStatus: 'failed', eventStatus: 'processed' };
  }

  throw new Error('Stripe event is not a supported HALO order event.');
}

function nextOrderStatus(current, next) {
  const transitions = {
    pending_payment: new Set(['paid', 'cancelled']),
    paid: new Set(['processing', 'cancelled']),
    processing: new Set(['dispatched', 'cancelled']),
    dispatched: new Set(['delivered']),
    delivered: new Set(),
    cancelled: new Set()
  };
  if (!transitions[current]?.has(next)) throw new Error(`Order cannot move from ${current} to ${next}.`);
  return next;
}

function stripeRefundOrderUpdate(order, charge) {
  if (!order || !charge || typeof order.paymentIntentId !== 'string' || charge.payment_intent !== order.paymentIntentId ||
      charge.currency !== 'gbp' || charge.amount !== order.totalPence || !Number.isSafeInteger(charge.amount_refunded) ||
      charge.amount_refunded < 0 || charge.amount_refunded > order.totalPence) {
    throw new Error('Stripe refund does not match the HALO order.');
  }
  const prior = Number(order.refundedPence || 0);
  if (!Number.isSafeInteger(prior) || prior < 0 || prior > order.totalPence) throw new Error('Cumulative Stripe refund amount is inconsistent.');
  if (charge.amount_refunded < prior) return { eventStatus: 'older_refund_total_ignored' };
  if (charge.amount_refunded === prior) return { paymentStatus: order.paymentStatus || 'paid', refundedPence: prior, eventStatus: 'duplicate_refund_total' };
  return {
    paymentStatus: charge.amount_refunded === order.totalPence ? 'refunded' : 'partially_refunded',
    refundedPence: charge.amount_refunded,
    eventStatus: 'processed'
  };
}

function haloRefundOrderId(paymentIntentId, paymentIntent) {
  if (!paymentIntentId || paymentIntent?.id !== paymentIntentId) return null;
  const metadata = paymentIntent.metadata || {};
  if (metadata.store !== 'halo' || !/^[a-f0-9]{32}$/.test(String(metadata.orderId || ''))) return null;
  return metadata.orderId;
}

module.exports = { haloRefundOrderId, nextOrderStatus, stripeEventOrderUpdate, stripeRefundOrderUpdate, stripeRefundIdempotencyKey, validatePendingCheckoutCancellation };
