# HALO Skin UK production readiness review

Historical review: 20 November 2026. For current implementation, infrastructure, hosted probes and launch gates, see [Stage 4 readiness evidence](STAGE_4_READINESS.md). The status observations below are a dated baseline and must not be treated as current. Scope is the retail skincare storefront described by this repository, not the separate synthetic HALO merchant harness in ROTH.

## Product behavior established by the repository

- Sell the four configured lip treatment/tint/set products through a web storefront.
- Let an administrator maintain the published product catalogue.
- Offer UK standard fulfilment and eligible Circum same-day delivery at the displayed prices.
- For Circum delivery, create the warehouse-to-customer delivery only after payment has been confirmed; show tracking/status updates.

The requested HALO scope includes ROTH wallet linking, checkout redemption, and independent promotional and purchase reward issuance. The repository does not yet contain the HALO merchant identity, staging credentials, customer identity bridge, or approved issuance/refund policy needed to implement or validate those flows. No stored-value or ROTH behavior is inferred beyond the explicit request.

## Changes made in this review

- Removed the browser helper that accepted a caller-supplied `payment.status === "succeeded"` and posted it to a payment-success endpoint. A browser assertion cannot prove a settled provider payment.
- Added a HALO-owned Firebase Functions checkout/webhook path using the Rothcross Stripe account in test mode only. It prices against published catalogue records, records orders under `haloOrders`, verifies signed test webhooks, checks the configured Stripe account ID, rejects live-mode keys/events, and marks the payment with a HALO-specific statement descriptor suffix.
- Connected the storefront checkout to the server-created hosted Stripe session. The browser sends only item identifiers, quantities, email and delivery method; the server chooses prices.
- Added a tested order/payment state reducer for successful, failed, abandoned, duplicate and partial/full refund events, plus an order lifecycle transition guard. Added MFA-gated admin order listing/status/refund endpoints and a non-PII checkout status endpoint.
- Kept Circum Same Day disabled at secure checkout until server-side service-area verification and approved delivery adapters are connected. Test-paid orders start at `status: paid`; fulfilment must then move through explicit admin lifecycle actions.
- Updated the README to describe the actual integration boundary and evidence-backed production blockers.
- Preserved pre-existing storefront artwork/configuration edits and all ROTH repository changes.

## Evidence and blockers

| Area | Repository evidence | Readiness |
| --- | --- | --- |
| Catalogue and admin | Firebase Auth UI; verified-email allowlist; Firestore rules protect `products` writes; new order/refund endpoints check recent MFA claims | Partial. MFA enrollment/claims unverified; no independent role lifecycle. |
| Checkout/payments | New `functions/createCheckoutSession` uses test-only Stripe key checks and expected-account verification | Code and unit logic only. Requires Rothcross test secret provisioning and isolated Firebase staging deployment/provider test. |
| Orders/refunds | Separate `haloOrders`; signed test webhooks; admin refund/status endpoints; order/payment reducers | Partial. No hosted evidence, notification sender, stock ledger, full reconciliation, or payment exception workflow. |
| ROTH | Only ROTH-side `haloStagingHarness` exists in another repo; no HALO merchant identity/credentials/customer-link integration | Blocked pending merchant setup and reward/refund policies. |
| Fulfilment | Adapter-only helper and unit tests; Circum endpoint is empty; standard adapter not supplied | Partial/local only. No hosted end-to-end evidence. |
| Monitoring/recovery | No monitoring, alert policy, backup schedule, restore evidence, incident runbook, or RTO/RPO | Blocked. |
| Release | Firebase Hosting config exists, but no staging project declaration, CI release workflow, rollback record, or current deployment evidence | Blocked. |
| Customer/legal operations | No customer account/order history or final label/PIF/OPSS evidence; legal, delivery/returns pages and newsletter/consent work incomplete | Blocked for public launch. |

## Required next inputs and work

1. Approve a monthly staging cost ceiling and billing account, then provision Rothcross Stripe **test-mode** secret and webhook secret in an isolated HALO staging project, plus the expected Stripe account ID and allowed staging origin. Exercise hosted Checkout, webhook retries, refunds and reconciliation there.
2. Provide the approved CIRCUM staging integration contract, scoped credentials, warehouse details, eligibility/quotation rules, and retry/status webhook rules.
3. Provide HALO's ROTH staging merchant identity/credential, customer linking contract, and approved promotional/purchase issuance, refund, redemption and settlement-attribution rules. Replace the synthetic harness with actual HALO staging acceptance.
4. Decide the required admin MFA and access model; provision and verify it in staging.
5. Define backup/restore objectives, monitoring and alert owners, release/rollback gates, public policies, and legal approval.
6. Run hosted staging checkout, fulfilment, refund, reconciliation, backup-restore and release rollback exercises. Preserve evidence before considering production approval.

No Stripe credentials were copied, no live payments were activated, no production deployment was made, and no hosted service was changed in this review. The current Firebase alias still points to `halo-skin-uk`, so do not deploy this configuration until a separate staging Firebase project is provisioned and selected explicitly.
