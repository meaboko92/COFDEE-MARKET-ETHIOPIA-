# COFFEE-MARKET-ETHIOPIA-
-- MEA-BOKO COFFEE ETHIOPIA
-- Initial database setup

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  organization text,
  role text not null default 'buyer'
    check (role in ('buyer','supplier','admin')),
  country text,
  created_at timestamptz default now()
);

create table if not exists public.origins (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  region text not null,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.profiles(id),
  origin_id uuid references public.origins(id),
  title text not null,
  coffee_type text not null default 'green',
  processing_method text,
  grade text,
  quantity_kg numeric(12,2),
  market text default 'both',
  status text not null default 'draft',
  created_at timestamptz default now()
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles(id),
  listing_id uuid references public.listings(id),
  contact_name text not null,
  contact_email text not null,
  message text not null,
  status text default 'new',
  created_at timestamptz default now()
);

create table if not exists public.shipment_tracking (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references public.inquiries(id),
  reference_code text unique not null,
  status text default 'pending',
  origin_location text,
  destination_location text,
  created_at timestamptz default now()
);

-- Ethiopian coffee origins

insert into public.origins (name, region, description)
values
('Guji', 'Oromia', 'Guji Ethiopian specialty coffee'),
('Sidama', 'Sidama', 'Sidama washed and natural coffee'),
('Yirgacheffe', 'South Ethiopia', 'Yirgacheffe specialty coffee'),
('Limu', 'Oromia', 'Limu Ethiopian coffee'),
('Harar', 'Eastern Ethiopia', 'Harar traditional coffee')
on conflict (name) do nothing;

-- Enable database security

alter table public.profiles enable row level security;
alter table public.origins enable row level security;
alter table public.listings enable row level security;
alter table public.inquiries enable row level security;
alter table public.shipment_tracking enable row level security;

-- Public users can view coffee origins

drop policy if exists "Public can view origins"
on public.origins;

create policy "Public can view origins"
on public.origins
for select
to anon, authenticated
using (true);

-- Public users can view published listings

drop policy if exists "Public can view published listings"
on public.listings;

create policy "Public can view published listings"
on public.listings
for select
to anon, authenticated
using (status = 'published');
