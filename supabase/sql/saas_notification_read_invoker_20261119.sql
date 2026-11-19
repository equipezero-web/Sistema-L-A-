-- Remove the exposed SECURITY DEFINER read-marking function.
-- Let the authenticated role update only read_at, strictly on its own
-- notification under RLS, and run the RPC with invoker privileges.
drop policy if exists saas_notifications_mark_read on public.saas_notifications;
create policy saas_notifications_mark_read on public.saas_notifications
 for update to authenticated
 using (
  recipient_user_id=(select auth.uid()) and
  public.saas_is_tenant_member(tenant_id)
 )
 with check (
  recipient_user_id=(select auth.uid()) and
  public.saas_is_tenant_member(tenant_id)
 );
revoke update on public.saas_notifications from authenticated;
grant update(read_at) on public.saas_notifications to authenticated;
create or replace function public.saas_mark_notification_read(p_notification_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
 if p_notification_id is null or (select auth.uid()) is null then return false; end if;
 update public.saas_notifications n
  set read_at=coalesce(n.read_at,now())
  where n.id=p_notification_id and n.recipient_user_id=(select auth.uid())
    and public.saas_is_tenant_member(n.tenant_id);
 get diagnostics v_count=row_count;
 return v_count=1;
end; $$;
revoke all on function public.saas_mark_notification_read(uuid) from public,anon,authenticated;
grant execute on function public.saas_mark_notification_read(uuid) to authenticated;
