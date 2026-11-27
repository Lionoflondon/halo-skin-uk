import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyHaloStaging } from '../scripts/verify-halo-staging.mjs';

test('staging smoke check probes only fixed HALO staging routes and sends no order data', async () => {
  const calls = [];
  const statuses = [204, 401, 403, 405, 405];
  const errors = [null, 'sign_in_required', 'admin_orders_unavailable', 'method_not_allowed', 'method_not_allowed'];
  const fetchMock = async (url, options) => {
    const index = calls.length;
    calls.push({ url: String(url), options });
    return {
      status: statuses[index],
      json: async () => ({ error: errors[index] })
    };
  };

  const results = await verifyHaloStaging(fetchMock);

  assert.deepEqual(results.map(result => result.status), statuses);
  assert.ok(calls.every(call => call.url.startsWith('https://halo-skin-uk-stg.web.app/')));
  assert.deepEqual(calls.map(call => call.options.method), ['OPTIONS', 'GET', 'GET', 'GET', 'GET']);
  assert.ok(calls.every(call => call.options.body === undefined));
  assert.equal(calls[0].options.headers.Origin, 'https://halo-skin-uk-stg.web.app');
});

test('staging smoke check rejects a missing or misrouted backend', async () => {
  await assert.rejects(
    verifyHaloStaging(async () => ({ status: 404 })),
    /checkout CORS preflight returned HTTP 404; expected 204/
  );
});
