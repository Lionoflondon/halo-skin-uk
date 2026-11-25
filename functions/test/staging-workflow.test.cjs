'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy-staging.yml'), 'utf8');

test('HALO deployment stays manual, serialized and behind the staging environment gate', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.match(workflow, /group: halo-staging-deploy\n  cancel-in-progress: false/);
  assert.match(workflow, /environment: halo-staging/);
  assert.match(workflow, /test "\$PROJECT_ID" != "halo-skin-uk"[\s\S]*test "\$PROJECT_ID" = "halo-skin-uk-stg"/);
  assert.match(workflow, /firebase-tools@[^\s]+ deploy --only hosting,functions,firestore:rules,firestore:indexes,auth --project "\$PROJECT_ID"/);
});

test('HALO Stripe secret injection requires test mode and a London-only replication location', () => {
  assert.match(workflow, /sk_test_\*\|rk_test_\*/);
  assert.match(workflow, /--replication-policy=user-managed --locations=europe-west2/);
  assert.match(workflow, /locations" != "europe-west2,"/);
  assert.doesNotMatch(workflow, /--replication-policy=automatic/);
});

test('HALO ROTH staging is optional for core deployment but all merchant settings are required together', () => {
  assert.match(workflow, /HALO_ROTH_API_ORIGIN/);
  assert.match(workflow, /HALO_ROTH_MERCHANT_KEY_ID/);
  assert.match(workflow, /HALO_ROTH_MERCHANT_SECRET/);
  assert.match(workflow, /HALO_ROTH_BUSINESS_ID/);
  assert.match(workflow, /write_london_secret HALO_ROTH_MERCHANT_SECRET/);
  assert.match(workflow, /ROTH_API_ORIGIN[\s\S]*ROTH_MERCHANT_KEY_ID[\s\S]*ROTH_BUSINESS_ID/);
  assert.match(workflow, /Complete all HALO ROTH merchant settings, or leave all three unset/);
  assert.match(workflow, /rothEnabled: rothConfigured/);
});

test('ROTH endpoints are exported only when the three merchant identity settings exist', () => {
  const functions = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  assert.match(functions, /if \(rothApiOrigin\.value\(\) && rothMerchantKeyId\.value\(\) && rothBusinessId\.value\(\)\)\s*\{\s*exports\.rothLinkStart/);
});

test('HALO staging redeploys do not add duplicate secret versions', () => {
  assert.match(workflow, /gcloud secrets versions access latest[\s\S]*cmp -s - "\$current_value"[\s\S]*gcloud secrets versions add/);
  assert.match(workflow, /refusing to add another secret version/);
});
