'use strict';

function haloFinancialEntry({ balanceTransaction, stripeAccountId, orderId, sourceType, sourceId, paymentIntentId, expectedGrossPence }) {
  if (!balanceTransaction || typeof balanceTransaction.id !== 'string' ||
      !/^acct_[A-Za-z0-9]+$/.test(stripeAccountId || '') || !/^[a-f0-9]{32}$/.test(String(orderId || '')) ||
      !['charge', 'refund'].includes(sourceType) || typeof sourceId !== 'string' ||
      !Number.isSafeInteger(balanceTransaction.amount) || !Number.isSafeInteger(balanceTransaction.fee) ||
      !Number.isSafeInteger(balanceTransaction.net) || balanceTransaction.currency !== 'gbp' ||
      balanceTransaction.net !== balanceTransaction.amount - balanceTransaction.fee ||
      !Number.isSafeInteger(expectedGrossPence) || balanceTransaction.amount !== expectedGrossPence ||
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

function reconcilePendingHaloFinancialEntry({ existingEntry, source, paymentIntent, balanceTransaction, stripeAccountId }) {
  if (!existingEntry || existingEntry.brand !== 'HALO' || existingEntry.store !== 'halo' ||
      existingEntry.reconciliationStatus !== 'pending_balance_transaction' ||
      !['charge', 'refund'].includes(existingEntry.sourceType) ||
      typeof existingEntry.sourceId !== 'string' || !existingEntry.sourceId ||
      !/^[a-f0-9]{32}$/.test(String(existingEntry.orderId || '')) ||
      existingEntry.stripeAccountId !== stripeAccountId ||
      !source || source.id !== existingEntry.sourceId || !paymentIntent ||
      paymentIntent.id !== existingEntry.paymentIntentId ||
      paymentIntent.metadata?.store !== 'halo' || paymentIntent.metadata?.orderId !== existingEntry.orderId) {
    throw new Error('Pending financial entry does not match a HALO Stripe source.');
  }

  const sourcePaymentIntentId = typeof source.payment_intent === 'string'
    ? source.payment_intent : source.payment_intent?.id;
  if (sourcePaymentIntentId !== paymentIntent.id) throw new Error('Stripe source PaymentIntent does not match the HALO ledger entry.');

  const expectedGrossPence = existingEntry.sourceType === 'charge'
    ? source.amount_captured
    : -source.amount;
  if (!Number.isSafeInteger(expectedGrossPence) || existingEntry.grossPence !== expectedGrossPence ||
      (existingEntry.sourceType === 'charge' && (source.paid !== true || source.status !== 'succeeded')) ||
      (existingEntry.sourceType === 'refund' && (!Number.isSafeInteger(source.amount) || source.amount < 1))) {
    throw new Error('Stripe source amount does not match the pending HALO financial entry.');
  }

  return haloFinancialEntry({
    balanceTransaction,
    stripeAccountId,
    orderId: existingEntry.orderId,
    sourceType: existingEntry.sourceType,
    sourceId: existingEntry.sourceId,
    paymentIntentId: paymentIntent.id,
    expectedGrossPence
  });
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

module.exports = { haloFinancialEntry, pendingHaloFinancialEntry, reconcilePendingHaloFinancialEntry, validateHaloCharge };
