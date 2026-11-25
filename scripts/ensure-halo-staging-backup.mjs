#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PROJECT_ID = 'halo-skin-uk-stg';
const DATABASE_ID = '(default)';
const LOCATION_ID = 'europe-west2';
const RETENTION_SECONDS = 7 * 24 * 60 * 60;

function runGcloud(args) {
  return execFileSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function retentionSeconds(schedule) {
  const value = schedule.retention ?? schedule.retentionPeriod ?? schedule.retention_period;
  if (typeof value === 'string' && /^\d+s$/.test(value)) return Number(value.slice(0, -1));
  if (value && typeof value === 'object' && /^\d+$/.test(String(value.seconds ?? ''))) return Number(value.seconds);
  return null;
}

function isDaily(schedule) {
  return Boolean(schedule.dailyRecurrence ?? schedule.daily_recurrence);
}

function listSchedules(projectId, run = runGcloud) {
  const output = run([
    'firestore', 'backups', 'schedules', 'list',
    `--database=${DATABASE_ID}`, `--project=${projectId}`, '--format=json'
  ]);
  const schedules = JSON.parse(output || '[]');
  if (!Array.isArray(schedules)) throw new Error('Firestore returned an invalid backup-schedule list.');
  return schedules;
}

function assertDailyRetention(schedules) {
  const daily = schedules.filter(isDaily);
  if (daily.length > 1) throw new Error('More than one daily Firestore backup schedule exists. Review staging manually.');
  if (!daily.length) return false;
  if (retentionSeconds(daily[0]) !== RETENTION_SECONDS) {
    throw new Error('An existing daily backup schedule has a different retention period; refusing to change it automatically.');
  }
  return true;
}

function ensureDailyBackupSchedule({ projectId, run = runGcloud }) {
  if (projectId !== PROJECT_ID) throw new Error(`Refusing backup setup outside ${PROJECT_ID}.`);

  const location = run([
    'firestore', 'databases', 'describe', `--database=${DATABASE_ID}`,
    `--project=${projectId}`, '--format=value(locationId)'
  ]).trim();
  if (location !== LOCATION_ID) throw new Error(`Expected the existing Firestore database in ${LOCATION_ID}; found ${location || 'no location'}.`);

  const schedules = listSchedules(projectId, run);
  if (assertDailyRetention(schedules)) {
    return { status: 'already_configured', projectId, databaseId: DATABASE_ID, retentionSeconds: RETENTION_SECONDS };
  }

  run([
    'firestore', 'backups', 'schedules', 'create', `--database=${DATABASE_ID}`,
    `--project=${projectId}`, '--recurrence=daily', '--retention=7d', '--quiet'
  ]);

  if (!assertDailyRetention(listSchedules(projectId, run))) {
    throw new Error('The daily backup schedule was not visible after creation.');
  }
  return { status: 'created', projectId, databaseId: DATABASE_ID, retentionSeconds: RETENTION_SECONDS };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = ensureDailyBackupSchedule({ projectId: process.env.HALO_STAGING_PROJECT_ID || '' });
    process.stdout.write(`${result.status}: ${result.projectId}/${result.databaseId}, daily, 7-day retention\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export { assertDailyRetention, ensureDailyBackupSchedule, isDaily, listSchedules, retentionSeconds };
