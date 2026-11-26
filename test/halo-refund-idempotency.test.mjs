import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getRefundRequestKey } from '../admin-refund-idempotency.mjs';

const orderId = '0123456789abcdef0123456789abcdef';
const adminHtml = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');

test('reuses the same refund request key for the same order refund snapshot', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  let created = 0;
  const createKey = () => `request-key-${++created}-0123456789`;
  const first = getRefundRequestKey(orderId, 0, { storage, createKey });
  const retry = getRefundRequestKey(orderId, 0, { storage, createKey });
  assert.equal(retry, first);
  assert.equal(created, 1);
});

test('creates a new key when the confirmed cumulative refund changes', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  let created = 0;
  const createKey = () => `request-key-${++created}-0123456789`;
  const before = getRefundRequestKey(orderId, 0, { storage, createKey });
  const after = getRefundRequestKey(orderId, 500, { storage, createKey });
  assert.notEqual(after, before);
  assert.equal(created, 2);
});

test('reuses an in-memory request key when browser storage is unavailable', () => {
  const failingStorage = { getItem() { throw new Error('storage unavailable'); } };
  let created = 0;
  const createKey = () => `fallback-key-${++created}-0123456789`;
  const first = getRefundRequestKey(orderId, 0, { storage: failingStorage, createKey });
  const retry = getRefundRequestKey(orderId, 0, { storage: failingStorage, createKey });
  assert.equal(retry, first);
  assert.equal(created, 1);
});

test('rejects malformed refund order snapshots', () => {
  assert.throws(() => getRefundRequestKey('not-an-order', 0, { storage: null }), /snapshot is invalid/);
  assert.throws(() => getRefundRequestKey(orderId, -1, { storage: null }), /snapshot is invalid/);
});

test('admin page cache key advances when refund retry logic changes', () => {
  assert.match(adminHtml, /admin\.js\?v=8/);
});
