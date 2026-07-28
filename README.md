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

- **⚡ Circum Same Day — £4.99:** available only when the configured service-area checker confirms the address. Includes live tracking, proof of delivery and delivery notifications.
- **📦 Standard Delivery — £2.99:** nationwide Halo standard fulfilment.

`delivery-config.js` defines the Halo-only public endpoints. The service-area endpoint must return `{ "eligible": true|false }`; postcode coverage is owned by that service and is not hardcoded in the storefront. The payment-success endpoint must invoke `fulfilPaidHaloOrder` from `server/halo-fulfilment.mjs` using the approved Halo Circum, standard-fulfilment, order-store and notification adapters. Circum creation is rejected unless payment is verified as `succeeded`.

Until the production Circum service-area endpoint is configured, the local preview resolves the entered postcode through `postcodes.io`, checks its returned region, and validates the entered city against the returned locality. No postcode list is hardcoded.

For a paid Circum order, the handler resolves the active Halo warehouse, creates a warehouse-to-customer Circum delivery, stores the Circum Delivery ID first, broadcasts the request to riders, and moves the order to **Awaiting Rider**. Rider assignment, collection, out-for-delivery and delivered updates are applied through `applyCircumStatusUpdate`.

Run validation with `npm test`.

## Add supplied images

The supplied campaign imagery is stored in `assets/`. Replace the image paths in `index.html` or the product records in `app.js` to update photography without changing the layout.

## Production checklist

- Point `haloskinuk.com` at the chosen static host.
- Add legal pages, delivery policy and returns policy links.
- Connect the newsletter form to your preferred mailing platform.
- Add analytics and cookie consent for the chosen stack.
- Connect a payment provider and order-processing backend before accepting live orders.
