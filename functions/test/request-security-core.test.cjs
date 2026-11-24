'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AppCheckAccessError, requireVerifiedAppCheck } = require('../request-security-core');

test('requires and verifies a Firebase App Check request token', async () => {
  let received;
  await requireVerifiedAppCheck({ get: name => name === 'x-firebase-appcheck' ? 'a'.repeat(32) : '' }, async token => { received = token; });
  assert.equal(received, 'a'.repeat(32));
});

test('rejects a missing or invalid Firebase App Check token', async () => {
  await assert.rejects(requireVerifiedAppCheck({ get: () => '' }, async () => {}), AppCheckAccessError);
  await assert.rejects(requireVerifiedAppCheck({ get: () => 'a'.repeat(32) }, async () => { throw new Error('invalid'); }), AppCheckAccessError);
});
