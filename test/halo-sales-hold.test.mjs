import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isSyntheticStagingSalesEnabled } from '../sales-mode.mjs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const firebaseConfig = readFileSync(new URL('../firebase-config.js', import.meta.url), 'utf8');

const configuredStaging = {
  hostname: 'halo-skin-uk-stg.web.app',
  projectId: 'halo-skin-uk-stg',
  checkoutEnabled: true,
  appCheckSiteKey: 'recaptcha-site-key'
};

test('synthetic sales require the exact isolated HALO staging host, project, App Check and checkout flag', () => {
  assert.equal(isSyntheticStagingSalesEnabled(configuredStaging), true);
  assert.equal(isSyntheticStagingSalesEnabled({ ...configuredStaging, hostname: 'HALO-SKIN-UK-STG.WEB.APP' }), true);
  assert.equal(isSyntheticStagingSalesEnabled({ ...configuredStaging, hostname: 'haloskinuk.com' }), false);
  assert.equal(isSyntheticStagingSalesEnabled({ ...configuredStaging, hostname: 'halo-skin-uk.web.app' }), false);
  assert.equal(isSyntheticStagingSalesEnabled({ ...configuredStaging, projectId: 'halo-skin-uk' }), false);
  assert.equal(isSyntheticStagingSalesEnabled({ ...configuredStaging, checkoutEnabled: false }), false);
  assert.equal(isSyntheticStagingSalesEnabled({ ...configuredStaging, appCheckSiteKey: '' }), false);
  assert.equal(isSyntheticStagingSalesEnabled({ ...configuredStaging, appCheckSiteKey: undefined }), false);
});

test('production and hosting-only defaults hold product sales in the storefront', () => {
  assert.match(firebaseConfig, /window\.HALO_HOSTED_CHECKOUT_ENABLED = false/);
  assert.match(app, /const salesOnHold = !syntheticStagingSalesEnabled/);
  assert.match(app, /if \(!syntheticStagingSalesEnabled \|\| !product/);
  assert.match(app, /function openCheckout\(\) \{\s*if \(!syntheticStagingSalesEnabled\)/);
  assert.match(app, /if \(!syntheticStagingSalesEnabled \|\| !endpoint\)/);
  assert.match(app, /checkoutButton\.disabled = !cart\.length \|\| !syntheticStagingSalesEnabled/);
});
