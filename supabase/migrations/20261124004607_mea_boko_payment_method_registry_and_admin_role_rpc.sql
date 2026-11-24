-- MEA BOKO payment-method registry and administrator role management.
-- This migration is applied to project mccgqmiatxzrcqczazpm.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null unique check (provider_code ~ '^[a-z0-9_]{2,40}$'),
  display_name text not null check (char_length(display_name) between 2 and 100),
  method_type text not null check (method_type in ('bank_transfer','mobile_money','cash','payment_gateway','other')),
  currency text not null default 'ETB' check (currency in ('ETB','USD','EUR')),
  account_name text,
  account_reference text,
  instructions text not null check (char_length(instructions) between 5 and 2000),
  is_active boolean not null default false,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
grant select on public.payment_methods to anon, authenticated;
grant insert, update, delete on public.payment_methods to authenticated;

drop policy if exists payment_methods_active_read on public.payment_methods;
create policy payment_methods_active_read on public.payment_methods
for select to anon, authenticated
using (is_active or (select private.mea_boko_is_admin()));
drop policy if exists payment_methods_admin_insert on public.payment_methods;
create policy payment_methods_admin_insert on public.payment_methods
for insert to authenticated
with check ((select private.mea_boko_is_admin()));
drop policy if exists payment_methods_admin_update on public.payment_methods;
create policy payment_methods_admin_update on public.payment_methods
for update to authenticated
using ((select private.mea_boko_is_admin()))
with check ((select private.mea_boko_is_admin()));
drop policy if exists payment_methods_admin_delete on public.payment_methods;
create policy payment_methods_admin_delete on public.payment_methods
for delete to authenticated
using ((select private.mea_boko_is_admin()));
create index if not exists payment_methods_active_order_idx
on public.payment_methods (is_active, sort_order, display_name);

alter table public.order_payment_records
  alter column status set default 'pending';
update public.order_payment_records set status='pending' where status='submitted';

create or replace function private.mea_boko_protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.role := 'buyer';
    elsif new.role is distinct from old.role
      and not private.mea_boko_is_admin() then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.set_profile_role(target_user_id uuid, target_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  current_target_role text;
  admin_total integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not private.mea_boko_is_admin() then raise exception 'Administrator access required'; end if;
  if target_user_id is null or target_user_id = actor_id then
    raise exception 'Choose another account; administrators cannot change their own role';
  end if;
  if target_role not in ('buyer','admin') then raise exception 'Role must be buyer or admin'; end if;

  select role into current_target_role from public.profiles where id = target_user_id for update;
  if not found then raise exception 'Target account profile not found'; end if;
  if current_target_role = target_role then return; end if;

  if current_target_role = 'admin' and target_role = 'buyer' then
    select count(*) into admin_total from public.profiles where role = 'admin';
    if admin_total <= 1 then raise exception 'The last administrator cannot be removed'; end if;
  end if;

  update public.profiles set role = target_role, updated_at = now() where id = target_user_id;
  insert into public.admin_role_audit (actor_user_id,target_user_id,old_role,new_role,created_at)
  values (actor_id,target_user_id,current_target_role,target_role,now());
end;
$function$;

revoke all on function public.set_profile_role(uuid,text) from public;
revoke all on function public.set_profile_role(uuid,text) from anon;
grant execute on function public.set_profile_role(uuid,text) to authenticated;

-- Keep supplier-review stamps and audit history in the database, not the browser.
create or replace function private.mea_boko_stamp_supplier_review()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $function$
begin
  if new.status is distinct from old.status then
    if auth.uid() is null or not private.mea_boko_is_admin() then
      raise exception 'Only an authenticated MEA BOKO administrator may review supplier applications';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;

create or replace function private.mea_boko_audit_supplier_review()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $function$
begin
  if new.status is distinct from old.status then
    insert into public.supplier_application_audit
      (application_id,actor_user_id,old_status,new_status,review_note,created_at)
    values (new.id,auth.uid(),old.status,new.status,new.review_note,now());
  end if;
  return new;
end;
$function$;

drop trigger if exists mea_boko_supplier_review_stamp on public.supplier_applications;
create trigger mea_boko_supplier_review_stamp
before update of status on public.supplier_applications
for each row execute function private.mea_boko_stamp_supplier_review();

drop trigger if exists mea_boko_supplier_review_audit on public.supplier_applications;
create trigger mea_boko_supplier_review_audit
after update of status on public.supplier_applications
for each row execute function private.mea_boko_audit_supplier_review();
