'use strict';

const { createHash } = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { getAppCheck } = require('firebase-admin/app-check');
const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { onRequest } = require('firebase-functions/v2/https');
const Stripe = require('stripe');
const { STANDARD_DELIVERY_PENCE, assertStripeAccountId, checkoutFingerprint, parseCart, requireTestStripeKey } = require('./halo-payment-core');
const { haloRefundOrderId, nextOrderStatus, stripeEventOrderUpdate, stripeRefundOrderUpdate } = require('./halo-order-core');
const { customerOrderSummary } = require('./customer-order-core');
const { AppCheckAccessError, requireVerifiedAppCheck } = require('./request-security-core');
const { inventoryCountAdjustment, releaseInventory, reserveInventory } = require('./inventory-core');
const { haloFinancialEntry, pendingHaloFinancialEntry, validateHaloCharge } = require('./halo-financial-core');

initializeApp();
const db = getFirestore();
const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const expectedStripeAccountId = defineString('ROTHCROSS_STRIPE_ACCOUNT_ID');
const siteUrl = defineString('HALO_SITE_URL', { default: 'https://haloskinuk.com' });
const allowedOrigins = defineString('HALO_CHECKOUT_ALLOWED_ORIGINS', { default: 'https://haloskinuk.com,https://www.haloskinuk.com' });
const region = 'europe-west2';
const HALO_ADMIN_EMAIL = 'ayojason600@gmail.com';

class AdminAccessError extends Error {}

async function requireAppCheck(request) {
  await requireVerifiedAppCheck(request, token => getAppCheck().verifyToken(token));
}

async function requireHaloAdmin(request) {
  await requireAppCheck(request);
  const match = /^Bearer (.+)$/.exec(request.get('authorization') || '');
  if (!match) throw new AdminAccessError('Sign in to Halo Admin.');
  const token = await getAuth().verifyIdToken(match[1], true);
  if (token.email !== HALO_ADMIN_EMAIL || token.email_verified !== true || !token.firebase?.sign_in_second_factor || Date.now() / 1000 - Number(token.auth_time || 0) > 300) {
    throw new AdminAccessError('A recently authenticated Halo administrator session with MFA is required.');
  }
  return token;
}

