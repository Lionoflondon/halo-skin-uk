export const DELIVERY_METHODS = Object.freeze({
  CIRCUM: 'circum',
  STANDARD: 'standard'
});

export const CIRCUM_STATUSES = Object.freeze([
  'Preparing',
  'Awaiting Rider',
  'Rider Assigned',
  'Out for Delivery',
  'Delivered'
]);

/**
 * Runs only from the verified payment-success webhook/backend handler.
 * Adapters are injected so Halo can use the approved Circum integration and
 * existing Shopify order/fulfilment implementation without cross-project code.
 */
export async function fulfilPaidHaloOrder({ payment, order, adapters }) {
  if (!payment?.id || payment.status !== 'succeeded') {
    throw new Error('Payment must be verified as succeeded before fulfilment');
  }
  if (!order?.id) throw new Error('Halo order is required');
  if (![DELIVERY_METHODS.CIRCUM, DELIVERY_METHODS.STANDARD].includes(order.deliveryMethod)) {
    throw new Error('Unsupported delivery method');
  }

  const haloOrder = await adapters.orders.markPaid(order.id, payment.id);

  if (order.deliveryMethod === DELIVERY_METHODS.STANDARD) {
    await adapters.orders.updateDelivery(order.id, {
      deliveryMethod: DELIVERY_METHODS.STANDARD,
      shippingPrice: 2.99,
      deliveryStatus: null,
      circumDeliveryId: null,
      trackingUrl: null
    });
    await adapters.shopify.continueStandardFulfilment(haloOrder);
    return { orderId: order.id, deliveryMethod: DELIVERY_METHODS.STANDARD };
  }

  const eligibility = await adapters.circum.checkServiceArea(order.shippingAddress);
  if (!eligibility?.eligible) throw new Error('Address is outside the Circum service area');

  const delivery = await adapters.circum.createDelivery({
    externalOrderId: order.id,
    recipient: order.customer,
    address: order.shippingAddress,
    notifications: true,
    proofOfDelivery: true
  });
  if (!delivery?.id) throw new Error('Circum did not return a delivery ID');

  await adapters.orders.updateDelivery(order.id, {
    deliveryMethod: DELIVERY_METHODS.CIRCUM,
    shippingPrice: 4.99,
    deliveryStatus: 'Preparing',
    circumDeliveryId: delivery.id,
    trackingUrl: delivery.trackingUrl || null
  });
  await adapters.notifications.sendDeliveryUpdate(order.customer, {
    status: 'Preparing',
    trackingUrl: delivery.trackingUrl || null
  });
  return { orderId: order.id, deliveryMethod: DELIVERY_METHODS.CIRCUM, circumDeliveryId: delivery.id, trackingUrl: delivery.trackingUrl || null };
}

export async function applyCircumStatusUpdate({ orderId, status, trackingUrl, adapters }) {
  if (!CIRCUM_STATUSES.includes(status)) throw new Error('Unsupported Circum delivery status');
  await adapters.orders.updateDelivery(orderId, { deliveryStatus: status, ...(trackingUrl ? { trackingUrl } : {}) });
  const order = await adapters.orders.get(orderId);
  await adapters.notifications.sendDeliveryUpdate(order.customer, { status, trackingUrl: trackingUrl || order.trackingUrl || null });
}
