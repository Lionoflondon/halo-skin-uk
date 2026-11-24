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
- deleting products;
- importing the four current storefront products into Firestore.

The storefront reads published products from the Firebase `products` collection and safely falls back to its built-in catalogue while the managed collection is empty or unavailable.

Admin writes are protected by `firestore.rules` and restricted to the verified Halo administrator email. Email/password and Google authentication are enabled. To create or change the password without email delivery, sign in with Google, open **Account**, and set the password directly. Google sign-in remains available as a recovery option.

## Delivery methods

- **⚡ Circum Same Day — £4.99:** preview eligibility checks exist, but secure checkout keeps this option disabled until server-side quotes, eligibility and delivery adapters are connected. Live tracking, proof of delivery and delivery notifications are not yet verified end to end.
- **📦 Standard Delivery — £2.99:** nationwide Halo standard fulfilment.

`delivery-config.js` defines the Halo-only endpoints. The checkout functions in `functions/` use Rothcross Stripe **test mode only**, require the expected Rothcross Stripe account ID, price products from the published Firestore catalogue, and persist separate `haloOrders`. Signed test webhooks confirm test payments and record refunds. Provision `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ROTHCROSS_STRIPE_ACCOUNT_ID`, `HALO_SITE_URL`, and allowed storefront origins in an isolated HALO staging project before using this flow. The browser never asserts payment success or supplies authoritative prices. The test payment endpoint currently accepts standard delivery only. Circum remains disabled at secure checkout until server-side eligibility and delivery adapters are configured. Paid orders are recorded as `status: paid` and `paymentStatus: paid`; dispatch remains a separate admin-managed step.

Until the production Circum service-area endpoint is configured, the local preview resolves the entered postcode through `postcodes.io`, checks its returned region, and validates the entered city against the returned locality. No postcode list is hardcoded.

For a paid Circum order, the handler resolves the active Halo warehouse, creates a warehouse-to-customer Circum delivery, stores the Circum Delivery ID first, broadcasts the request to riders, and moves the order to **Awaiting Rider**. Rider assignment, collection, out-for-delivery and delivered updates are applied through `applyCircumStatusUpdate`.

Run validation with `npm test`.

## Add supplied images

The supplied campaign imagery is stored in `assets/`. Replace the image paths in `index.html` or the product records in `app.js` to update photography without changing the layout.

## Production blockers

- Payment code is implemented for test mode, but has not been deployed or exercised against an isolated Stripe test account. No live mode is supported.
- Test-only refund initiation and webhook recording are implemented locally, but not hosted-tested. Full provider reconciliation and a financial exception workflow are not implemented.
- The fulfilment helper is adapter based; no standard dispatch adapter, Circum server-side eligibility integration or payment-to-dispatch recovery worker is wired into the checkout functions.
- The production Circum service-area endpoint is blank; the postcode lookup fallback is preview-only. Circum credentials, delivery status webhook verification and operational retry/reconciliation are not configured here.
- Admin order and refund endpoints require recent Firebase MFA claims and the verified allowlisted email; HALO TOTP enrollment/claim behavior is unverified. Independent role management and credential rotation are not implemented.
- Firestore rules protect the product catalogue. No backup schedule, restore evidence, monitoring/alerting, budget alerts, incident runbook or recovery objective is defined in this repository.
- Hosting has no automated staging/release workflow, preview environment, rollback procedure, custom domain verification or deployment evidence in this repository.
- Legal pages, delivery/returns policy, functioning newsletter processing, and analytics/cookie consent are not complete.

These gaps must be closed and verified in an isolated staging project before any live payment activation or production deployment.
