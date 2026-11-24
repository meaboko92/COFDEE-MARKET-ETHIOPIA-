-- MEA BOKO Telegram local coffee offers for domestic and export markets.
-- Safe to run on an existing project: the production table may already exist.
create table if not exists public.telegram_coffee_offers (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id text not null,
  contact_name text not null,
  contact_phone text,
  business_name text,
  coffee_name text not null,
  origin text not null,
  process text not null check (process in ('washed', 'natural', 'honey', 'other')),
  grade text,
  quantity_kg numeric not null check (quantity_kg > 0),
  market text not null check (market in ('domestic', 'export', 'both')),
  asking_price numeric check (asking_price is null or asking_price > 0),
  currency text not null default 'ETB' check (currency in ('ETB', 'USD', 'EUR')),
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_coffee_offers_status_market_created_idx
  on public.telegram_coffee_offers (status, market, created_at desc);

alter table public.telegram_coffee_offers enable row level security;

drop policy if exists "service role manages telegram coffee offers"
  on public.telegram_coffee_offers;

create policy "service role manages telegram coffee offers"
  on public.telegram_coffee_offers
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.telegram_coffee_offers from anon, authenticated;