function stripeClient() {
  if (process.env.GCLOUD_PROJECT !== 'halo-skin-uk-stg') {
    throw new Error('HALO test payments require the isolated staging project.');
  }
  return new Stripe(requireTestStripeKey(stripeSecret.value()));
}
async function assertRothcrossStripeAccount(stripe) {
  const expected = expectedStripeAccountId.value();
  const account = await stripe.accounts.retrieve();
  assertStripeAccountId(expected, account.id);
}
function inventoryMovementRef(orderId, productId) {
  return db.collection('haloInventoryMovements').doc(hash(`${orderId}:${productId}`).slice(0, 32));
}
function balanceTransactionFrom(source) {
  return typeof source?.balance_transaction === 'object' ? source.balance_transaction : null;
}
async function resolveBalanceTransaction(stripe, source) {
  const embedded = balanceTransactionFrom(source);
  if (embedded) return embedded;
  const id = typeof source?.balance_transaction === 'string' ? source.balance_transaction : '';
  if (!id) return null;
  return stripe.balanceTransactions.retrieve(id);
}
async function commitReservedInventory(transaction, orderRef, order) {
  if (order.inventoryStatus !== 'reserved') return {};
  const productRefs = order.items.map(item => db.collection('products').doc(item.id));
  const movementRefs = order.items.map(item => inventoryMovementRef(orderRef.id, item.id));
  const snapshots = await Promise.all([...productRefs, ...movementRefs].map(ref => transaction.get(ref)));
  const productSnapshots = snapshots.slice(0, productRefs.length);
  const movementSnapshots = snapshots.slice(productRefs.length);
  if (productSnapshots.some((snapshot, index) => !snapshot.exists ||
      !Number.isSafeInteger(snapshot.data().reservedQuantity) || snapshot.data().reservedQuantity < order.items[index].quantity) ||
      movementSnapshots.some(snapshot => !snapshot.exists || snapshot.data().status !== 'reserved')) {
    throw new Error('HALO inventory reservation is inconsistent.');
  }
  order.items.forEach((item, index) => {
    transaction.update(productRefs[index], {
      reservedQuantity: productSnapshots[index].data().reservedQuantity - item.quantity,
      inventoryUpdatedAt: FieldValue.serverTimestamp()
    });
    transaction.update(movementRefs[index], { status: 'sold', committedAt: FieldValue.serverTimestamp() });
  });
  return { inventoryStatus: 'committed' };
}
async function releaseReservedInventory(transaction, orderRef, order, reason) {
  if (order.inventoryStatus !== 'reserved') return {};
  const productRefs = order.items.map(item => db.collection('products').doc(item.id));
  const movementRefs = order.items.map(item => inventoryMovementRef(orderRef.id, item.id));
  const snapshots = await Promise.all([...productRefs, ...movementRefs].map(ref => transaction.get(ref)));
  const productSnapshots = snapshots.slice(0, productRefs.length);
  const movementSnapshots = snapshots.slice(productRefs.length);
  if (productSnapshots.some(snapshot => !snapshot.exists) ||
      movementSnapshots.some(snapshot => !snapshot.exists || snapshot.data().status !== 'reserved')) {
    throw new Error('HALO inventory reservation is inconsistent; reconcile stock before release.');
  }
  order.items.forEach((item, index) => {
    const product = productSnapshots[index].data();
    const released = releaseInventory(product, item.quantity);
    transaction.update(productRefs[index], {
      ...released, inventoryUpdatedAt: FieldValue.serverTimestamp()
    });
    transaction.update(movementRefs[index], {
      status: 'released', reason, releasedAt: FieldValue.serverTimestamp()
    });
  });
  return { inventoryStatus: 'released' };
}
function sendError(response, status, code, message) {
  response.set('Cache-Control', 'no-store').status(status).json({ error: code, message });
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function setCors(request, response) {
  const origin = request.get('origin') || '';
  const allowed = allowedOrigins.value().split(',').map(value => value.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    response.set('Access-Control-Allow-Origin', origin).set('Vary', 'Origin');
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Firebase-AppCheck');
  }
  return Boolean(origin && allowed.includes(origin));
}

exports.createCheckoutSession = onRequest({ region, invoker: 'public', maxInstances: 3, timeoutSeconds: 30, secrets: [stripeSecret] }, async (request, response) => {
  if (!setCors(request, response)) return sendError(response, 403, 'origin_not_allowed', 'This HALO storefront origin is not allowed.');
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return sendError(response, 405, 'method_not_allowed', 'Use POST to begin checkout.');
  let orderRef;
  let items;
  try {
    await requireAppCheck(request);
    const requestKey = request.get('idempotency-key') || '';
    if (requestKey.length < 16 || requestKey.length > 128) return sendError(response, 400, 'idempotency_key_required', 'Refresh checkout and try again.');
    const email = String(request.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return sendError(response, 422, 'invalid_email', 'Enter a valid email address.');
    let customerUid = null;
    const authorization = request.get('authorization') || '';
    if (authorization) {
      const bearer = /^Bearer (.+)$/.exec(authorization);
      if (!bearer) return sendError(response, 401, 'customer_sign_in_required', 'Sign in again to attach this order to your HALO account.');
      let identity;
      try { identity = await getAuth().verifyIdToken(bearer[1], true); }
      catch (_) { return sendError(response, 401, 'customer_sign_in_required', 'Sign in again to attach this order to your HALO account.'); }
      if (identity.email_verified !== true || String(identity.email || '').toLowerCase() !== email) {
        return sendError(response, 403, 'customer_email_mismatch', 'Verify your account email and use it for this order.');
      }
      customerUid = identity.uid;
    }
    const deliveryMethod = String(request.body?.deliveryMethod || 'standard');
    // Circum eligibility and delivery creation require a verified server-side
    // integration; the browser postcode checker is not trusted for payment.
    if (deliveryMethod !== 'standard') return sendError(response, 422, 'delivery_unavailable', 'This delivery option is not available at secure checkout yet.');
    const requestItems = request.body?.items;
    if (!Array.isArray(requestItems) || requestItems.length < 1 || requestItems.length > 20 ||
        requestItems.some(item => !/^[a-z0-9][a-z0-9-]{0,99}$/.test(String(item?.id || '')))) {
      return sendError(response, 422, 'invalid_basket', 'Basket is invalid. Refresh the catalogue and try again.');
    }
    const productIds = requestItems.map(item => String(item.id));
    if (new Set(productIds).size !== productIds.length) return sendError(response, 422, 'invalid_basket', 'Basket contains repeated products. Refresh and try again.');
    const orderId = hash(requestKey).slice(0, 32);
    orderRef = db.collection('haloOrders').doc(orderId);
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(orderRef);
      if (existing.exists) {
        const order = existing.data();
        const existingFingerprint = checkoutFingerprint({ items: order.items || [], email, deliveryMethod, customerUid });
        const requested = requestItems.map(item => ({ id: String(item.id), variantId: String(item.variantId || ''), quantity: Number(item.quantity) }));
        const stored = (order.items || []).map(item => ({ id: item.id, variantId: item.variantId, quantity: item.quantity }));
        if (order.requestFingerprint !== existingFingerprint || JSON.stringify(requested) !== JSON.stringify(stored)) {
          throw new Error('This checkout key was already used for another basket.');
        }
        if (order.inventoryStatus !== 'reserved' || ['abandoned', 'failed'].includes(order.paymentStatus)) {
          throw new Error('This checkout attempt has ended. Refresh checkout to start a new attempt.');
        }
        items = order.items;
        return;
      }
      const productRefs = productIds.map(id => db.collection('products').doc(id));
      const productSnapshots = await Promise.all(productRefs.map(ref => transaction.get(ref)));
      const products = productSnapshots.map((snapshot, index) => ({ id: productIds[index], ...(snapshot.exists ? snapshot.data() : {}) }));
      items = parseCart(requestItems, products);
      const subtotal = items.reduce((sum, item) => sum + item.pricePence * item.quantity, 0);
      if (!Number.isSafeInteger(subtotal) || subtotal > 2_000_000) throw new Error('Basket total is outside the allowed limit.');
      const reservations = reserveInventory(products, items);
      const movementRefs = items.map(item => inventoryMovementRef(orderId, item.id));
      const priorMovements = await Promise.all(movementRefs.map(ref => transaction.get(ref)));
      if (priorMovements.some(snapshot => snapshot.exists)) throw new Error('Inventory reservation already exists; refresh checkout.');
      reservations.forEach((reservation, index) => {
        transaction.update(productRefs[index], {
          stockQuantity: reservation.stockQuantityAfter,
          reservedQuantity: reservation.reservedQuantityAfter,
          inventoryUpdatedAt: FieldValue.serverTimestamp()
        });
        transaction.create(movementRefs[index], {
          type: 'checkout_reservation', status: 'reserved', orderId, productId: reservation.id,
          quantity: reservation.quantity, brand: 'HALO', reservedAt: FieldValue.serverTimestamp()
        });
      });
      const fingerprint = checkoutFingerprint({ items, email, deliveryMethod, customerUid });
      transaction.create(orderRef, {
        brand: 'HALO', status: 'pending_payment', paymentStatus: 'pending', currency: 'GBP',
        items, subtotalPence: subtotal, deliveryPence: STANDARD_DELIVERY_PENCE,
        totalPence: subtotal + STANDARD_DELIVERY_PENCE,
        customerEmail: email, customerUid, deliveryMethod, requestFingerprint: fingerprint,
        inventoryStatus: 'reserved', createdAt: FieldValue.serverTimestamp()
      });
    });
    const subtotalPence = items.reduce((sum, item) => sum + item.pricePence * item.quantity, 0);
    if (!Number.isSafeInteger(subtotalPence) || subtotalPence > 2_000_000) return sendError(response, 422, 'basket_limit', 'Basket total is outside the allowed limit.');
    const order = (await orderRef.get()).data();
    const stripe = stripeClient();
    await assertRothcrossStripeAccount(stripe);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'], customer_email: email,
      client_reference_id: orderId,
      line_items: [
        ...items.map(item => ({ quantity: item.quantity, price_data: { currency: 'gbp', unit_amount: item.pricePence, product_data: { name: item.title } } })),
        { quantity: 1, price_data: { currency: 'gbp', unit_amount: STANDARD_DELIVERY_PENCE, product_data: { name: 'HALO Standard Delivery' } } }
      ],
      shipping_address_collection: { allowed_countries: ['GB'] },
      success_url: `${siteUrl.value().replace(/\/$/, '')}/?payment=processing&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl.value().replace(/\/$/, '')}/?payment=cancelled`,
      metadata: { store: 'halo', brand: 'HALO Skin UK', orderId },
      payment_intent_data: {
        metadata: { store: 'halo', brand: 'HALO Skin UK', orderId },
        statement_descriptor_suffix: 'HALO SKIN UK'
      }
    }, { idempotencyKey: `halo_checkout_${orderId}` });
    if (!session.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Stripe did not return a hosted checkout URL.');
    await orderRef.set({ stripeSessionId: session.id, stripeMode: 'test', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    response.set('Cache-Control', 'no-store').status(200).json({ url: session.url, orderId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (orderRef && items) {
      try {
        await db.runTransaction(async transaction => {
          const snapshot = await transaction.get(orderRef);
          if (!snapshot.exists) return;
          const order = snapshot.data();
          if (!order.stripeSessionId && order.inventoryStatus === 'reserved') {
            const inventoryPatch = await releaseReservedInventory(transaction, orderRef, order, 'checkout_setup_failed');
            transaction.update(orderRef, { ...inventoryPatch, paymentStatus: 'failed', updatedAt: FieldValue.serverTimestamp() });
          }
        });
      } catch (_) { /* Preserve the primary checkout failure; an unresolved reservation remains visible for admin review. */ }
    }
    sendError(response, error instanceof AppCheckAccessError ? 403 : /basket|item|price|email|delivery|checkout key|allowed limit|stock|inventory/i.test(message) ? 422 : 503,
      'checkout_unavailable', message || 'Secure checkout is temporarily unavailable.');
  }
});

exports.customerOrders = onRequest({ region, invoker: 'public', maxInstances: 3 }, async (request, response) => {
  if (request.method !== 'GET') return sendError(response, 405, 'method_not_allowed', 'Use GET to view your HALO orders.');
  const bearer = /^Bearer (.+)$/.exec(request.get('authorization') || '');
  if (!bearer) return sendError(response, 401, 'sign_in_required', 'Sign in to view your HALO orders.');
  let identity;
  try {
    await requireAppCheck(request);
  } catch (error) {
    return sendError(response, 403, 'app_check_required', error.message);
  }
  try {
    identity = await getAuth().verifyIdToken(bearer[1], true);
  } catch (_) {
    return sendError(response, 401, 'sign_in_required', 'Your session has expired. Sign in again to view your orders.');
  }
  if (identity.email_verified !== true) return sendError(response, 403, 'email_verification_required', 'Verify your account email to view order history.');
  try {
    const snapshot = await db.collection('haloOrders').where('customerUid', '==', identity.uid).orderBy('createdAt', 'desc').limit(50).get();
    const orders = snapshot.docs
      .map(document => customerOrderSummary(document.id, document.data()))
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    response.set('Cache-Control', 'no-store').status(200).json({ orders });
  } catch (_) {
    sendError(response, 503, 'orders_unavailable', 'Your order history is temporarily unavailable. Try again shortly.');
  }
});

exports.adminOrders = onRequest({ region, invoker: 'public', maxInstances: 3 }, async (request, response) => {
  if (request.method !== 'GET') return sendError(response, 405, 'method_not_allowed', 'Use GET to list HALO orders.');
  try {
    await requireHaloAdmin(request);
    const snapshot = await db.collection('haloOrders').orderBy('createdAt', 'desc').limit(100).get();
    const orders = await Promise.all(snapshot.docs.map(async document => {
      const order = document.data();
      return {
        id: document.id, status: order.status, paymentStatus: order.paymentStatus || 'pending',
        totalPence: order.totalPence, refundedPence: order.refundedPence || 0,
        shippingDetails: order.shippingDetails || null,
        deliveryMethod: order.deliveryMethod, trackingUrl: order.trackingUrl || null,
        createdAt: order.createdAt?.toDate?.().toISOString() || null,
        statusHistory: (await document.ref.collection('events').orderBy('at', 'desc').limit(8).get()).docs.map(event => {
          const data = event.data();
          return { type: data.type, from: data.from || null, to: data.to || null, reason: data.reason || null, actorEmail: data.actorEmail || null, at: data.at?.toDate?.().toISOString() || null };
        }),
        items: (order.items || []).map(item => ({ title: item.title, quantity: item.quantity }))
      };
    }));
    response.set('Cache-Control', 'no-store').status(200).json({ orders });
  } catch (error) {
    sendError(response, error instanceof AppCheckAccessError || error instanceof AdminAccessError ? 403 : 503, 'admin_orders_unavailable', error.message || 'HALO orders could not be loaded.');
  }
});

exports.adminFinancialReport = onRequest({ region, invoker: 'public', maxInstances: 2, timeoutSeconds: 60, secrets: [stripeSecret] }, async (request, response) => {
  if (!setCors(request, response)) return sendError(response, 403, 'origin_not_allowed', 'This HALO administrator origin is not allowed.');
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'GET') return sendError(response, 405, 'method_not_allowed', 'Use GET to load financial reconciliation.');
  try {
    await requireHaloAdmin(request);
    const stripe = stripeClient();
    await assertRothcrossStripeAccount(stripe);
    const snapshot = await db.collection('haloFinancialEntries').orderBy('recordedAt', 'desc').limit(500).get();
    const entries = snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
      .filter(entry => entry.brand === 'HALO' && entry.store === 'halo' && entry.stripeAccountId === expectedStripeAccountId.value());
    const reconciled = entries.filter(entry => entry.reconciliationStatus === 'reconciled' && entry.currency === 'GBP');
    const pending = entries.filter(entry => entry.reconciliationStatus !== 'reconciled' || entry.currency !== 'GBP');
    const recent = entries.slice(0, 100);
    const totals = reconciled.reduce((result, entry) => {
      result.grossPence += entry.grossPence;
      result.feePence += entry.feePence;
      result.netPence += entry.netPence;
      return result;
    }, { grossPence: 0, feePence: 0, netPence: 0 });
    response.set('Cache-Control', 'no-store').status(200).json({
      brand: 'HALO', stripeAccountId: expectedStripeAccountId.value(), currency: 'GBP',
      totals, reconciledCount: reconciled.length, pendingCount: pending.length,
      entries: recent.map(({ id, orderId, sourceType, sourceId, grossPence, feePence, netPence, reconciliationStatus }) => ({ id, orderId, sourceType, sourceId, grossPence, feePence, netPence, reconciliationStatus }))
    });
  } catch (error) {
    if (error instanceof AdminAccessError) return sendError(response, 403, 'admin_access_required', error.message);
    sendError(response, 503, 'financial_report_unavailable', 'HALO financial reconciliation could not be loaded.');
  }
});

exports.updateHaloOrder = onRequest({ region, invoker: 'public', maxInstances: 3 }, async (request, response) => {
  if (request.method !== 'POST') return sendError(response, 405, 'method_not_allowed', 'Use POST to update an order.');
  try {
    const admin = await requireHaloAdmin(request);
    const orderId = String(request.body?.orderId || '');
    const targetStatus = String(request.body?.status || '');
    if (targetStatus === 'paid') return sendError(response, 422, 'payment_confirmation_required', 'Stripe must confirm payment before the order can be marked paid.');
    const reason = String(request.body?.reason || '').trim().slice(0, 240);
    if (!/^[a-f0-9]{32}$/.test(orderId) || !reason) return sendError(response, 422, 'invalid_order_update', 'Provide an order ID and reason.');
    const orderRef = db.collection('haloOrders').doc(orderId);
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists) throw new Error('HALO order not found.');
      const order = snapshot.data();
      const status = nextOrderStatus(order.status, targetStatus);
      if (status === 'cancelled' && !['abandoned', 'refunded'].includes(order.paymentStatus)) {
        throw new Error('Wait for the Stripe Checkout session to expire, or refund the full payment before cancelling.');
      }
      if ((status === 'processing' || status === 'dispatched') && order.paymentStatus !== 'paid') throw new Error('This order requires payment review before fulfilment.');
      if ((status === 'processing' || status === 'dispatched') && order.deliveryMethod === 'standard' && !order.shippingDetails) throw new Error('A verified delivery address is required before fulfilment.');
      if (status === 'dispatched' && !/^https:\/\//.test(String(request.body?.trackingUrl || ''))) throw new Error('A secure tracking URL is required before dispatch.');
      const patch = { status, updatedAt: FieldValue.serverTimestamp() };
      if (status === 'dispatched') patch.trackingUrl = String(request.body.trackingUrl).slice(0, 500);
      if (status === 'delivered') patch.deliveredAt = FieldValue.serverTimestamp();
      transaction.update(orderRef, patch);
      const eventRef = orderRef.collection('events').doc();
      transaction.create(eventRef, { type: 'status_changed', from: order.status, to: status, reason, actorUid: admin.uid, actorEmail: admin.email, at: FieldValue.serverTimestamp() });
      return { orderId, status };
    });
    response.set('Cache-Control', 'no-store').status(200).json(result);
  } catch (error) {
    sendError(response, error instanceof AppCheckAccessError || error instanceof AdminAccessError ? 403 : 409, 'order_update_failed', error.message || 'Order could not be updated.');
  }
});

