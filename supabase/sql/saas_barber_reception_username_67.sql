-- Etapa #67 — recepção: login por usuário, criado exclusivamente no ADM.
-- Não concede saas_members e NÃO dá acesso às tabelas financeiras do painel.
grant usage on schema booking_private to service_role;
create table if not exists private.saas_reception_accounts (
  tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(tenant_id,username),
  constraint saas_reception_username_format check (username ~ '^[a-z][a-z0-9._-]{2,19}$')
);
alter table private.saas_reception_accounts enable row level security;
revoke all on private.saas_reception_accounts from public,anon,authenticated;

create or replace function booking_private.saas_reception_admin_link(
 p_tenant_id uuid,p_user_id uuid,p_username text
) returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare v_email text;v_expected text;
begin
 if p_username is null or p_username !~ '^[a-z][a-z0-9._-]{2,19}$'
 then raise exception 'Usuário da recepção inválido.';end if;
 if not exists(select 1 from public.saas_tenants t where t.id=p_tenant_id and t.active and t.template_code='barbershop')
 then raise exception 'Empresa inválida para recepção.';end if;
 v_expected:='r.'||replace(p_tenant_id::text,'-','')||'.'||p_username||'@accounts.example.invalid';
 select lower(u.email) into v_email from auth.users u
 where u.id=p_user_id and u.email_confirmed_at is not null
   and u.raw_app_meta_data->>'role'='reception'
   and u.raw_app_meta_data->>'tenant_id'=p_tenant_id::text;
 if v_email is distinct from v_expected then raise exception 'Conta de recepção não autorizada.';end if;
 insert into private.saas_reception_accounts(tenant_id,user_id,username)
 values(p_tenant_id,p_user_id,p_username);
 return jsonb_build_object('ok',true,'username',p_username);
