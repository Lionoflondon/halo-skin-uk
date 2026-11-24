'use strict';

function haloFinancialEntry({ balanceTransaction, stripeAccountId, orderId, sourceType, sourceId, paymentIntentId }) {
  if (!balanceTransaction || typeof balanceTransaction.id !== 'string' ||
      !/^acct_[A-Za-z0-9]+$/.test(stripeAccountId || '') || !/^[a-f0-9]{32}$/.test(String(orderId || '')) ||
      !['charge', 'refund'].includes(sourceType) || typeof sourceId !== 'string' ||
      !Number.isSafeInteger(balanceTransaction.amount) || !Number.isSafeInteger(balanceTransaction.fee) ||
      !Number.isSafeInteger(balanceTransaction.net) || balanceTransaction.currency !== 'gbp' ||
      balanceTransaction.net !== balanceTransaction.amount - balanceTransaction.fee ||
      !Number.isSafeInteger(balanceTransaction.created) || !Number.isSafeInteger(balanceTransaction.available_on)) {
    throw new Error('Stripe balance transaction is incomplete or does not reconcile in GBP.');
  }
  if ((sourceType === 'charge' && balanceTransaction.amount < 0) ||
      (sourceType === 'refund' && balanceTransaction.amount > 0)) {
    throw new Error('Stripe balance transaction direction does not match its HALO movement.');
  }
  return {
    brand: 'HALO', store: 'halo', orderId, sourceType, sourceId, paymentIntentId,
    stripeAccountId, balanceTransactionId: balanceTransaction.id,
    grossPence: balanceTransaction.amount, feePence: balanceTransaction.fee,
    netPence: balanceTransaction.net, currency: 'GBP',
    reportingCategory: String(balanceTransaction.reporting_category || ''),
    balanceStatus: String(balanceTransaction.status || ''),
    createdAtUnix: balanceTransaction.created, availableOnUnix: balanceTransaction.available_on,
    reconciliationStatus: 'reconciled'
  };
}

function pendingHaloFinancialEntry({ stripeAccountId, orderId, sourceType, sourceId, paymentIntentId, grossPence }) {
  if (!/^acct_[A-Za-z0-9]+$/.test(stripeAccountId || '') || !/^[a-f0-9]{32}$/.test(String(orderId || '')) ||
      !['charge', 'refund'].includes(sourceType) || typeof sourceId !== 'string' ||
      !Number.isSafeInteger(grossPence) || (sourceType === 'charge' && grossPence < 0) || (sourceType === 'refund' && grossPence > 0)) {
    throw new Error('HALO financial movement cannot be recorded.');
  }
  return {
    brand: 'HALO', store: 'halo', orderId, sourceType, sourceId, paymentIntentId,
    stripeAccountId, grossPence, feePence: null, netPence: null, currency: 'GBP',
    balanceTransactionId: null, reconciliationStatus: 'pending_balance_transaction'
  };
}

function validateHaloCharge({ charge, order, paymentIntentId }) {
  if (!charge || !order || order.brand !== 'HALO' || order.currency !== 'GBP' ||
      typeof paymentIntentId !== 'string' || !paymentIntentId ||
      charge.payment_intent !== paymentIntentId || charge.currency !== 'gbp' || charge.paid !== true ||
      charge.status !== 'succeeded' || charge.amount !== order.totalPence ||
      !Number.isSafeInteger(charge.amount_captured) || charge.amount_captured !== order.totalPence ||
      !/^[a-f0-9]{32}$/.test(String(order.id || ''))) {
    throw new Error('Stripe charge does not match the paid HALO order.');
  }
  return true;
}

module.exports = { haloFinancialEntry, pendingHaloFinancialEntry, validateHaloCharge };