exports.requestHaloRefund = onRequest({ region, invoker: 'public', maxInstances: 3, secrets: [stripeSecret] }, async (request, response) => {
  if (request.method !== 'POST') return sendError(response, 405, 'method_not_allowed', 'Use POST to request a refund.');
  try {
    const admin = await requireHaloAdmin(request);
    const orderId = String(request.body?.orderId || '');
    const amountPence = Number(request.body?.amountPence);
    const reason = String(request.body?.reason || '').trim().slice(0, 240);
    const requestKey = request.get('idempotency-key') || '';
    if (!/^[a-f0-9]{32}$/.test(orderId) || !Number.isSafeInteger(amountPence) || amountPence < 1 || !reason || requestKey.length < 16 || requestKey.length > 128) {
      return sendError(response, 422, 'invalid_refund', 'Provide an order, positive amount, reason and idempotency key.');
    }
    const orderSnapshot = await db.collection('haloOrders').doc(orderId).get();
    if (!orderSnapshot.exists) return sendError(response, 404, 'order_not_found', 'HALO order was not found.');
    const order = orderSnapshot.data();
    if (order.brand !== 'HALO' || !order.paymentIntentId || !['paid', 'processing', 'dispatched', 'delivered'].includes(order.status)) return sendError(response, 409, 'refund_unavailable', 'Only paid HALO orders can be refunded.');
    if (amountPence > order.totalPence - Number(order.refundedPence || 0)) return sendError(response, 422, 'refund_exceeds_remaining', 'Refund amount exceeds the remaining paid total.');
    const stripe = stripeClient();
    await assertRothcrossStripeAccount(stripe);
    const refund = await stripe.refunds.create({
      payment_intent: order.paymentIntentId,
      amount: amountPence,
      metadata: { store: 'halo', brand: 'HALO Skin UK', orderId, reason, requestedBy: admin.uid }
    }, { idempotencyKey: `halo_refund_${hash(requestKey)}` });
    response.set('Cache-Control', 'no-store').status(200).json({ refundId: refund.id, status: refund.status, amountPence: refund.amount, currency: refund.currency });
  } catch (error) {
    sendError(response, error instanceof AppCheckAccessError || error instanceof AdminAccessError ? 403 : 503, 'refund_request_failed', error.message || 'Refund could not be requested.');
  }
});

