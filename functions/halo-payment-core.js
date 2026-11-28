'use strict';

const STANDARD_DELIVERY_PENCE = 299;
const ROTHCROSS_STRIPE_TEST_ACCOUNT_ID = 'acct_1UVzZNGixLdvM11b';

function assertHaloStagingProject(projectId) {
  if (projectId !== 'halo-skin-uk-stg') throw new Error('HALO test payments require the isolated staging project.');
}

function requireTestStripeKey(key) {
  if (!/^(?:sk|rk)_test_[^\s]+$/.test(key || '')) throw new Error('HALO checkout accepts Stripe test keys only.');
  return key;
}

function assertStripeAccountId(expected, actual) {
  if (!/^acct_[A-Za-z0-9]+$/.test(expected || '') || actual !== expected) {
    throw new Error('Configured Stripe key does not belong to the expected Rothcross account.');
  }
}

function parseCart(items, products) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new Error('Basket is invalid.');
  const productById = new Map(products.map(product => [product.id, product]));
  const seen = new Set();
  return items.map(line => {
    const id = String(line?.id || '');
    const product = productById.get(id);
    const quantity = Number(line?.quantity);
    if (!product || product.published !== true || product.available === false ||
        !Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < quantity ||
        String(line?.variantId || '') !== String(product.variantId || `${id}-default`) ||
        !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10 || seen.has(id)) {
      throw new Error('One or more basket items are unavailable. Refresh the catalogue and try again.');
    }
    const pricePence = Math.round(Number(product.price) * 100);
    if (!Number.isSafeInteger(pricePence) || pricePence < 1) throw new Error('A basket item has an invalid price.');
    seen.add(id);
    return { id, variantId: product.variantId || `${id}-default`, title: String(product.title || 'HALO product').slice(0, 120), quantity, pricePence };
  });
}

function checkoutFingerprint({ items, email, deliveryMethod, customerUid = null }) {
  return JSON.stringify({ items, email: String(email || '').trim().toLowerCase(), deliveryMethod, customerUid: customerUid || null });
}

module.exports = { ROTHCROSS_STRIPE_TEST_ACCOUNT_ID, STANDARD_DELIVERY_PENCE, assertHaloStagingProject, assertStripeAccountId, checkoutFingerprint, parseCart, requireTestStripeKey };
