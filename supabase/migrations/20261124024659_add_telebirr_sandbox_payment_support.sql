alter table public.payment_transactions
  drop constraint if exists payment_transactions_provider_check;

alter table public.payment_transactions
  add constraint payment_transactions_provider_check
  check (provider in ('chapa', 'telebirr'));

alter table public.payment_transactions
  add column if not exists provider_reference text,
  add column if not exists provider_transaction_id text;

create unique index if not exists payment_transactions_telebirr_provider_reference_unique
  on public.payment_transactions (provider_reference)
  where provider = 'telebirr' and provider_reference is not null;

create unique index if not exists payment_transactions_telebirr_transaction_id_unique
  on public.payment_transactions (provider_transaction_id)
  where provider = 'telebirr' and provider_transaction_id is not null;

create unique index if not exists order_payment_records_telebirr_reference_unique
  on public.order_payment_records (payment_reference)
  where payment_method = 'telebirr' and payment_reference is not null;
