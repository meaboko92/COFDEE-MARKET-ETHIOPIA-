# MEA BOKO — Telebirr Mini App and website

## Shared application

The same React/Vite application is used by the public GitHub Pages website and the Telebirr SuperApp Mini App. The website remains the public fallback and the Mini App is opened inside the Telebirr host after Ethio telecom approves the application.

Website:
https://meaboko92.github.io/COFDEE-MARKET-ETHIOPIA-/

## Mini App registration and packaging

1. An authorized MEA BOKO business representative signs in to the official Ethio telecom Developer Portal:
   https://developer.ethiotelecom.et/user/product
2. Register a Mini App and provide the business information requested by Ethio telecom.
3. Use the portal's current Mini App Development Tour and Macle Developer Toolkit to configure, debug, package and submit the hosted web application.
4. Set the approved website entry URL to the live MEA BOKO site. Confirm the exact URL, domain allow-list, icon, app name and required privacy/contact details with the portal.
5. Test the package in the Telebirr test host. Submit it for review and wait for approval before production publication.

The developer portal describes an existing-web-application-to-Mini-App path and provides a test host and packaging tools.

## Payment architecture

The Telebirr host exposes the Mini App bridge as `window.ma.native("startPay", ...)`. MEA BOKO's frontend helper in `src/lib/telebirr.js` only starts checkout when the host is present and receives a non-empty `rawRequest`.

Important security requirements:
- The browser must never create or sign the Telebirr payment request.
- The authenticated server must create the merchant order and return the exact `rawRequest` only after checking the buyer, order, amount and currency.
- Telebirr payment notifications must be verified server-side before an order is marked paid.
- A Mini App success callback is not sufficient proof of payment; reconcile the transaction with the server/provider.
- Keep all merchant secrets and private signing keys in Supabase Edge Function Secrets, never in React code, GitHub Pages, or `VITE_*` variables.
- Do not collect a Telebirr PIN, password or one-time code in MEA BOKO.

## Current readiness

- Existing MEA BOKO website and Supabase-backed marketplace: present in the repository.
- Telebirr host detection and safe client bridge helper: added.
- Telebirr merchant credentials, server-side create-order/signature/notification verification, database transaction schema, sandbox test and production approval: still required.
- Do not advertise Telebirr as an active checkout method until the complete server-side verification flow has passed sandbox testing and the merchant account has been approved.

The payment transaction table currently restricts its provider field to Chapa. A reviewed database migration is required before Telebirr transactions can be stored. Do not alter the live constraint until the Telebirr backend and notification verification are ready.

## Official references

- Developer Portal: https://developer.ethiotelecom.et/user/product
- Mini App checkout guide: https://developer.ethiotelecom.et/docs/MiniApp%20Integration%20with%20Supper%20APP/%20CheckOut
- H5 C2B payment guide: https://developer.ethiotelecom.et/docs/H5%20C2B%20Web%20Payment%20Integration%20Quick%20Guide/Introduction
