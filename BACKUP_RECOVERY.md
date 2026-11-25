# HALO staging backup and recovery

## Scope

This procedure is restricted to the existing `halo-skin-uk-stg` default Firestore database in London (`europe-west2`). It does not target `halo-skin-uk` production. Recovery must use a new, uniquely named staging database; do not overwrite the live default database.

## Backup schedule

The manual GitHub Actions workflow `Configure HALO staging Firestore backups` inspects the existing database region and backup schedules, then creates one daily schedule with seven-day retention if none exists. It leaves weekly schedules alone and refuses a daily schedule with unexpected retention. Run it only from the protected `halo-staging` environment after confirming the monthly staging budget remains in force. The workflow is manual and has not been run.

Firestore scheduled backups are billable storage and are not part of the free quota. Google lists backup storage at $0.000041096 per GiB-hour and restore operations at $0.20 per GiB. With a daily schedule retaining seven days, a steady 1 GiB database holds about seven 1 GiB backups: `7 × 730 × $0.000041096 ≈ $0.21/month`, approximately **£0.16/month** at $1 = £0.763477 (24 November 2026 reference). A 10 GiB database would be about **£1.60/month** for backup storage. A 1 GiB restore operation is approximately **£0.15**, before any destination database/storage use. Actual charges scale with Firestore database size; budget alerts monitor spend but do not stop usage. Sources: [Firestore pricing](https://cloud.google.com/firestore/pricing), [Firestore backup and restore](https://cloud.google.com/firestore/native/docs/backups), [backup schedule command](https://cloud.google.com/sdk/gcloud/reference/firestore/backups/schedules/create), [USD/GBP reference](https://theratesapi.com/convert/usd-to-gbp/).

## Restore procedure

1. Confirm the project is `halo-skin-uk-stg`, choose a backup in `europe-west2`, and record the backup resource name and timestamp in the recovery record.
2. Restore to a new database ID such as `halo-restore-YYYYMMDD`; do not use `(default)` as the destination. Firestore restores create a new database.
3. Apply the matching version-controlled Firestore rules and indexes to the restored staging database using a database-specific rules deployment. Verify the deployment target before applying it; do not assume the default-database Firebase target also covers the restored database. Backups do not include Security Rules or TTL policies.
4. Verify the restored database location, document counts, security rules, indexes, and synthetic checkout/admin smoke checks before directing any staging traffic to it.
5. Keep the existing staging default database intact until the owner approves a cutover. Record restore start/end, source backup, destination ID, validation results, and cleanup approval.

No backup schedule, backup, or restored database has been created by this change. A restore drill and evidence record remain required before recovery is considered tested.
