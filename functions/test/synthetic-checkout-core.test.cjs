'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isSyntheticStagingCheckoutEnabled } = require('../synthetic-checkout-core');

test('server checkout requires the explicit flag and isolated HALO staging project', () => {
  assert.equal(isSyntheticStagingCheckoutEnabled({ projectId: 'halo-skin-uk-stg', enabled: 'true' }), true);
  assert.equal(isSyntheticStagingCheckoutEnabled({ projectId: 'halo-skin-uk-stg', enabled: 'false' }), false);
  assert.equal(isSyntheticStagingCheckoutEnabled({ projectId: 'halo-skin-uk-stg', enabled: undefined }), false);
  assert.equal(isSyntheticStagingCheckoutEnabled({ projectId: 'halo-skin-uk', enabled: 'true' }), false);
  assert.equal(isSyntheticStagingCheckoutEnabled({ projectId: 'another-project', enabled: 'true' }), false);
  assert.equal(isSyntheticStagingCheckoutEnabled({ projectId: 'HALO-SKIN-UK-STG', enabled: 'true' }), false);
});
