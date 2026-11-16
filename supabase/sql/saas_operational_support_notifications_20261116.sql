-- Shared tenant-scoped operations: support requests and private notification inbox.
-- No billing changes, payment activation, automatic messaging, or external AI calls.
create table if not exists public.saas_support_tickets (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 title text not null check (char_length(trim(title)) between 5 and 160),
 description text not null check (char_length(trim(description)) between 10 and 4000),
 category text not null default 'general' check(category in ('general','billing','technical','store','security')),
 status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists saas_support_tenant_date_idx
 on public.saas_support_tickets(tenant_id,created_at desc);
alter table public.saas_support_tickets enable row level security;
revoke all on public.saas_support_tickets from public,anon;
grant select,insert,update on public.saas_support_tickets to authenticated;
drop policy if exists saas_support_read on public.saas_support_tickets;
create policy saas_support_read on public.saas_support_tickets for select to authenticated
 using (public.saas_is_tenant_member(tenant_id) or public.saas_is_platform_super_admin());
drop policy if exists saas_support_create on public.saas_support_tickets;
create policy saas_support_create on public.saas_support_tickets for insert to authenticated
 with check (
  created_by=(select auth.uid())
  and status='open'
  and public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role])
 );
drop policy if exists saas_support_update on public.saas_support_tickets;
create policy saas_support_update on public.saas_support_tickets for update to authenticated
 using (public.saas_is_platform_super_admin())
 with check (public.saas_is_platform_super_admin());

-- Recipient-specific messages: users cannot invent payments/administrative alerts.
create table if not exists public.saas_notifications (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in ('order','booking','payment','account','platform','support')),
 title text not null check(char_length(trim(title)) between 1 and 160),
 message text not null check(char_length(trim(message)) between 1 and 1000),
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists saas_notification_inbox_idx
 on public.saas_notifications(recipient_user_id,tenant_id,created_at desc);
alter table public.saas_notifications enable row level security;
revoke all on public.saas_notifications from public,anon,authenticated;
grant select on public.saas_notifications to authenticated;
drop policy if exists saas_notifications_read on public.saas_notifications;
create policy saas_notifications_read on public.saas_notifications for select to authenticated
 using (recipient_user_id=(select auth.uid()) and public.saas_is_tenant_member(tenant_id));

-- Mark-read operation restricted to own notification, without granting direct UPDATE
-- on mutable category/title/message/tenant columns.
create or replace function public.saas_mark_notification_read(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
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
