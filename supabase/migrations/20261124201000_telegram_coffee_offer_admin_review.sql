-- Give authenticated MEA BOKO administrators a private review queue
-- for Telegram coffee offers. Telegram webhook continues using service_role.
alter table public.telegram_coffee_offers
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

grant select, update on public.telegram_coffee_offers to authenticated;
revoke all on public.telegram_coffee_offers from anon;

drop policy if exists telegram_coffee_offers_admin_read
  on public.telegram_coffee_offers;
create policy telegram_coffee_offers_admin_read
  on public.telegram_coffee_offers
  for select
  to authenticated
  using ((select private.mea_boko_is_admin()));

drop policy if exists telegram_coffee_offers_admin_update
  on public.telegram_coffee_offers;
create policy telegram_coffee_offers_admin_update
  on public.telegram_coffee_offers
  for update
  to authenticated
  using ((select private.mea_boko_is_admin()))
  with check ((select private.mea_boko_is_admin()));