exports.setHaloStockCount = onRequest({ region, invoker: 'public', maxInstances: 3 }, async (request, response) => {
  if (request.method !== 'POST') return sendError(response, 405, 'method_not_allowed', 'Use POST to record a HALO stock count.');
  try {
    const admin = await requireHaloAdmin(request);
    const productId = String(request.body?.productId || '');
    const physicalCount = request.body?.physicalCount;
    const reason = String(request.body?.reason || '').trim().slice(0, 240);
    const requestKey = request.get('idempotency-key') || '';
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(productId) || typeof physicalCount !== 'number' ||
        !Number.isSafeInteger(physicalCount) || physicalCount < 0 || reason.length < 3 ||
        requestKey.length < 16 || requestKey.length > 128) {
      return sendError(response, 422, 'invalid_stock_count', 'Provide a product, verified whole-unit count, reason and idempotency key.');
    }
    const productRef = db.collection('products').doc(productId);
    const movementRef = db.collection('haloInventoryMovements').doc(`count_${hash(requestKey).slice(0, 32)}`);
    const result = await db.runTransaction(async transaction => {
      const [movementSnapshot, productSnapshot] = await Promise.all([
        transaction.get(movementRef), transaction.get(productRef)
      ]);
      if (movementSnapshot.exists) return { ...movementSnapshot.data().result, duplicate: true };
      if (!productSnapshot.exists) throw new Error('HALO product was not found.');
      const product = productSnapshot.data();
      const reservedQuantity = product.reservedQuantity ?? 0;
      const adjustment = inventoryCountAdjustment(product.stockQuantity ?? null, reservedQuantity, physicalCount);
      const recordedAt = FieldValue.serverTimestamp();
      const responseData = {
        productId, physicalCount: adjustment.physicalCount, availableQuantity: adjustment.availableQuantity,
        reservedQuantity, previousPhysicalCount: adjustment.previousPhysicalCount, delta: adjustment.delta
      };
      transaction.update(productRef, {
        stockQuantity: adjustment.availableQuantity, reservedQuantity,
        inventoryCountedAt: recordedAt, inventoryCountedBy: admin.uid, inventoryUpdatedAt: recordedAt
      });
      transaction.create(movementRef, {
        type: 'physical_stock_count', status: 'recorded', brand: 'HALO', productId,
        ...responseData, reason, actorUid: admin.uid, actorEmail: admin.email,
        createdAt: recordedAt, result: responseData
      });
      return responseData;
    });
    response.set('Cache-Control', 'no-store').status(200).json(result);
  } catch (error) {
    sendError(response, error instanceof AppCheckAccessError || error instanceof AdminAccessError ? 403 : 422,
      'stock_count_failed', error.message || 'HALO stock count could not be saved.');
  }
});

