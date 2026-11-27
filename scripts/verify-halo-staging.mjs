import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGING_ORIGIN = 'https://halo-skin-uk-stg.web.app';
const probes = [
  {
    name: 'checkout CORS preflight', path: '/api/createCheckoutSession', method: 'OPTIONS',
    headers: { Origin: STAGING_ORIGIN, 'Access-Control-Request-Method': 'POST' }, status: 204
  },
  { name: 'customer orders auth gate', path: '/api/customerOrders', method: 'GET', status: 401, error: 'sign_in_required' },
  { name: 'Admin orders App Check gate', path: '/api/adminOrders', method: 'GET', status: 403, error: 'admin_orders_unavailable' },
  { name: 'stock count method gate', path: '/api/setHaloStockCount', method: 'GET', status: 405, error: 'method_not_allowed' },
  { name: 'Stripe webhook method gate', path: '/api/stripeWebhook', method: 'GET', status: 405, error: 'method_not_allowed' }
];

export async function verifyHaloStaging(fetchImpl = fetch) {
  const results = [];
  for (const probe of probes) {
    const response = await fetchImpl(new URL(probe.path, STAGING_ORIGIN), {
      method: probe.method,
      headers: probe.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });
    if (response.status !== probe.status) {
      throw new Error(`${probe.name} returned HTTP ${response.status}; expected ${probe.status}.`);
    }
    if (probe.error) {
      let payload;
      try { payload = await response.json(); }
      catch (_) { throw new Error(`${probe.name} returned a non-JSON response.`); }
      if (payload?.error !== probe.error) throw new Error(`${probe.name} returned an unexpected error code.`);
    }
    results.push({ name: probe.name, status: response.status });
  }
  return results;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyHaloStaging()
    .then(results => results.forEach(({ name, status }) => console.log(`PASS ${name}: HTTP ${status}`)))
    .catch(error => {
      console.error(`HALO staging smoke check failed: ${error.message}`);
      process.exitCode = 1;
    });
}
