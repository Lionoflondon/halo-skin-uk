'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const { createRothMerchantClient, haloRothIntegration, integrationReference } = require('../roth-merchant-core');

const hash = value => createHash('sha256').update(value).digest('hex');

function response(payload, ok = true, status = 200) {
  return { ok, status, async json() { return payload; } };
}

test('signs the canonical ROTH request and sends only to the configured HTTPS API origin', async () => {
  let observed;
  const client = createRothMerchantClient({
    baseUrl: 'https://roth.example', keyId: 'halo-stage-key', secret: 'private-test-secret',
    clock: () => new Date('2026-11-24T12:34:56.000Z'), nonceFactory: () => 'nonce-1',
    fetchImpl: async (url, options) => { observed = { url, options }; return response({ code: 'abc', expiresInSeconds: 300 }); }
  });
  const result = await client.integration('startLink', { externalId: 'firebase-uid' });
  const body = JSON.stringify({ externalId: 'firebase-uid' });
  const canonical = ['POST', '/v1/integration/startLink', '2026-11-24T12:34:56.000Z', 'nonce-1', hash(body)].join('\n');
  assert.deepEqual(result, { code: 'abc', expiresInSeconds: 300 });
  assert.equal(observed.url, 'https://roth.example/v1/integration/startLink');
  assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.headers['X-ROTH-Key-Id'], 'halo-stage-key');
  assert.equal(observed.options.headers['X-ROTH-Timestamp'], '2026-11-24T12:34:56.000Z');
  assert.equal(observed.options.headers['X-ROTH-Nonce'], 'nonce-1');
  assert.equal(observed.options.headers['X-ROTH-Signature'], createHmac('sha256', 'private-test-secret').update(canonical).digest('hex'));
  assert.equal(observed.options.body, body);
});

test('rejects insecure, path-scoped, or credential-free API configuration and unknown actions', () => {
  const options = { keyId: 'id', secret: 'secret' };
  assert.throws(() => createRothMerchantClient({ ...options, baseUrl: 'http://roth.example' }), /HTTPS/);
  assert.throws(() => createRothMerchantClient({ ...options, baseUrl: 'https://roth.example/prefix' }), /origin only/);
  assert.throws(() => createRothMerchantClient({ ...options, baseUrl: 'https://roth.example', secret: '' }), /credentials/);
  const client = createRothMerchantClient({ ...options, baseUrl: 'https://roth.example', fetchImpl: async () => response({}) });
  assert.throws(() => client.integration('unknown', {}), /Unsupported/);
});

test('surfaces safe ROTH error code and status while refusing unreadable responses', async () => {
  const client = createRothMerchantClient({
    baseUrl: 'https://roth.example', keyId: 'id', secret: 'secret',
    fetchImpl: async () => response({ title: 'Not authorised', code: 'merchant_scope_missing' }, false, 403)
  });
  await assert.rejects(client.integration('balance', { externalId: 'uid' }), error => {
    assert.equal(error.message, 'Not authorised');
    assert.equal(error.status, 403);
    assert.equal(error.code, 'merchant_scope_missing');
    return true;
  });
  const unreadable = createRothMerchantClient({
    baseUrl: 'https://roth.example', keyId: 'id', secret: 'secret', fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } })
  });
  await assert.rejects(unreadable.integration('balance', { externalId: 'uid' }), /unreadable response/);
});

test('uses stable, operation-scoped HALO references for rewards, orders and refunds', async () => {
  const calls = [];
  const client = {
    integration: async (action, body) => { calls.push({ action, body }); return { ok: true }; },
    settlements: async () => ({ settlements: [] })
  };
  const api = haloRothIntegration(client);
  await api.issueReward({ handle: 'customer', rewardId: 'campaign-1-customer-1', amountPence: 250, campaignId: 'welcome', reason: 'Welcome reward' });
  await api.reserve({ externalId: 'verified-firebase-uid', orderId: 'halo-order-1', amountPence: 1000 });
  await api.confirm({ orderId: 'halo-order-1', reservationId: 'reservation-1' });
  await api.cancel({ orderId: 'halo-order-1', reservationId: 'reservation-1' });
  await api.refund({ refundId: 'stripe-refund-1', journalId: 'roth-journal-1', amountPence: 100, reason: 'Partial order refund' });
  assert.equal(calls[0].action, 'rewardByHandle');
  assert.equal(calls[0].body.rewardId, integrationReference('reward', 'campaign-1-customer-1'));
  assert.equal(calls[1].body.orderId, integrationReference('order', 'halo-order-1'));
  assert.equal(calls[2].body.orderId, calls[1].body.orderId);
  assert.equal(calls[3].body.orderId, calls[1].body.orderId);
  assert.equal(calls[4].body.refundId, integrationReference('refund', 'stripe-refund-1'));
  assert.notEqual(integrationReference('reward', 'same'), integrationReference('order', 'same'));
  assert.deepEqual(await api.settlements(), await client.settlements());
});

test('rejects missing identities, invalid references and non-positive reward/redemption/refund values', async () => {
  const api = haloRothIntegration({ integration: async () => ({}), settlements: async () => ({}) });
  assert.throws(() => api.startLink(''), /authenticated HALO customer/);
  assert.throws(() => api.wallet(''), /authenticated HALO customer/);
  assert.throws(() => api.issueReward({ handle: 'customer', rewardId: '', amountPence: 1, campaignId: 'campaign', reason: 'reason' }), /stable HALO reference/);
  assert.throws(() => api.issueReward({ handle: 'customer', rewardId: 'id', amountPence: 0, campaignId: 'campaign', reason: 'reason' }), /positive whole amount/);
  assert.throws(() => api.reserve({ externalId: 'uid', orderId: '', amountPence: 1 }), /stable HALO reference/);
  assert.throws(() => api.refund({ refundId: 'refund', journalId: 'journal', amountPence: -1, reason: 'reason' }), /positive whole amount/);
  assert.throws(() => api.receipt(''), /journal reference/);
});

