'use strict';

const { verifyRothBusinessIdentity } = require('./roth-merchant-core');

function normalizeHaloShippingDetails(input = {}) {
  const required = (value, label, max = 120) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > max || /[\r\n\u0000]/.test(normalized)) {
      throw new Error(`A valid ${label} is required for HALO delivery.`);
    }
    return normalized;
  };
  const firstName = required(input.firstName, 'first name');
  const lastName = required(input.lastName, 'last name');
  const addressLine1 = required(input.address, 'delivery address');
  const city = required(input.city, 'city');
  const postcode = required(input.postcode, 'UK postcode', 16).toUpperCase();
  if (input.country && input.country !== 'United Kingdom' && input.country !== 'GB') {
    throw new Error('HALO staging delivery is currently limited to the United Kingdom.');
  }
  return {
    name: `${firstName} ${lastName}`.slice(0, 120),
    line1: addressLine1,
    line2: String(input.addressLine2 || '').trim().slice(0, 120),
    city,
    region: String(input.region || '').trim().slice(0, 100),
    postcode,
    country: 'GB'
  };
}

function rothOrderFingerprint({ items, email, deliveryMethod, customerUid, shippingDetails }) {
  return JSON.stringify({
    paymentProvider: 'roth', items,
    email: String(email || '').trim().toLowerCase(),
    deliveryMethod, customerUid, shippingDetails
  });
}

async function processRothOrderPayment({ orderId, order, externalId, expectedBusinessId, roth, persistReservation, commit }) {
  if (!/^[a-f0-9]{32}$/.test(String(orderId || '')) || !order || order.brand !== 'HALO' ||
      order.paymentProvider !== 'roth' || order.status !== 'pending_payment' || order.paymentStatus !== 'pending' ||
      !Number.isSafeInteger(order.totalPence) || order.totalPence < 1 || !externalId ||
      typeof persistReservation !== 'function' || typeof commit !== 'function') {
    throw new Error('HALO ROTH order is not eligible for payment.');
  }

  const wallet = await roth.wallet(externalId);
  verifyRothBusinessIdentity(wallet?.businessId, expectedBusinessId, { requireActual: true });
  if (!Number.isSafeInteger(wallet.allocatedPence) || !Number.isSafeInteger(wallet.reservedPence) ||
      wallet.allocatedPence < 0 || wallet.reservedPence < 0 || wallet.reservedPence > wallet.allocatedPence) {
    throw new Error('ROTH returned an invalid HALO allocation.');
  }

  // ROTH is authoritative for available balance and order idempotency. Let it
  // return an existing reservation before checking availability client-side;
  // an order retry must not mistake its own active hold for insufficient funds.
  const held = await roth.reserve({ externalId, orderId, amountPence: order.totalPence });
  verifyRothBusinessIdentity(held?.businessId, expectedBusinessId, { requireActual: true });
  if (typeof held.reservationId !== 'string' || !held.reservationId || held.amountPence !== order.totalPence) {
    throw new Error('ROTH returned an invalid HALO redemption reservation.');
  }
  if (['cancelled', 'expired'].includes(held.status)) {
    const error = new Error('This ROTH checkout reservation expired. Start a new checkout attempt.');
    error.code = 'reservation_expired';
    error.reservationId = held.reservationId;
    throw error;
  }
  if (!['active', 'confirmed'].includes(held.status)) throw new Error('ROTH returned an invalid HALO redemption reservation.');
  await persistReservation({ reservationId: held.reservationId, status: held.status });

  const confirmed = await roth.confirm({ orderId, reservationId: held.reservationId });
  if (!confirmed || typeof confirmed.journalId !== 'string' || !confirmed.journalId ||
      (confirmed.reservationId !== undefined && confirmed.reservationId !== held.reservationId) ||
      (confirmed.amountPence !== undefined && confirmed.amountPence !== order.totalPence) ||
      (confirmed.status !== undefined && confirmed.status !== 'confirmed')) {
    throw new Error('ROTH did not confirm the HALO redemption for the full order total.');
  }
  const receipt = await roth.receipt(confirmed.journalId);
  if (receipt?.id !== confirmed.journalId || receipt.type !== 'redemption_confirmed' ||
      receipt.amountPence !== order.totalPence || receipt.status !== 'posted') {
    throw new Error('ROTH receipt does not match the confirmed HALO redemption.');
  }
  await commit({
    reservationId: held.reservationId,
    journalId: confirmed.journalId,
    amountPence: order.totalPence
  });
  return { status: 'paid', paymentStatus: 'paid', reservationId: held.reservationId, journalId: confirmed.journalId };
}

module.exports = { normalizeHaloShippingDetails, processRothOrderPayment, rothOrderFingerprint };
