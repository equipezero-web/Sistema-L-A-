-- Internal work queue for Instagram orders and business communication companies.
-- This is NOT an Instagram API connector, payment processor, or public CRM.
create table if not exists public.saas_model_work_items (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 kind text not null check(kind in ('instagram_followup','communication_task')),
 title text not null check(length(btrim(title)) between 4 and 120),
 details text not null default '' check(length(details)<=2000),
 stage text not null default 'open' check(stage in ('open','in_progress','done','cancelled')),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 due_on date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists saas_model_work_items_tenant_stage
 on public.saas_model_work_items(tenant_id,stage,created_at desc);
alter table public.saas_model_work_items enable row level security;
revoke all on public.saas_model_work_items from public,anon,authenticated;
grant select,insert on public.saas_model_work_items to authenticated;
grant update(stage,updated_at) on public.saas_model_work_items to authenticated;
grant all on public.saas_model_work_items to service_role;
drop policy if exists saas_model_work_items_read on public.saas_model_work_items;
create policy saas_model_work_items_read on public.saas_model_work_items for select to authenticated
 using (public.saas_is_tenant_member(tenant_id));
drop policy if exists saas_model_work_items_create on public.saas_model_work_items;
create policy saas_model_work_items_create on public.saas_model_work_items for insert to authenticated
 with check (
  created_by=(select auth.uid())
  and stage='open'
  and public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role,'employee'::public.saas_member_role])
  and exists(select 1 from public.saas_tenants t where t.id=tenant_id and t.active
   and ((t.template_code='instagram_orders' and kind='instagram_followup')
   or (t.template_code='business_communication' and kind='communication_task')))
 );
drop policy if exists saas_model_work_items_update on public.saas_model_work_items;
create policy saas_model_work_items_update on public.saas_model_work_items for update to authenticated
 using (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]))
 with check (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]));
