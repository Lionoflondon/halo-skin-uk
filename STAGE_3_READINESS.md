# HALO Stage 3 — Hosted staging and production readiness

Review date: 20 November 2026. This report records the work completed in this workspace and the hosted evidence available today. It does not certify a production release.

## Hosted infrastructure

- Read-only Firebase project inventory previously showed `halo-skin-uk` as HALO's current project and no isolated HALO staging project. HALO's `.firebaserc` still defaults to `halo-skin-uk`.
- In the authenticated Google Cloud console, the ROTH development project showed the billing account named **Firebase Payment** linked. The billing account's **Budgets and caps** page was reachable and displayed existing ROTH/CIRCUM budgets. This confirms the account association shown for ROTH, not that HALO has been linked or that the signed-in user is its billing-account owner.
- The console browser session timed out before project creation or budget changes. The local `gcloud` profile is authenticated, but API calls failed because Cloud Resource Manager DNS could not resolve. No project, budget, API, billing link, Firestore database, secret or deployment was created or changed.
- The requested £5/£8/£10 monthly alerts are not configured. Alerts are notifications, not a guaranteed spending cap. The £10 allocation is the user's stated ceiling; project-level restrictions and billing-account scope still need to be applied and verified.
- No HALO staging URL exists yet. The only previously observed hosted URL is the existing production Hosting URL `https://halo-skin-uk.web.app`; it was not changed or deployed to.

## Independent local work

- Added [UK skincare compliance register](SKINCARE_COMPLIANCE_REGISTER.md) for all four current storefront products. Every evidence field is explicitly marked not supplied and every product is on hold; no compliance evidence was fabricated.
- Added GitHub Actions checks for pull requests and pushes to `main`.
- Added a manual deployment workflow gated on the `halo-staging` GitHub environment, workload identity, explicit staging project ID, and staging Firebase web configuration. It refuses the production project. GitHub environment reviewer protection and the cloud identity provider/service account have not been configured or verified; therefore this workflow is a guarded scaffold, not an available release pipeline.
- Retained the local test-only Stripe checkout, account-ID verification, separate HALO order/event collections, admin endpoints and order/refund reducers documented in Stage 2. Same-day CIRCUM delivery remains disabled.
- No commit was created. The `main` worktree contains pre-existing uncommitted storefront/artwork changes mixed with this work; they were preserved and not staged or pushed.

## Verification

- `npm test`: 4 fulfilment tests and 11 payment/order tests passed.
- JavaScript syntax checks, `firebase.json` parsing and `git diff --check` passed in the previous Stage 2 verification; the current added workflow YAML has not been run by GitHub Actions.
- The functions dependency lockfile could not be generated offline because the npm registry package was not cached. The workflows currently install the declared semver ranges; pinning and reviewing a committed lockfile remains required before protected release use.
- No hosted payment or refund, authentication/MFA, ROTH, CIRCUM, inventory, notification, backup/restore, accessibility or release rollback test has been completed. No Stripe test payment was created in this turn, so there is no payment fee, refund or settlement reconciliation to report.

## Production launch requirements still open

1. Confirm the Firebase Payment account owner authorizes HALO staging and confirm its actual spend-cap options. Create the isolated HALO project, link it to that account, configure the £5/£8/£10 alerts and regional, scaling, API and security controls. Preserve `halo-skin-uk`.
2. Configure HALO's test-only Rothcross Stripe secret and webhook secret in Secret Manager; verify the expected Stripe account identity and test mode; run hosted success, decline, abandonment, cancellation, refund, duplicate and cross-brand event tests.
3. Implement and reconcile separate HALO revenue, processing fee, refund, inventory, settlement and Rothcross oversight records against actual Stripe test balance transactions.
4. Register HALO as a ROTH merchant and obtain approved merchant/customer identity, staging origin, App Check/token, issuance, redemption, recovery, funding and refund policies. Replace the synthetic harness with hosted acceptance.
5. Obtain CIRCUM's actual staging quotation and eligibility contract, credentials, dispatch/tracking callbacks and retry rules. Enable same-day checkout only after server-side verification.
6. Finish customer account authentication and order history, email notifications, stock reservation/adjustment ledger and secure admin roles/MFA; verify cancellation and refund policy handling.
7. Configure project monitoring and alert routing, a backup schedule with restore proof, least-privilege identities, dependency controls, GitHub environment reviewers/branch protection, and a rollback procedure.
8. Complete keyboard/screen-reader accessibility review and hosted end-to-end acceptance.
9. Supply and review the skincare safety assessments, Responsible Person details, Product Information Files, ingredients, final labels, OPSS notifications, claims substantiation and batch traceability listed in [the compliance register](SKINCARE_COMPLIANCE_REGISTER.md). Products remain on hold until evidence is reviewed and approved.

No live Stripe payments, real customer balances or production deployment were activated.