exports.getCheckoutStatus = onRequest({ region, invoker: 'public', maxInstances: 3, secrets: [stripeSecret] }, async (request, response) => {
  if (!setCors(request, response)) return sendError(response, 403, 'origin_not_allowed', 'This HALO storefront origin is not allowed.');
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return sendError(response, 405, 'method_not_allowed', 'Use POST to check a checkout.');
  try {
    await requireAppCheck(request);
    const sessionId = String(request.body?.sessionId || '');
    if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) return sendError(response, 422, 'invalid_session', 'Stripe session reference is not valid.');
    const stripe = stripeClient();
    await assertRothcrossStripeAccount(stripe);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.store !== 'halo' || !session.metadata?.orderId) return sendError(response, 404, 'order_not_found', 'HALO order was not found.');
    const snapshot = await db.collection('haloOrders').doc(session.metadata.orderId).get();
    if (!snapshot.exists) return sendError(response, 404, 'order_not_found', 'HALO order was not found.');
    const order = snapshot.data();
    if (order.stripeSessionId !== session.id || session.currency !== 'gbp' || session.amount_total !== order.totalPence) return sendError(response, 409, 'payment_mismatch', 'Stripe session does not match the HALO order.');
    let paymentState = order.paymentStatus || 'pending';
    if (session.status === 'expired' && paymentState === 'pending') {
      const eventId = `checkout_expired_${session.id}`;
      const eventRef = db.collection('haloStripeEvents').doc(eventId);
      await db.runTransaction(async transaction => {
        const orderRef = db.collection('haloOrders').doc(session.metadata.orderId);
        const [eventSnapshot, orderSnapshot] = await Promise.all([transaction.get(eventRef), transaction.get(orderRef)]);
        if (!orderSnapshot.exists) return;
        const current = orderSnapshot.data();
        if (current.stripeSessionId !== session.id || current.paymentStatus !== 'pending') return;
        const inventoryPatch = await releaseReservedInventory(transaction, orderRef, { id: orderRef.id, ...current }, 'checkout_session_expired');
        if (!eventSnapshot.exists) transaction.create(eventRef, { type: 'checkout.session.expired', orderId: session.metadata.orderId, status: 'processed_by_status_check', createdAt: FieldValue.serverTimestamp() });
        transaction.update(orderRef, { ...inventoryPatch, paymentStatus: 'abandoned', updatedAt: FieldValue.serverTimestamp() });
      });
      paymentState = 'abandoned';
    }
    const paid = session.payment_status === 'paid';
    response.set('Cache-Control', 'no-store').status(200).json({
      paymentStatus: paid ? 'paid' : session.status === 'expired' ? 'abandoned' : 'pending',
      orderStatus: paid ? (order.status === 'pending_payment' ? 'paid' : order.status) : order.status,
      paymentState: paid ? 'paid' : paymentState
    });
  } catch (_) { sendError(response, 503, 'status_unavailable', 'Payment status is still being confirmed. Try again shortly.'); }
});