end;
$fn$;
revoke all on function booking_private.saas_reception_admin_link(uuid,uuid,text) from public,anon,authenticated;
grant execute on function booking_private.saas_reception_admin_link(uuid,uuid,text) to service_role;
create or replace function public.saas_reception_admin_link(
 p_tenant_id uuid,p_user_id uuid,p_username text
) returns jsonb language sql volatile security invoker set search_path=''
as $fn$select booking_private.saas_reception_admin_link(p_tenant_id,p_user_id,p_username);$fn$;
revoke all on function public.saas_reception_admin_link(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.saas_reception_admin_link(uuid,uuid,text) to service_role;

create or replace function booking_private.saas_reception_admin_accounts(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $fn$
 select coalesce(jsonb_agg(jsonb_build_object(
   'username',r.username,'user_id',r.user_id,'active',r.active,
   'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb)
 from private.saas_reception_accounts r where r.tenant_id=p_tenant_id;
$fn$;
revoke all on function booking_private.saas_reception_admin_accounts(uuid) from public,anon,authenticated;
grant execute on function booking_private.saas_reception_admin_accounts(uuid) to service_role;
create or replace function public.saas_reception_admin_accounts(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $fn$select booking_private.saas_reception_admin_accounts(p_tenant_id);$fn$;
revoke all on function public.saas_reception_admin_accounts(uuid) from public,anon,authenticated;
grant execute on function public.saas_reception_admin_accounts(uuid) to service_role;

create or replace function booking_private.saas_reception_admin_disable(p_tenant_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $fn$
begin
 update private.saas_reception_accounts set active=false
 where tenant_id=p_tenant_id and user_id=p_user_id;
 return found;
end;
$fn$;
revoke all on function booking_private.saas_reception_admin_disable(uuid,uuid) from public,anon,authenticated;
grant execute on function booking_private.saas_reception_admin_disable(uuid,uuid) to service_role;
create or replace function public.saas_reception_admin_disable(p_tenant_id uuid,p_user_id uuid)
returns boolean language sql security invoker set search_path=''
as $fn$select booking_private.saas_reception_admin_disable(p_tenant_id,p_user_id);$fn$;
revoke all on function public.saas_reception_admin_disable(uuid,uuid) from public,anon,authenticated;
grant execute on function public.saas_reception_admin_disable(uuid,uuid) to service_role;

create or replace function booking_private.saas_reception_allowed(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select (select auth.uid()) is not null and exists (
  select 1 from private.saas_reception_accounts a
  join public.saas_tenants t on t.id=a.tenant_id
  where a.tenant_id=p_tenant_id and a.user_id=(select auth.uid())
    and a.active and t.active and t.template_code='barbershop'
    and public.saas_has_commercial_access(a.tenant_id)
 );
$fn$;
revoke all on function booking_private.saas_reception_allowed(uuid) from public,anon,authenticated;
grant execute on function booking_private.saas_reception_allowed(uuid) to authenticated;

create or replace function booking_private.saas_reception_dashboard(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v_tenant uuid;v_name text;v_username text;v_requests jsonb;v_today jsonb;
begin
 select t.id,t.name,a.username into v_tenant,v_name,v_username
 from private.saas_reception_accounts a
 join public.saas_tenants t on t.id=a.tenant_id
 where t.slug=p_slug and a.user_id=(select auth.uid()) and a.active
 and t.active and t.template_code='barbershop'
 and public.saas_has_commercial_access(t.id);
 if v_tenant is null then raise exception 'Recepção sem acesso a esta empresa.';end if;

 select coalesce(jsonb_agg(x.val order by x.sort_at desc),'[]'::jsonb)
 into v_requests from (
   select jsonb_build_object('id',r.id,'guest_name',r.guest_name,
     'guest_phone',r.guest_phone,'service',s.name,
     'employee',e.name,'starts_at',r.starts_at,'status',r.status,
     'expires_at',r.expires_at) val,r.created_at sort_at
   from public.saas_barber_requests r
   join public.saas_services s on s.id=r.service_id and s.tenant_id=r.tenant_id
   left join public.saas_employees e on e.id=r.employee_id and e.tenant_id=r.tenant_id
   where r.tenant_id=v_tenant and r.created_at>now()-interval '31 days'
   order by r.created_at desc limit 80
 ) x;

 select coalesce(jsonb_agg(x.val order by x.sort_at),'[]'::jsonb)
 into v_today from (
   select jsonb_build_object('id',ap.id,'guest_name',coalesce(ap.guest_name,c.name),
    'guest_phone',coalesce(ap.guest_phone,c.phone),
    'service',s.name,'employee',e.name,'starts_at',ap.starts_at,
    'status',ap.status,'price',ap.price) val,ap.starts_at sort_at
   from public.saas_appointments ap
   left join public.saas_customers c on c.id=ap.customer_id and c.tenant_id=ap.tenant_id
   left join public.saas_services s on s.id=ap.service_id and s.tenant_id=ap.tenant_id
   left join public.saas_employees e on e.id=ap.employee_id and e.tenant_id=ap.tenant_id
   join public.saas_barber_hours h on h.tenant_id=ap.tenant_id
   where ap.tenant_id=v_tenant and
    (ap.starts_at at time zone h.timezone)::date=(now() at time zone h.timezone)::date
   order by ap.starts_at limit 120
 ) x;

 return jsonb_build_object('name',v_name,'username',v_username,
   'requests',v_requests,'today',v_today);
end;
$fn$;
revoke all on function booking_private.saas_reception_dashboard(text) from public,anon,authenticated;
grant execute on function booking_private.saas_reception_dashboard(text) to authenticated;
create or replace function public.saas_reception_dashboard(p_slug text)
returns jsonb language sql stable security invoker set search_path=''
as $fn$select booking_private.saas_reception_dashboard(p_slug);$fn$;
revoke all on function public.saas_reception_dashboard(text) from public,anon,authenticated;
grant execute on function public.saas_reception_dashboard(text) to authenticated;

-- Recepção pode aprovar/recusar solicitações somente de sua empresa.
-- Alteração mínima do guard existente, mantendo todas as validações de horário.
do $patch$
declare v_before text;v_after text;old_body text;new_body text;
begin
 v_before:=pg_get_functiondef('booking_private.saas_barber_decide_request(uuid,text)'::regprocedure);
 old_body:=$old$
 if not public.saas_has_tenant_role(v_request.tenant_id,
    array['owner'::public.saas_member_role,'admin'::public.saas_member_role]) then
   raise exception 'Sem permissão para gerenciar solicitações.';
 end if;
$old$;
 new_body:=$new$
 if not (
  public.saas_has_tenant_role(v_request.tenant_id,
    array['owner'::public.saas_member_role,'admin'::public.saas_member_role])
  or booking_private.saas_reception_allowed(v_request.tenant_id)
 ) then
   raise exception 'Sem permissão para gerenciar solicitações.';
 end if;
$new$;
 if strpos(v_before,old_body)=0 then
   raise exception 'Função de aprovação mudou. Revise antes de atualizar.';
 end if;
 v_after:=replace(v_before,old_body,new_body);
 execute v_after;
end;
$patch$;

-- Somente para atendimentos do DIA, dentro da empresa designada. Reutiliza
-- idempotência financeira com UNIQUE de referência, sem conceder acesso financeiro
-- genérico à conta de recepção.
create or replace function booking_private.saas_reception_complete(p_appointment_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare v_appt public.saas_appointments;v_time_zone text;
begin
 if (select auth.uid()) is null then raise exception 'Recepção não autenticada.';end if;
 select * into v_appt from public.saas_appointments where id=p_appointment_id for update;
 if v_appt.id is null then raise exception 'Atendimento não encontrado.';end if;
 if not booking_private.saas_reception_allowed(v_appt.tenant_id)
 then raise exception 'Sem acesso a este atendimento.';end if;
 select timezone into v_time_zone from public.saas_barber_hours where tenant_id=v_appt.tenant_id;
 if (v_appt.starts_at at time zone coalesce(v_time_zone,'America/Recife'))::date
    is distinct from (now() at time zone coalesce(v_time_zone,'America/Recife'))::date
 then raise exception 'A recepção só pode concluir atendimentos de hoje.';end if;
 if v_appt.starts_at>now()+interval '10 minutes'
 then raise exception 'O atendimento ainda não começou.';end if;
 if v_appt.status='completed' then return jsonb_build_object('ok',true,'status','completed');end if;
 if v_appt.status not in ('confirmed','pending')
 then raise exception 'Este atendimento não pode ser concluído.';end if;
 update public.saas_appointments set status='completed',updated_at=now()
 where id=v_appt.id;
 if v_appt.price>0 then
   insert into public.saas_financial_entries(
     tenant_id,kind,description,amount,occurred_on,category,
     reference_type,reference_id,created_by
   ) values(
     v_appt.tenant_id,'income','Serviço concluído',v_appt.price,
     current_date,'Serviços','appointment',v_appt.id,(select auth.uid())
   ) on conflict (tenant_id,reference_type,reference_id)
     where reference_type is not null and reference_id is not null do nothing;
 end if;
 return jsonb_build_object('ok',true,'status','completed');
end;
$fn$;
revoke all on function booking_private.saas_reception_complete(uuid) from public,anon,authenticated;
grant execute on function booking_private.saas_reception_complete(uuid) to authenticated;
create or replace function public.saas_reception_complete(p_appointment_id uuid)
returns jsonb language sql volatile security invoker set search_path=''
as $fn$select booking_private.saas_reception_complete(p_appointment_id);$fn$;
revoke all on function public.saas_reception_complete(uuid) from public,anon,authenticated;
grant execute on function public.saas_reception_complete(uuid) to authenticated;
