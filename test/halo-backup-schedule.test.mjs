import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertDailyRetention, ensureDailyBackupSchedule } from '../scripts/ensure-halo-staging-backup.mjs';

test('backup workflow is manual, environment-gated and pinned to HALO staging', () => {
  const workflow = readFileSync(new URL('../.github/workflows/backup-staging.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*halo-staging/);
  assert.match(workflow, /test "\$HALO_STAGING_PROJECT_ID" = "halo-skin-uk-stg"/);
  assert.match(workflow, /test "\$HALO_STAGING_PROJECT_ID" != "halo-skin-uk"/);
  assert.match(workflow, /test "\$location" = "europe-west2"/);
});

test('recognizes the configured seven-day daily backup schedule', () => {
  assert.equal(assertDailyRetention([{ dailyRecurrence: {}, retention: '604800s' }]), true);
});

test('does not alter an existing weekly schedule and creates then verifies one daily schedule', () => {
  const calls = [];
  let schedules = [{ weeklyRecurrence: { day: 'MONDAY' }, retention: '604800s' }];
  const run = args => {
    calls.push(args);
    if (args[0] === 'firestore' && args[1] === 'databases') return 'europe-west2\n';
    if (args[3] === 'list') return JSON.stringify(schedules);
    if (args[3] === 'create') {
      schedules = [...schedules, { dailyRecurrence: {}, retention: '604800s' }];
      return '';
    }
    throw new Error(`Unexpected gcloud call: ${args.join(' ')}`);
  };

  const result = ensureDailyBackupSchedule({ projectId: 'halo-skin-uk-stg', run });
  assert.equal(result.status, 'created');
  assert.equal(calls.filter(args => args[3] === 'create').length, 1);
  assert.equal(calls.some(args => args.includes('--recurrence=daily') && args.includes('--retention=7d')), true);
});

test('leaves a matching daily schedule unchanged', () => {
  const calls = [];
  const run = args => {
    calls.push(args);
    if (args[0] === 'firestore' && args[1] === 'databases') return 'europe-west2\n';
    return JSON.stringify([{ dailyRecurrence: {}, retention: '604800s' }]);
  };

  assert.equal(ensureDailyBackupSchedule({ projectId: 'halo-skin-uk-stg', run }).status, 'already_configured');
  assert.equal(calls.some(args => args[3] === 'create'), false);
});

test('refuses any project other than the isolated HALO staging project', () => {
  assert.throws(() => ensureDailyBackupSchedule({ projectId: 'halo-skin-uk', run: () => { throw new Error('must not be called'); } }), /Refusing backup setup/);
});

test('refuses a non-London database and an existing daily schedule with different retention', () => {
  assert.throws(() => ensureDailyBackupSchedule({
    projectId: 'halo-skin-uk-stg', run: () => 'us-central1\n'
  }), /Expected the existing Firestore database in europe-west2/);

  const run = args => {
    if (args[0] === 'firestore' && args[1] === 'databases') return 'europe-west2\n';
    return JSON.stringify([{ dailyRecurrence: {}, retention: '1209600s' }]);
  };
  assert.throws(() => ensureDailyBackupSchedule({ projectId: 'halo-skin-uk-stg', run }), /different retention/);
});
