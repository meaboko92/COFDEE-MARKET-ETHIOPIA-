# MEA BOKO COFFEE ETHIOPIA — GitHub Pages deployment

## What is configured
- React + Vite build
- Vite base path for this repository's GitHub Pages URL
- GitHub Actions workflow that builds and deploys the `dist` folder on pushes to `main`
- Supabase project URL is already configured in the deployment workflow

## One required GitHub secret
Open **Settings → Secrets and variables → Actions → Repository secrets** and add:

- Name: `VITE_SUPABASE_ANON_KEY`
- Value: your Supabase **publishable key**, beginning `sb_publishable_`

Do not use or expose the Supabase `service_role` or secret key.

## Enable Pages
Open **Settings → Pages** and choose **GitHub Actions** under Build and deployment.

## Website address
After the workflow succeeds:
https://meaboko92.github.io/COFDEE-MARKET-ETHIOPIA-/

## Local development
Create a local `.env` file (do not commit it):
```env
VITE_SUPABASE_URL=https://synbnzfaddfrtrjibbkd.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key
```

Then run `npm install` and `npm run dev`.

## Security
The browser app must use only the publishable/anon key. Keep Row Level Security enabled and ensure each exposed table has policies matching the intended access. Never place privileged keys in frontend code.
