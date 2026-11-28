# HALO Stage 2 — Hosted Financial and Operational Readiness

Review date: 20 November 2026. Scope: local HALO Skin UK implementation plus read-only cloud inventory attempts. No cloud resource was created or changed.

## Current project and safety boundary

- Firebase project listing contains `halo-skin-uk` (active) and no HALO staging project.
- HALO's `.firebaserc` still selects `halo-skin-uk`; its existing default Hosting site is `https://halo-skin-uk.web.app`.
- ROTH development (`roth-wallet-v1-dev`) and CORPVS staging (`corpus-christi-stg`) exist, but neither is a HALO-isolated Firebase project. They were not reused.
- HALO project Functions listing failed. Firestore location, project billing attachment, enabled APIs, Secret Manager state and current resource inventory could not be read: gcloud's default profile could not write its protected local state; the isolated existing profile then encountered unavailable network/DNS for Google Cloud APIs. A Secret Manager list attempt reported the API disabled and was not enabled.
- No production service, billing link, API, secret, database or deployment was modified.

## Cost estimate before staging creation

This is a low-traffic, scale-to-zero estimate, not a guaranteed bill or a hard spending limit. Assumptions: one default Firestore database in London, Firebase Hosting, two functions with zero minimum instances, two secret versions, test-only traffic below free quotas, no SMS authentication, backups, monitoring retention uplift, or third-party delivery charges. Some Google free quotas are aggregated across projects under the same billing account, and the current account consumption could not be inspected.

| Service | Indicative no-cost allowance / rate beyond allowance | Low-traffic estimate |
| --- | --- | --- |
| Hosting | 10 GB storage and 360 MB/day transfer shown in Firebase pricing; beyond the applicable free quota, hosting transfer/storage are metered | Approximately $0/month within allowance |
| Firestore Standard | 1 GiB, 50K reads/day, 20K writes/day, 20K deletes/day and 10 GiB egress; London standard rates beyond quota: $0.03/100K reads, $0.09/100K writes, $0.01/100K deletes; backup/PITR/restore have no free quota | Approximately $0/month for synthetic checkout tests below free quotas, excluding backup/restore |
| Cloud Functions | 2M invocations/month, 400K GB-seconds, 200K CPU-seconds, 5 GB outbound and 120 Cloud Build minutes/day listed as no-cost allowances; functions require Blaze billing | Approximately $0/month if requests stay within quota and no billable add-ons/minimum instances are enabled |
| Secret Manager | 6 active secret versions and 10K accesses/month free per billing account; above that, $0.000082192/version-hour and $0.03/10K accesses | Approximately $0 incremental if account allowance remains; additional version is about $0.06 per 30-day month |

At this scope, the best estimate is **about $0/month under free quotas**, with variable usage-based charges above them. A normal budget alert is not a cap. Google currently documents spend-cap budgets for eligible services, but those pause selected services when the threshold is reached and can interrupt checkout; their availability and scope must be verified before use. There is no approved HALO monthly ceiling or verified billing-account selection in the evidence. Therefore the staging project, Blaze attachment, backups and other billable resources remain uncreated pending the owner's cost approval and billing selection.

