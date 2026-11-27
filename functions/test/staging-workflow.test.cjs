'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy-staging.yml'), 'utf8');
const backupWorkflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/backup-staging.yml'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '../../README.md'), 'utf8');
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../firebase.json'), 'utf8'));
const firestoreIndexes = JSON.parse(fs.readFileSync(path.join(__dirname, '../../firestore.indexes.json'), 'utf8'));

test('readiness documentation distinguishes manual staging workflows from production release gates', () => {
  assert.match(readme, /manually dispatched staging workflows[\s\S]*There is no production release workflow/);
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.match(backupWorkflow, /^on:\n  workflow_dispatch:/m);
});

test('HALO deployment stays manual, serialized and behind the staging environment gate', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n    inputs:\n      scope:/m);
  assert.match(workflow, /options:\n          - hosting-only\n          - full-staging\n        default: hosting-only/);
  assert.match(workflow, /group: halo-staging-deploy\n  cancel-in-progress: false/);
  assert.match(workflow, /environment: halo-staging/);
  assert.match(workflow, /test "\$PROJECT_ID" != "halo-skin-uk"[\s\S]*test "\$PROJECT_ID" = "halo-skin-uk-stg"/);
  assert.match(workflow, /DEPLOY_SCOPE" == "hosting-only"[\s\S]*firebase-tools@[^\s]+ deploy --only hosting --project "\$PROJECT_ID"/);
  assert.match(workflow, /DEPLOY_SCOPE" == "full-staging"[\s\S]*firebase-tools@[^\s]+ deploy --only hosting,functions,firestore:rules,firestore:indexes,auth --project "\$PROJECT_ID"/);
  assert.match(workflow, /if: \$\{\{ inputs\.scope == 'full-staging' \}\}/);
});

test('pending financial reconciliation is routed to its protected staging Function', () => {
  const rewrite = firebaseConfig.hosting.rewrites.find(item => item.source === '/api/adminReconcilePendingFinancialEntries');
  assert.deepEqual(rewrite?.function, { functionId: 'adminReconcilePendingFinancialEntries', region: 'europe-west2' });
  const functions = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '../../admin.js'), 'utf8');
  assert.match(functions, /exports\.adminReconcilePendingFinancialEntries = onRequest\([\s\S]*requireHaloAdmin\(request\)[\s\S]*stripeClient\(\)/);
  assert.match(functions, /\.where\('brand', '==', 'HALO'\)[\s\S]*\.orderBy\(FieldPath\.documentId\(\)\)[\s\S]*startAfter\(cursor\)/);
  assert.match(functions, /nextCursor: snapshot\.size === batchSize/);
  assert.match(admin, /fetch\('\/api\/adminReconcilePendingFinancialEntries'[\s\S]*method: 'POST'[\s\S]*limit: 10[\s\S]*financialReconciliationCursor/);
  const ledgerIndex = firestoreIndexes.indexes.find(index => index.collectionGroup === 'haloFinancialEntries');
  assert.deepEqual(ledgerIndex?.fields.map(field => field.fieldPath), ['brand', 'store', 'reconciliationStatus', 'stripeAccountId', '__name__']);
});

