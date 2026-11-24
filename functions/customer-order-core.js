'use strict';

function customerOrderSummary(id, order) {
  if (!order || order.brand !== 'HALO') return null;
  return {
    id,
    status: order.status || 'pending_payment',
    paymentStatus: order.paymentStatus || 'pending',
    totalPence: Number(order.totalPence) || 0,
    refundedPence: Number(order.refundedPence) || 0,
    deliveryMethod: order.deliveryMethod || 'standard',
    deliveryStatus: order.deliveryStatus || null,
    trackingUrl: order.trackingUrl || null,
    createdAt: order.createdAt?.toDate?.().toISOString() || null,
    items: (Array.isArray(order.items) ? order.items : []).map(item => ({
      title: String(item.title || 'HALO product'),
      quantity: Number(item.quantity) || 0
    }))
  };
}

module.exports = { customerOrderSummary };
