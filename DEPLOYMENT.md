# MEA BOKO COFFEE ETHIOPIA — GitHub Pages deployment

## What is configured
- React + Vite build
- Vite base path for this repository's GitHub Pages URL
- GitHub Actions workflows for build verification and GitHub Pages deployment
- Supabase project URL: `https://mccgqmiatxzrcqczazpm.supabase.co`

## Supabase browser key
The frontend requires the Supabase **publishable key** (or legacy anon key) as `VITE_SUPABASE_ANON_KEY`.

For GitHub Actions, open **Settings → Secrets and variables → Actions → Repository secrets** and add:
- Name: `VITE_SUPABASE_ANON_KEY`
- Value: your Supabase publishable key (starts with `sb_publishable_`).

The deployment workflow currently supplies the configured browser-safe publishable key during the build. If you rotate that key, update the workflow or configure it to read the repository secret.

Never put a Supabase `service_role` key or secret key in frontend code, repository files, or build variables prefixed with `VITE_`.

## Enable Pages
Open **Settings → Pages** and choose **GitHub Actions** under Build and deployment.

## Website address
https://meaboko92.github.io/COFDEE-MARKET-ETHIOPIA-/

## Local development
Create a local `.env` file (do not commit it):
```env
VITE_SUPABASE_URL=https://mccgqmiatxzrcqczazpm.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key
```

Then run `npm install` and `npm run dev`.

## Database and storage requirements
The frontend expects the Supabase tables, policies, and storage buckets used by the application to exist. In particular, supplier photo uploads use the `coffee-product-photos` storage bucket. Keep Row Level Security enabled and apply least-privilege policies to every exposed table and bucket.

A successful Vite build does not prove that authentication, database policies, or storage uploads work. Test those features with separate buyer, supplier, and administrator accounts before launch.