exports.stripeWebhook = onRequest({ region, invoker: 'public', maxInstances: 3, secrets: [stripeSecret, stripeWebhookSecret] }, async (request, response) => {
  if (request.method !== 'POST') return sendError(response, 405, 'method_not_allowed', 'Stripe webhooks require POST.');
  let event;
  try {
    const signature = request.get('stripe-signature');
    if (!signature) return sendError(response, 400, 'signature_missing', 'Stripe signature is required.');
    const stripe = stripeClient();
    await assertRothcrossStripeAccount(stripe);
    event = stripe.webhooks.constructEvent(request.rawBody, signature, stripeWebhookSecret.value());
  } catch (_) { return sendError(response, 400, 'signature_invalid', 'Stripe webhook signature verification failed.'); }
  if (event.livemode !== false) return sendError(response, 403, 'live_payment_rejected', 'This HALO endpoint accepts test-mode Stripe events only.');
  const eventRef = db.collection('haloStripeEvents').doc(event.id);
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.payment_status !== 'paid') return response.status(200).json({ received: true, ignored: 'not_paid' });
      const orderId = session.metadata?.orderId;
      if (session.metadata?.store !== 'halo' || !orderId) {
        await eventRef.create({ type: event.type, status: 'ignored_wrong_store', createdAt: FieldValue.serverTimestamp() }).catch(error => { if (error.code !== 6) throw error; });
        return response.status(200).json({ received: true, ignored: 'wrong_store' });
      }
      const orderRef = db.collection('haloOrders').doc(orderId);
      await db.runTransaction(async transaction => {
        const [eventSnapshot, orderSnapshot] = await Promise.all([transaction.get(eventRef), transaction.get(orderRef)]);
        if (eventSnapshot.exists) return;
        if (!orderSnapshot.exists) throw new Error('HALO order not found.');
        const order = orderSnapshot.data();
        const update = stripeEventOrderUpdate({ id: orderId, ...order }, event);
        const { eventStatus, ...patch } = update;
        const inventoryPatch = update.status === 'paid'
          ? await commitReservedInventory(transaction, orderRef, order)
          : {};
        Object.assign(patch, inventoryPatch);
        if (Object.keys(patch).length) transaction.update(orderRef, { ...patch, updatedAt: FieldValue.serverTimestamp(), ...(patch.status === 'paid' ? { paidAt: FieldValue.serverTimestamp() } : {}) });
        transaction.create(eventRef, { type: event.type, orderId, status: eventStatus, createdAt: FieldValue.serverTimestamp() });
      });
    } else if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
      const object = event.data.object;
      const orderId = object.metadata?.orderId || '';
      if (object.metadata?.store !== 'halo' || !orderId) {
        await eventRef.create({ type: event.type, status: 'ignored_wrong_store', createdAt: FieldValue.serverTimestamp() }).catch(error => { if (error.code !== 6) throw error; });
        return response.status(200).json({ received: true, ignored: 'wrong_store' });
      }
      const orderRef = db.collection('haloOrders').doc(orderId);
      await db.runTransaction(async transaction => {
        const [eventSnapshot, orderSnapshot] = await Promise.all([transaction.get(eventRef), transaction.get(orderRef)]);
        if (eventSnapshot.exists) return;
        if (!orderSnapshot.exists) throw new Error('HALO order not found.');
        const order = { id: orderId, ...orderSnapshot.data() };
        const update = stripeEventOrderUpdate(order, event);
        const { eventStatus, ...patch } = update;
        const inventoryPatch = update.paymentStatus === 'abandoned'
          ? await releaseReservedInventory(transaction, orderRef, order, 'checkout_session_expired')
          : {};
        Object.assign(patch, inventoryPatch);
        if (Object.keys(patch).length) transaction.update(orderRef, { ...patch, updatedAt: FieldValue.serverTimestamp() });
        transaction.create(eventRef, { type: event.type, orderId, status: eventStatus, createdAt: FieldValue.serverTimestamp() });
      });
    } else if (event.type === 'charge.succeeded') {
      const charge = event.data.object;
      const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (!paymentIntentId) return response.status(200).json({ received: true, ignored: 'no_payment_intent' });
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const orderId = paymentIntent.metadata?.orderId || '';
      if (paymentIntent.metadata?.store !== 'halo' || !orderId || !/^[a-f0-9]{32}$/.test(orderId)) {
        return response.status(200).json({ received: true, ignored: 'wrong_store' });
      }
      const orderRef = db.collection('haloOrders').doc(orderId);
      const orderSnapshot = await orderRef.get();
      if (!orderSnapshot.exists || orderSnapshot.data().brand !== 'HALO' ||
          (orderSnapshot.data().paymentIntentId && orderSnapshot.data().paymentIntentId !== paymentIntentId)) {
        throw new Error('HALO charge does not match a recorded HALO order.');
      }
      validateHaloCharge({ charge, order: { id: orderId, ...orderSnapshot.data() }, paymentIntentId });
      const [balanceTransaction, stripeAccount] = await Promise.all([
        resolveBalanceTransaction(stripe, charge), stripe.accounts.retrieve()
      ]);
      const stripeAccountId = stripeAccount.id;
      const ledgerEntry = balanceTransaction
        ? haloFinancialEntry({ balanceTransaction, stripeAccountId, orderId, sourceType: 'charge', sourceId: charge.id, paymentIntentId })
        : pendingHaloFinancialEntry({ stripeAccountId, orderId, sourceType: 'charge', sourceId: charge.id, paymentIntentId, grossPence: charge.amount });
      const ledgerRef = db.collection('haloFinancialEntries').doc(`charge_${charge.id}`);
      await db.runTransaction(async transaction => {
        const [eventSnapshot, ledgerSnapshot] = await Promise.all([transaction.get(eventRef), transaction.get(ledgerRef)]);
        if (!eventSnapshot.exists) transaction.create(eventRef, { type: event.type, orderId, status: 'processed', createdAt: FieldValue.serverTimestamp() });
        if (!ledgerSnapshot.exists || (ledgerSnapshot.data().reconciliationStatus !== 'reconciled' && ledgerEntry.reconciliationStatus === 'reconciled')) {
          transaction.set(ledgerRef, { ...ledgerEntry, recordedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      });
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : '';
      if (!paymentIntentId) return response.status(200).json({ received: true, ignored: 'no_payment_intent' });
      // Rothcross uses one Stripe account across its brands. Charge metadata
      // is not guaranteed to contain PaymentIntent metadata, so use the
      // authoritative PaymentIntent to identify HALO's own order.
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const orderId = haloRefundOrderId(paymentIntentId, paymentIntent);
      if (!orderId) {
        return response.status(200).json({ received: true, ignored: 'wrong_store' });
      }
      const orderRef = db.collection('haloOrders').doc(orderId);
      const account = await stripe.accounts.retrieve();
      const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 });
      if (refunds.has_more) throw new Error('HALO refund ledger exceeds the safe event page; reconcile additional Stripe refunds before processing.');
      const financialEntries = [];
      for (const refund of refunds.data) {
        const balanceTransaction = await resolveBalanceTransaction(stripe, refund);
        financialEntries.push({
          ref: db.collection('haloFinancialEntries').doc(`refund_${refund.id}`),
          data: balanceTransaction
            ? haloFinancialEntry({ balanceTransaction, stripeAccountId: account.id, orderId, sourceType: 'refund', sourceId: refund.id, paymentIntentId })
            : pendingHaloFinancialEntry({ stripeAccountId: account.id, orderId, sourceType: 'refund', sourceId: refund.id, paymentIntentId, grossPence: -refund.amount })
        });
      }
      await db.runTransaction(async transaction => {
        const [eventSnapshot, orderSnapshot, ...ledgerSnapshots] = await Promise.all([
          transaction.get(eventRef), transaction.get(orderRef), ...financialEntries.map(entry => transaction.get(entry.ref))
        ]);
        if (eventSnapshot.exists) {
          financialEntries.forEach((entry, index) => {
            const existing = ledgerSnapshots[index];
            if (!existing.exists || (existing.data().reconciliationStatus !== 'reconciled' && entry.data.reconciliationStatus === 'reconciled')) {
              transaction.set(entry.ref, { ...entry.data, recordedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            }
          });
          return;
        }
        if (!orderSnapshot.exists) throw new Error('HALO order has not been recorded yet.');
        const order = orderSnapshot.data();
        if (order.brand !== 'HALO') {
          transaction.create(eventRef, { type: event.type, status: 'ignored_wrong_store', createdAt: FieldValue.serverTimestamp() });
          return;
        }
        // Stripe can deliver the refund before checkout.session.completed.
        // Leave the event unrecorded so Stripe can retry once the order is paid.
        if (!order?.paymentIntentId) throw new Error('HALO payment has not been recorded yet.');
        if (order.paymentIntentId !== paymentIntentId) {
          transaction.create(eventRef, {
            type: event.type, status: 'payment_mismatch', orderId,
            paymentIntentId, createdAt: FieldValue.serverTimestamp()
          });
          return;
        }
        const { eventStatus, ...patch } = stripeRefundOrderUpdate(order, charge);
        if (eventStatus === 'processed') {
          transaction.update(orderRef, {
            ...patch, refundedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
          });
        }
        financialEntries.forEach((entry, index) => {
          const existing = ledgerSnapshots[index];
          if (!existing.exists || (existing.data().reconciliationStatus !== 'reconciled' && entry.data.reconciliationStatus === 'reconciled')) {
            transaction.set(entry.ref, { ...entry.data, recordedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          }
        });
        if (!eventSnapshot.exists) transaction.create(eventRef, {
          type: event.type, status: eventStatus, orderId,
          paymentIntentId, createdAt: FieldValue.serverTimestamp()
        });
      });
    } else {
      await eventRef.create({ type: event.type, status: 'ignored', createdAt: FieldValue.serverTimestamp() }).catch(error => { if (error.code !== 6) throw error; });
    }
    response.status(200).json({ received: true });
  } catch (_) { sendError(response, 500, 'webhook_processing_failed', 'Payment event could not be recorded; Stripe should retry.'); }
});
