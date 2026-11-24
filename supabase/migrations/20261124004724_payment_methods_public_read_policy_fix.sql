-- Separate anonymous and authenticated read policies so anonymous requests
-- never need access to the private schema's administrator helper.
drop policy if exists payment_methods_active_read on public.payment_methods;
create policy payment_methods_public_read
on public.payment_methods for select to anon
using (is_active);
create policy payment_methods_member_read
on public.payment_methods for select to authenticated
using (is_active or (select private.mea_boko_is_admin()));
