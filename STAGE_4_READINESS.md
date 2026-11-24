# HALO Stage 4 evidence and remaining gates

## Latest source verification — 24 November 2026

- Source branch: `codex/halo-stage4`, commit `afa75628e4ee91931dd2481dd45e2494d89736eb`.
- GitHub Actions `HALO checks` for that commit completed successfully: [run 45392713103](https://github.com/Lionoflondon/halo-skin-uk/actions/runs/45392713103).
- The local suite passes 18 tests: 4 fulfilment tests and 14 payment/order tests. These are code-level checks, not hosted payment acceptance.
- Rothcross owns one Stripe account used across CORPVS CHRISTI, HALO and its other brands. HALO checkout stores `halo` brand/store metadata, and refund processing now resolves the order from the matching PaymentIntent metadata instead of relying on charge metadata being copied. The webhook still rejects live-mode events and records only HALO orders in HALO's own `haloOrders` collection.
- Hosted payment, refund and reconciliation acceptance remains incomplete. On the last credential check, the HALO Stripe test key and HALO endpoint signing secret were absent from the GitHub `halo-staging` environment and HALO Secret Manager. Do not deploy the current Functions code until those HALO staging secrets are securely configured.
- The most recent successful hosting probe returned HTTP 200 for the staging storefront and `/admin`. A subsequent probe could not resolve the staging hostname in the local network environment; it does not establish a hosting outage or a new successful probe.

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
