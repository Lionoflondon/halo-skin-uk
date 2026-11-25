'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

test('core HALO Functions load without ROTH settings and ROTH endpoints appear as a complete set', () => {
  const functionsDir = path.join(__dirname, '..');
  const probe = "const f=require('./index'); console.log(JSON.stringify({checkout:!!f.createCheckoutSession,customer:!!f.customerOrders,rothWallet:!!f.rothWallet,rothRewards:!!f.rothIssueReward,rothSettlements:!!f.rothSettlements}))";
  const baseEnv = { ...process.env, GCLOUD_PROJECT: 'halo-skin-uk-stg' };
  delete baseEnv.HALO_ROTH_API_ORIGIN;
  delete baseEnv.HALO_ROTH_MERCHANT_KEY_ID;
  delete baseEnv.HALO_ROTH_BUSINESS_ID;
  const core = JSON.parse(execFileSync(process.execPath, ['-e', probe], { cwd: functionsDir, env: baseEnv, encoding: 'utf8' }));
  assert.deepEqual(core, { checkout: true, customer: true, rothWallet: false, rothRewards: false, rothSettlements: false });
  const rothEnv = { ...baseEnv, HALO_ROTH_API_ORIGIN: 'https://roth.example', HALO_ROTH_MERCHANT_KEY_ID: 'halo-stage-key', HALO_ROTH_BUSINESS_ID: 'halo-merchant' };
  const enabled = JSON.parse(execFileSync(process.execPath, ['-e', probe], { cwd: functionsDir, env: rothEnv, encoding: 'utf8' }));
  assert.deepEqual(enabled, { checkout: true, customer: true, rothWallet: true, rothRewards: true, rothSettlements: true });
});

test('HALO staging redeploys do not add duplicate secret versions', () => {
  assert.match(workflow, /gcloud secrets versions access latest[\s\S]*cmp -s - "\$current_value"[\s\S]*gcloud secrets versions add/);
  assert.match(workflow, /refusing to add another secret version/);
});