Pricing sources: [Firebase pricing](https://firebase.google.com/pricing), [Firestore London pricing and free quota](https://cloud.google.com/firestore/pricing?hl=en), [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing), [Google Cloud budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets), [spend-cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).

## Local implementation completed

- HALO server-side Stripe Checkout, signed test-only webhook handling, expected Rothcross Stripe account-ID verification, separate `haloOrders`/`haloStripeEvents`, HALO metadata and statement suffix.
- Product prices are loaded from the published Firestore catalogue; browser prices are ignored.
- Successful, failed, abandoned, duplicate and refund event domain handling has local tests. Payment state is separate from fulfilment state.
- Admin order listing/status/refund endpoints require a verified allowlisted email, a recent token and a second-factor claim. State changes are audited. Refund amounts are capped against the order total and Stripe idempotency is used.
- A checkout return status endpoint checks the Stripe session and HALO order without returning customer PII.
- Circum stays disabled at checkout pending an authoritative server-side service-area and quotation contract.

## Remaining gates and blockers

### Cloud and Stripe

- Need an isolated HALO Firebase project in `europe-west2` where available; the project ID and Rothcross billing account have not been selected/approved.
- Need staging Firebase app/auth/Firestore/Hosting and Functions deployment, Firestore region confirmation, Secret Manager API enablement, least-privilege runtime identity, and project budget/spend control.
- Provision HALO-only references to the Rothcross **test** secret key and webhook secret in that staging project's Secret Manager. The code also requires the exact expected Rothcross Stripe account ID. No Stripe credentials have been copied or read.
- Hosted tests for success, decline, abandoned checkout, retry, duplicate webhook, refund and cross-brand event isolation remain unrun.
- Stripe refund initiation is implemented in code but has not been exercised. Refund liability, order cancellation and consumer refund operations need an approved policy and hosted evidence.

### Orders and fulfilment

- Local state machine supports pending payment → paid → processing → dispatched → delivered and refuses skipped states. Admin endpoint requires a tracking URL to mark dispatch. No hosted state lifecycle has been tested.
- Current catalogue has only an `available` boolean, not stock quantities or inventory ledger. Do not automatically restore stock on a cancellation/refund until returns/restock policy and inventory source are defined.
- Customer notification delivery is not wired. Order changes and Stripe events have audit records, but no approved email/SMS provider, templates, sender domain or delivery credentials are configured.
- Customer authentication and order history remain unimplemented. Checkout is currently guest email + shipping address collected by Stripe. Account linking, recovery, privacy and order ownership rules need product decisions.
- Standard fulfilment dispatch is not connected to the checkout backend. Paid orders remain recorded until an authorised admin moves them through processing and dispatch.

### CIRCUM

- HALO has no verified CIRCUM quotation or eligibility endpoint, production contract, scoped credential, webhook signature rule, or retry policy in this repository.
- The existing Circum adapter helper is synthetic/unit tested only. Same-day checkout is disabled; do not collect its fee until a CIRCUM quote and server-side eligibility check have been accepted in staging.
- Delivery settlement and service charges must remain separately attributed to HALO and CIRCUM. The quote schema and reconciliation source need agreement before implementation.

### ROTH

- ROTH's SDK has a generic company integration contract; the current HALO helper is explicitly `mode: synthetic_harness`. There is no verified HALO merchant ID/key, staging origin, customer-link UX, App Check/customer-token provider or approved issuance categories/limits here.
- A real integration requires an authorised ROTH merchant credential, identity mapping, reward policy (promotional versus purchase reward), refund/settlement attribution decisions, and actual HALO staging calls. None has been fabricated or called.

### Legal, security and readiness

- The repository has no ingredient lists, final packaging-label images, UK Responsible Person record, Product Information File, safety assessment, OPSS product notification evidence, batch/lot/expiry traceability, or substantiation for product claims. These cannot be certified from marketing images. See official [Great Britain cosmetics guidance](https://www.gov.uk/guidance/making-cosmetic-products-available-to-consumers-in-great-britain), [consumer cosmetics guidance](https://www.gov.uk/guidance/consumer-products-cosmetics), and [OPSS notification guidance](https://www.gov.uk/guidance/submit-a-cosmetic-product-notification).
- The website has no working delivery/returns/legal pages. Its checkout button and cancellation/refund disclosure need review against current [distance-selling return rules](https://www.gov.uk/accepting-returns-and-giving-refunds) and [Consumer Contracts Regulations](https://www.legislation.gov.uk/uksi/2013/3134/regulation/14/made).
- MFA enforcement is in the admin backend, but HALO Identity Platform TOTP enrollment/claim behavior has not been verified. Admin actions will fail closed until tested.
- Backup schedule/restore test, monitoring alerts, incident procedure, log retention/privacy, release rollback, screen-reader/keyboard audit and hosted accessibility review remain incomplete.

## Verification

- `npm test`: 4 fulfilment tests and 11 payment/order core tests pass.
- JavaScript syntax checks, `firebase.json` JSON parsing and `git diff --check` pass.
- These are local tests only. Stripe API integration, Firebase emulator, hosted staging, real identity/MFA, CIRCUM, ROTH, customer purchase history, dispatch and restore have not been tested.
