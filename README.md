# Halo Skin UK

A responsive, standalone skincare storefront for `haloskinuk.com`.

## Run locally

Serve this folder with any static server, for example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Commerce behaviour

Products, filtering, search, persistent cart, quantities, discount entry, free-delivery progress and a multi-section checkout experience run directly in Halo. Published product data is loaded from the managed Firebase catalogue, with the original records in `app.js` retained as a resilient fallback.

## Halo Admin catalogue

Open `/admin` to manage products without editing code. The Products section supports:

- adding and editing products;
- image uploads or image URLs;
- prices, categories, badges and storefront order;
- published/draft status;
- available/sold-out status;
- audited physical stock counts, available and reserved quantities;
- deleting products;
- importing the four current storefront products into Firestore.

The storefront reads published products from the Firebase `products` collection and safely falls back to its built-in catalogue while the managed collection is empty or unavailable.

Admin writes are protected by `firestore.rules` and restricted to the verified Halo administrator email. Email/password and Google authentication are enabled. To create or change the password without email delivery, sign in with Google, open **Account**, and set the password directly. Google sign-in remains available as a recovery option.

## Delivery methods

- **⚡ Circum Same Day — £4.99:** preview eligibility checks exist, but secure checkout keeps this option disabled until server-side quotes, eligibility and delivery adapters are connected. Live tracking, proof of delivery and delivery notifications are not yet verified end to end.
- **📦 Standard Delivery — £2.99:** nationwide Halo standard fulfilment.

`delivery-config.js` defines the Halo-only endpoints. The checkout functions in `functions/` use Rothcross Stripe **test mode only**, require the expected Rothcross Stripe account ID, price products from the published Firestore catalogue, and persist separate `haloOrders`. Signed test webhooks confirm test payments and record refunds. Provision `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ROTHCROSS_STRIPE_ACCOUNT_ID`, `HALO_SITE_URL`, and allowed storefront origins in an isolated HALO staging project before using this flow. The browser never asserts payment success or supplies authoritative prices. The test payment endpoint currently accepts standard delivery only. Circum remains disabled at secure checkout until server-side eligibility and delivery adapters are configured. Paid orders are recorded as `status: paid` and `paymentStatus: paid`; dispatch remains a separate admin-managed step.

Checkout requires a physically recorded stock count and reserves units transactionally. A paid webhook commits the reservation; a verified expired Checkout Session releases it. Every count, reservation, sale and release is separately attributed to HALO in `haloInventoryMovements`. A refund does not automatically add units back to stock: inspect returned goods and record a new physical count.

Until the production Circum service-area endpoint is configured, the local preview resolves the entered postcode through `postcodes.io`, checks its returned region, and validates the entered city against the returned locality. No postcode list is hardcoded.

`server/halo-fulfilment.mjs` contains an adapter-based fulfilment prototype with unit tests. It is not imported by the deployed Firebase Functions and is not an active delivery integration. Secure checkout currently rejects every non-standard delivery method; no HALO order is quoted or dispatched through CIRCUM. Enable same-day delivery only after a HALO-specific CIRCUM merchant contract provides server-side eligibility, idempotent dispatch, status callbacks and failure recovery, then verify that flow in isolated staging.

Run validation with `npm test`.

## Add supplied images

The supplied campaign imagery is stored in `assets/`. Replace the image paths in `index.html` or the product records in `app.js` to update photography without changing the layout.

## Production blockers

- Payment code is implemented for test mode, but has not been deployed or exercised against an isolated Stripe test account. No live mode is supported.
- Test-only refund initiation and webhook recording are implemented locally, but not hosted-tested. Full provider reconciliation and a financial exception workflow are not implemented.
- `server/halo-fulfilment.mjs` is an unconnected adapter prototype; no standard dispatch adapter, CIRCUM server-side eligibility integration or payment-to-dispatch recovery worker is wired into the checkout functions. CIRCUM remains HALO's required same-day delivery partner.
- The production Circum service-area endpoint is blank; the postcode lookup fallback is preview-only. Circum credentials, delivery status webhook verification and operational retry/reconciliation are not configured here.
- Admin order and refund endpoints require recent Firebase MFA claims and the verified allowlisted email; HALO TOTP enrollment/claim behavior is unverified. Independent role management and credential rotation are not implemented.
- Firestore rules protect the product catalogue and prevent direct client stock changes. The audited stock-count and checkout reservation paths are source-tested, but not hosted-tested. No backup schedule, restore evidence, monitoring/alerting, incident runbook or recovery objective is defined in this repository.
- GitHub Actions has manually dispatched staging workflows for Hosting-only/full-staging deployment and Firestore backup setup. The full-staging and backup workflows have not completed hosted acceptance. There is no production release workflow, tested rollback procedure, preview-channel acceptance or current custom-domain verification evidence in this repository.
- Legal pages, delivery/returns policy, functioning newsletter processing, and analytics/cookie consent are not complete.

These gaps must be closed and verified in an isolated staging project before any live payment activation or production deployment.
