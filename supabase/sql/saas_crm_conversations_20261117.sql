-- Multitenant private CRM conversation history; never exposed in public store.
create table if not exists public.saas_crm_threads(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 customer_id uuid,
 subject text not null check(char_length(btrim(subject)) between 3 and 180),
 channel text not null default 'internal' check(channel in ('internal','email','phone','instagram')),
 status text not null default 'open' check(status in ('open','waiting','resolved','closed')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,customer_id) references public.saas_customers(tenant_id,id)
);
create index if not exists saas_crm_threads_tenant_idx
 on public.saas_crm_threads(tenant_id,created_at desc);
create table if not exists public.saas_crm_messages(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 thread_id uuid not null,
 author_user_id uuid not null references auth.users(id),
 body text not null check(char_length(btrim(body)) between 1 and 3000),
 created_at timestamptz not null default now(),
 foreign key(tenant_id,thread_id) references public.saas_crm_threads(tenant_id,id) on delete cascade
);
create index if not exists saas_crm_messages_thread_idx
 on public.saas_crm_messages(tenant_id,thread_id,created_at);
alter table public.saas_crm_threads enable row level security;
alter table public.saas_crm_messages enable row level security;
revoke all on public.saas_crm_threads,public.saas_crm_messages from public,anon,authenticated;
grant select,insert on public.saas_crm_threads,public.saas_crm_messages to authenticated;
grant update(status,updated_at) on public.saas_crm_threads to authenticated;
grant all on public.saas_crm_threads,public.saas_crm_messages to service_role;
drop policy if exists saas_crm_threads_read on public.saas_crm_threads;
create policy saas_crm_threads_read on public.saas_crm_threads for select to authenticated
 using (public.saas_is_tenant_member(tenant_id));
drop policy if exists saas_crm_threads_insert on public.saas_crm_threads;
create policy saas_crm_threads_insert on public.saas_crm_threads for insert to authenticated
 with check (created_by=(select auth.uid()) and status='open'
  and public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role,'employee'::public.saas_member_role])
  and exists(select 1 from public.saas_tenants t where t.id=tenant_id and t.active));
drop policy if exists saas_crm_threads_update on public.saas_crm_threads;
create policy saas_crm_threads_update on public.saas_crm_threads for update to authenticated
 using (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]))
 with check (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]));
drop policy if exists saas_crm_messages_read on public.saas_crm_messages;
create policy saas_crm_messages_read on public.saas_crm_messages for select to authenticated
 using (public.saas_is_tenant_member(tenant_id));
drop policy if exists saas_crm_messages_insert on public.saas_crm_messages;
create policy saas_crm_messages_insert on public.saas_crm_messages for insert to authenticated
 with check (author_user_id=(select auth.uid()) and
 public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role,'employee'::public.saas_member_role]));
