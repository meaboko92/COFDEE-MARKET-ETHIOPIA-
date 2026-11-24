-- Keep the SECURITY DEFINER implementation outside the exposed public schema.
create or replace function private.set_profile_role(target_user_id uuid, target_role text)
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
revoke all on function private.set_profile_role(uuid,text) from public;
revoke all on function private.set_profile_role(uuid,text) from anon;
grant usage on schema private to authenticated;
grant execute on function private.set_profile_role(uuid,text) to authenticated;

create or replace function public.set_profile_role(target_user_id uuid, target_role text)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.set_profile_role(target_user_id,target_role);
$function$;
revoke all on function public.set_profile_role(uuid,text) from public;
revoke all on function public.set_profile_role(uuid,text) from anon;
grant execute on function public.set_profile_role(uuid,text) to authenticated;