test('HALO Admin cancellation expires and verifies unpaid staging Checkout Sessions before releasing stock', () => {
  const functions = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  assert.match(functions, /exports\.updateHaloOrder = onRequest\([\s\S]*secrets: \[stripeSecret,/);
  assert.match(functions, /stripe\.checkout\.sessions\.retrieve\(initialOrder\.stripeSessionId\)[\s\S]*stripe\.checkout\.sessions\.expire\(initialOrder\.stripeSessionId\)[\s\S]*validatePendingCheckoutCancellation/);
  assert.match(functions, /verifiedPaymentReleased[\s\S]*releaseReservedInventory\(transaction, orderRef[\s\S]*'admin_cancelled'/);
  assert.match(functions, /paymentProvider === 'roth'[\s\S]*roth\.reserve[\s\S]*roth\.cancel[\s\S]*reservation_cancelled/);
  const core = fs.readFileSync(path.join(__dirname, '../halo-order-core.js'), 'utf8');
  assert.match(core, /session\.livemode !== false[\s\S]*session\.status !== 'expired'[\s\S]*session\.payment_status === 'paid'[\s\S]*metadata\?\.store !== 'halo'/);
});

test('checkout status reconciliation persists a paid test session and commits inventory idempotently', () => {
  const functions = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const endpoint = functions.slice(functions.indexOf('exports.getCheckoutStatus ='), functions.indexOf('exports.stripeWebhook ='));
  assert.match(endpoint, /session\.payment_status === 'paid'[\s\S]*checkout_paid_status_\$\{session\.id\}[\s\S]*db\.runTransaction/);
  assert.match(endpoint, /stripeEventOrderUpdate\(current, statusCheckEvent\)[\s\S]*update\.status === 'paid'[\s\S]*commitReservedInventory/);
  assert.match(endpoint, /transaction\.create\(eventRef,[\s\S]*source: 'checkout_status_check'/);
  assert.match(endpoint, /session\.status === 'expired' && \['pending', 'failed'\]/);
  assert.match(endpoint, /paymentStatus: paymentState/);
});

test('hosting-only releases keep payments closed until the full staging configuration passes', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');
  const firebaseConfig = fs.readFileSync(path.join(__dirname, '../../firebase-config.js'), 'utf8');
  assert.match(workflow, /required\.push\('APPCHECK_SITE_KEY'\)/);
  assert.match(workflow, /HALO_HOSTED_CHECKOUT_ENABLED = \$\{JSON\.stringify\(fullStaging\)\}/);
  assert.match(app, /if \(!syntheticStagingSalesEnabled \|\| !endpoint\)/);
  assert.match(firebaseConfig, /window\.HALO_HOSTED_CHECKOUT_ENABLED = false/);
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
  assert.match(workflow, /rothEnabled: fullStaging && rothConfigured/);
});

test('ROTH endpoints are exported only when the three merchant identity settings exist', () => {
  const functions = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  assert.match(functions, /if \(rothApiOrigin\.value\(\) && rothMerchantKeyId\.value\(\) && rothBusinessId\.value\(\)\)\s*\{\s*exports\.rothLinkStart/);
  for (const endpoint of ['createRothOrder', 'requestHaloRothRefund']) assert.match(functions, new RegExp(`exports\\.${endpoint} = onRequest`));
  for (const endpoint of ['/api/createRothOrder', '/api/requestHaloRothRefund']) {
    assert.ok(firebaseConfig.hosting.rewrites.some(item => item.source === endpoint), `${endpoint} Hosting rewrite is required`);
  }
});

test('HALO administrator refunds route through the order original tender and expose its provider', () => {
  const functions = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '../../admin.js'), 'utf8');
  assert.match(functions, /exports\.adminOrders[\s\S]*paymentProvider: order\.paymentProvider \|\| 'stripe'/);
  assert.match(functions, /exports\.updateHaloOrder = onRequest\([\s\S]*rothApiOrigin\.value\(\)[\s\S]*\[rothMerchantSecret\]/);
  assert.match(admin, /data-payment-provider="\$\{escapeHtml\(order\.paymentProvider \|\| 'stripe'\)\}"/);
  assert.match(admin, /refundButton\.dataset\.paymentProvider === 'roth' \? '\/api\/requestHaloRothRefund' : '\/api\/requestHaloRefund'/);
});

test('core HALO Functions load without ROTH settings and ROTH endpoints appear as a complete set', () => {
  const functionsDir = path.join(__dirname, '..');
  const probe = "const f=require('./index'); console.log(JSON.stringify({checkout:!!f.createCheckoutSession,customer:!!f.customerOrders,financialReconcile:!!f.adminReconcilePendingFinancialEntries,rothWallet:!!f.rothWallet,rothRewards:!!f.rothIssueReward,rothSettlements:!!f.rothSettlements,rothCheckout:!!f.createRothOrder,rothRefund:!!f.requestHaloRothRefund}))";
  const baseEnv = { ...process.env, GCLOUD_PROJECT: 'halo-skin-uk-stg' };
  delete baseEnv.HALO_ROTH_API_ORIGIN;
  delete baseEnv.HALO_ROTH_MERCHANT_KEY_ID;
  delete baseEnv.HALO_ROTH_BUSINESS_ID;
  const core = JSON.parse(execFileSync(process.execPath, ['-e', probe], { cwd: functionsDir, env: baseEnv, encoding: 'utf8' }));
  assert.deepEqual(core, { checkout: true, customer: true, financialReconcile: true, rothWallet: false, rothRewards: false, rothSettlements: false, rothCheckout: false, rothRefund: false });
  const rothEnv = { ...baseEnv, HALO_ROTH_API_ORIGIN: 'https://roth.example', HALO_ROTH_MERCHANT_KEY_ID: 'halo-stage-key', HALO_ROTH_BUSINESS_ID: 'halo-merchant' };
  const enabled = JSON.parse(execFileSync(process.execPath, ['-e', probe], { cwd: functionsDir, env: rothEnv, encoding: 'utf8' }));
  assert.deepEqual(enabled, { checkout: true, customer: true, financialReconcile: true, rothWallet: true, rothRewards: true, rothSettlements: true, rothCheckout: true, rothRefund: true });
});

test('HALO staging redeploys do not add duplicate secret versions', () => {
  assert.match(workflow, /gcloud secrets versions access latest[\s\S]*cmp -s - "\$current_value"[\s\S]*gcloud secrets versions add/);
  assert.match(workflow, /refusing to add another secret version/);
});
