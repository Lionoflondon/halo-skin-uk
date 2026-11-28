'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { logHaloServerFailure } = require('../observability-core');

test('logs only safe status and stable error code for backend failures', () => {
  const entries = [];
  const logger = { error: (message, fields) => entries.push({ message, fields }) };

  logHaloServerFailure(logger, 503, 'stripe_unavailable');
  logHaloServerFailure(logger, 500, 'customer@example.com');
  logHaloServerFailure(logger, 400, 'invalid_basket');

  assert.deepEqual(entries, [
    { message: 'HALO backend request failed', fields: { status: 503, errorCode: 'stripe_unavailable' } },
    { message: 'HALO backend request failed', fields: { status: 500, errorCode: 'internal_error' } }
  ]);
});

test('does not log invalid statuses or client errors', () => {
  const entries = [];
  const logger = { error: (...entry) => entries.push(entry) };

  for (const status of [null, 200, 400, 499, 600]) logHaloServerFailure(logger, status, 'internal_error');

  assert.deepEqual(entries, []);
});
