# MEA BOKO Coffee Ethiopia

MEA BOKO is an Ethiopian coffee marketplace connecting producers, suppliers, cooperatives, brokers, exporters, roasters and buyers for domestic and international trade.

## Application

- React 18 and Vite
- Supabase Auth, Postgres and Storage
- Ethiopian coffee-origin hierarchy and catalogue
- Buyer and supplier accounts
- Supplier applications and administrator review
- Coffee listings with product photos
- Domestic and export marketplace filters
- Inquiries, order requests, pricing discussions, shipment details and trade documents
- Admin review and audit workflows

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Set these browser-safe environment variables in `.env`:

```env
VITE_SUPABASE_URL=https://mccgqmiatxzrcqczazpm.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

Never use a Supabase `service_role` key or secret key in frontend code, GitHub Pages build variables, or any variable prefixed with `VITE_`.

## Database and storage

The current frontend uses the `coffee_listings`, `origins`, `supplier_applications`, `verified_suppliers`, `profiles`, buyer, order, shipment, document and audit tables. The live Supabase project has its own applied migration history; the short legacy SQL example that previously appeared in this README was incomplete and must not be used as the current production schema.

Supplier product photos use the `coffee-product-photos` Storage bucket. It is configured for JPG, PNG and WEBP files up to 5 MB. Keep Row Level Security enabled and retain the approved-supplier upload restrictions.

For database changes, use reviewed, version-controlled Supabase migrations. Do not paste an old schema over the live database.

## Deploy

The site is configured for GitHub Pages:

https://meaboko92.github.io/COFDEE-MARKET-ETHIOPIA-/

GitHub Actions runs the build and deploy workflows on pushes to `main`. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the deployment configuration.

A successful Vite build confirms that the frontend compiles; it does not by itself prove that sign-in, RLS policies, database writes, administrator permissions or photo uploads work. Test those flows with separate buyer, supplier and administrator accounts before opening the marketplace to the public.
