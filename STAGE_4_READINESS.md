# HALO Stage 4 evidence and remaining gates

## Verified staging infrastructure

- Project: `halo-skin-uk-stg` (309796789447), billing account display name Firebase Payment.
- Hosting: https://halo-skin-uk-stg.web.app/ and /admin returned HTTP 200. The Hosting-only release did not attach checkout rewrites. /api/createCheckoutSession returned HTTP 404.
- Firestore: default Standard Native database in London (`europe-west2`), free tier and deletion protection enabled. Firebase compiled and released the staging-only rules. Point-in-time recovery was disabled when verified.
- Budget: £10 monthly, actual spend alerts at £5, £8 and £10, scoped to project 309796789447. Budget ID `6e0895cf-d131-4dd5-a042-a06befa66c71`. Alert delivery has not been exercised.
- Source: `codex/halo-stage4`. Storefront release source `16a1884`. Regression tests `17f5baf`, 17 local tests passed.

## Checkout acceptance

HALO uses the shared Rothcross Stripe account, which serves CORPVS CHRISTI, HALO and other Rothcross brands. HALO orders, checkout sessions, webhook events and financial reports must each carry an explicit HALO brand/store attribution. Verify that the configured test key belongs to the shared Rothcross account. The webhook secret is scoped to HALO endpoint configuration, not assumed to be a distinct Stripe account credential. Stage only the HALO-specific test key and webhook signing secret in Secret Manager. A hosted acceptance run must record successful, declined, expired, duplicate and cross-brand events plus partial and full refunds. Reconcile gross, fees and refund net using Stripe balance transactions. There is no hosted payment receipt or reconciliation yet.

## Central ROTH acceptance

ROTH's private `@roth/merchant-sdk` source is the contract for the HTTPS/HMAC merchant API. Its current HALO adapter is named `haloStagingHarness` and reports `synthetic_harness`. That result does not establish hosted HALO integration.

HALO needs a pinned SDK distribution usable by its Functions build, the canonical ROTH staging API origin, and HALO's own active company credential and approved issuance allowance. Confirm these in ROTH Operations before writing rewards or reserving value. Resolve wallet identity from authenticated HALO customers and let the customer approve the link in ROTH. Allocation and recovery remain ledger operations. Use stable HALO order or campaign references for reservations and independent issuance. Confirm reservations only against captured tender or a fully eligible ROTH checkout. Reconcile separately identified Stripe refund and ROTH redemption refund movements. Preserve the ROTH receipt and merchant settlement reference on the HALO order.

## Open launch gates

CIRCUM server quotations and eligibility, dispatch and tracking, customer account and order history, notifications, inventory controls, hosted administrator MFA, recovery exercises, monitoring, App Check, accessibility and a protected release with rollback evidence remain open. All four skincare products remain on commercial hold under the compliance register.
