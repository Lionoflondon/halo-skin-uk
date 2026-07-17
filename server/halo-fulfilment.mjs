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
 * Adapters are injected so Halo can use its approved Circum integration and
 * standalone order/fulfilment implementation without cross-project code.
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
    await adapters.standardFulfilment.dispatch(haloOrder);
    return { orderId: order.id, deliveryMethod: DELIVERY_METHODS.STANDARD };
  }

  const eligibility = await adapters.circum.checkServiceArea(order.shippingAddress);
  if (!eligibility?.eligible) throw new Error('Address is outside the Circum service area');

  const warehouse = await adapters.warehouse.getActive();
  if (!warehouse?.address) throw new Error('Active Halo warehouse pickup address is required');

  const delivery = await adapters.circum.createDelivery({
    externalOrderId: order.id,
    deliveryMethod: DELIVERY_METHODS.CIRCUM,
    pickup: {
      contact: warehouse.contact,
      address: warehouse.address,
      instructions: warehouse.instructions || null
    },
    dropoff: {
      recipient: order.customer,
      address: order.shippingAddress,
      instructions: order.deliveryInstructions || null
    },
    broadcastToRiders: false,
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

  // Persist the Circum ID before broadcasting so an unsuccessful broadcast
  // never leaves an untraceable delivery request.
  await adapters.circum.broadcastDelivery(delivery.id);
  await adapters.orders.updateDelivery(order.id, {
    deliveryStatus: 'Awaiting Rider'
  });
  await adapters.notifications.sendDeliveryUpdate(order.customer, {
    status: 'Awaiting Rider',
    trackingUrl: delivery.trackingUrl || null
  });
  return { orderId: order.id, deliveryMethod: DELIVERY_METHODS.CIRCUM, deliveryStatus: 'Awaiting Rider', circumDeliveryId: delivery.id, trackingUrl: delivery.trackingUrl || null };
}

export async function applyCircumStatusUpdate({ orderId, status, trackingUrl, adapters }) {
  if (!CIRCUM_STATUSES.includes(status)) throw new Error('Unsupported Circum delivery status');
  await adapters.orders.updateDelivery(orderId, { deliveryStatus: status, ...(trackingUrl ? { trackingUrl } : {}) });
  const order = await adapters.orders.get(orderId);
  await adapters.notifications.sendDeliveryUpdate(order.customer, { status, trackingUrl: trackingUrl || order.trackingUrl || null });
}
