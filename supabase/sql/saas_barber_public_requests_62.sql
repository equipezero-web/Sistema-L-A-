-- Etapa #62 - Agendamento público controlado para barbearias (pedidos em análise).
-- Baseado no fluxo de serviços/data/horários do Adriano Paulo Barbearia.
-- Não copia contas, credenciais ou tabelas daquele projeto.
create table public.saas_barber_hours (
  tenant_id uuid primary key references public.saas_tenants(id) on delete cascade,
  timezone text not null default 'America/Recife',
  opens_at time not null default '09:00',
  closes_at time not null default '18:00',
  days_open integer[] not null default array[1,2,3,4,5,6],
  step_minutes integer not null default 30,
  accepting_bookings boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint saas_barber_hours_valid check (
    closes_at > opens_at and
    closes_at-opens_at <= interval '14 hours' and
    step_minutes in (15,30,60) and
    array_length(days_open,1) between 1 and 7 and
    days_open <@ array[1,2,3,4,5,6,7] and
    timezone in ('America/Recife','America/Sao_Paulo','America/Fortaleza','America/Belem',
                 'America/Manaus','America/Cuiaba','America/Rio_Branco')
  )
);
alter table public.saas_barber_hours enable row level security;
revoke all on public.saas_barber_hours from public,anon,authenticated;
grant select,insert,update on public.saas_barber_hours to authenticated;
create policy saas_barber_hours_owner_select on public.saas_barber_hours for select to authenticated
  using (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]));
create policy saas_barber_hours_owner_insert on public.saas_barber_hours for insert to authenticated
  with check (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]));
create policy saas_barber_hours_owner_update on public.saas_barber_hours for update to authenticated
  using (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]))
  with check (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]));

create or replace function public.saas_barber_init_hours()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.template_code='barbershop' then
    insert into public.saas_barber_hours(tenant_id) values(new.id)
    on conflict(tenant_id) do nothing;
  end if;
  return new;
end;
$fn$;
revoke all on function public.saas_barber_init_hours() from public,anon,authenticated;
create trigger saas_barber_init_hours_on_template
after insert or update of template_code on public.saas_tenants
for each row execute function public.saas_barber_init_hours();
insert into public.saas_barber_hours(tenant_id)
select id from public.saas_tenants where template_code='barbershop'
on conflict(tenant_id) do nothing;

create table public.saas_barber_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
  service_id uuid not null references public.saas_services(id) on delete restrict,
  employee_id uuid references public.saas_employees(id) on delete set null,
  guest_name text not null check (char_length(btrim(guest_name)) between 2 and 80),
  guest_phone text not null check (guest_phone ~ '^[0-9]{10,13}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service_price numeric(12,2) not null check (service_price>=0),
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  appointment_id uuid unique references public.saas_appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint saas_barber_requests_dates check(ends_at>starts_at and ends_at-starts_at<=interval '4 hours')
);
create index saas_barber_requests_tenant_day_idx
on public.saas_barber_requests(tenant_id,starts_at) where status='pending';
create index saas_barber_requests_phone_created_idx
on public.saas_barber_requests(tenant_id,guest_phone,created_at);
alter table public.saas_barber_requests enable row level security;
revoke all on public.saas_barber_requests from public,anon,authenticated;
grant select on public.saas_barber_requests to authenticated;
create policy saas_barber_requests_managers_read on public.saas_barber_requests
 for select to authenticated
 using (public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]));

alter table public.saas_appointments
 add column if not exists guest_name text,
 add column if not exists guest_phone text,
 add column if not exists booking_origin text not null default 'internal';
alter table public.saas_appointments add constraint saas_appointments_origin_check
 check (booking_origin in ('internal','online'));

-- Helper executes as DB owner but is NOT directly callable by frontend roles.
create or replace function private.saas_barber_slot_free(
 p_tenant uuid,p_employee uuid,p_start timestamptz,p_end timestamptz,p_ignore_request uuid default null
) returns boolean language sql stable security definer set search_path=''
as $fn$
 select not exists (
  select 1 from public.saas_appointments a
  where a.tenant_id=p_tenant and a.status not in ('cancelled','no_show')
    and a.starts_at<p_end and a.ends_at>p_start
    and (p_employee is null or a.employee_id is null or a.employee_id=p_employee)
 ) and not exists (
  select 1 from public.saas_barber_requests r
  where r.tenant_id=p_tenant and r.status='pending' and r.expires_at>now()
    and (p_ignore_request is null or r.id<>p_ignore_request)
    and r.starts_at<p_end and r.ends_at>p_start
    and (p_employee is null or r.employee_id is null or r.employee_id=p_employee)
 );
$fn$;
revoke all on function private.saas_barber_slot_free(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;

-- The advisory lock serializes reservations and internal updates within one company.
create or replace function private.saas_barber_appointment_conflict_guard()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
 if not exists (
   select 1 from public.saas_tenants t
   where t.id=new.tenant_id and t.template_code='barbershop'
 ) then return new; end if;
 if new.ends_at<=new.starts_at then raise exception 'O fim deve ser posterior ao início.'; end if;
 if new.status in ('cancelled','no_show') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('saas_barber:'||new.tenant_id::text,0));
 if exists(
   select 1 from public.saas_appointments a
   where a.tenant_id=new.tenant_id and a.id<>new.id and a.status not in ('cancelled','no_show')
    and a.starts_at<new.ends_at and a.ends_at>new.starts_at
    and (new.employee_id is null or a.employee_id is null or new.employee_id=a.employee_id)
 ) or exists(
   select 1 from public.saas_barber_requests r
   where r.tenant_id=new.tenant_id and r.status='pending' and r.expires_at>now()
    and r.starts_at<new.ends_at and r.ends_at>new.starts_at
    and (new.employee_id is null or r.employee_id is null or new.employee_id=r.employee_id)
 ) then
   raise exception 'Este horário já foi reservado. Escolha outro.';
 end if;
 return new;
end;
$fn$;
revoke all on function private.saas_barber_appointment_conflict_guard() from public,anon,authenticated;
create trigger saas_barber_appointment_conflict_guard
before insert or update of starts_at,ends_at,employee_id,status on public.saas_appointments
for each row execute function private.saas_barber_appointment_conflict_guard();

create or replace function public.saas_barber_public_setup(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v_tenant uuid;v_hours public.saas_barber_hours;v_staff jsonb;
begin
 select s.tenant_id into v_tenant
 from public.saas_public_stores s
 where s.slug=p_slug and s.template_code='barbershop'
   and private.saas_public_store_visible(s.tenant_id);
 if v_tenant is null then return null;end if;
 select * into v_hours from public.saas_barber_hours h
 where h.tenant_id=v_tenant and h.accepting_bookings=true;
 if v_hours.tenant_id is null then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'name',e.name,'avatar_url',e.avatar_url) order by e.name),'[]'::jsonb)
 into v_staff from public.saas_employees e
 where e.tenant_id=v_tenant and e.status='active';
 return jsonb_build_object(
   'timezone',v_hours.timezone,'opens_at',to_char(v_hours.opens_at,'HH24:MI'),
   'closes_at',to_char(v_hours.closes_at,'HH24:MI'),
   'days_open',to_jsonb(v_hours.days_open),'step_minutes',v_hours.step_minutes,
   'employees',v_staff
 );
end;
$fn$;
revoke all on function public.saas_barber_public_setup(text) from public,anon,authenticated;
grant execute on function public.saas_barber_public_setup(text) to anon,authenticated;

create or replace function public.saas_barber_available_slots(
  p_slug text,p_service_id uuid,p_day date,p_employee_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare
 v_tenant uuid;v_hours public.saas_barber_hours;v_service public.saas_services;
 v_cursor timestamp;v_closing timestamp;v_start timestamptz;v_end timestamptz;
 v_staff_count integer;v_slots jsonb:='[]'::jsonb;
begin
 select s.tenant_id into v_tenant from public.saas_public_stores s
 where s.slug=p_slug and s.template_code='barbershop'
 and private.saas_public_store_visible(s.tenant_id);
 if v_tenant is null then return jsonb_build_object('slots','[]'::jsonb);end if;
 select * into v_hours from public.saas_barber_hours
 where tenant_id=v_tenant and accepting_bookings=true;
 select * into v_service from public.saas_services
 where id=p_service_id and tenant_id=v_tenant and status='active' and published=true;
 if v_hours.tenant_id is null or v_service.id is null
    or v_service.duration_minutes not between 5 and 240
    or p_day is null or p_day< (now() at time zone v_hours.timezone)::date
    or p_day> (now() at time zone v_hours.timezone)::date + 30
    or extract(isodow from p_day)::integer <> all(v_hours.days_open)
 then
   return jsonb_build_object('slots','[]'::jsonb);
 end if;
 select count(*) into v_staff_count from public.saas_employees
 where tenant_id=v_tenant and status='active';
 if p_employee_id is null and v_staff_count>0
 or p_employee_id is not null and not exists(
   select 1 from public.saas_employees
   where id=p_employee_id and tenant_id=v_tenant and status='active'
 ) then return jsonb_build_object('slots','[]'::jsonb);end if;
 v_cursor:=p_day+v_hours.opens_at;
 v_closing:=p_day+v_hours.closes_at;
 while v_cursor + make_interval(mins=>v_service.duration_minutes) <= v_closing loop
   v_start:=v_cursor at time zone v_hours.timezone;
   v_end:=v_start+make_interval(mins=>v_service.duration_minutes);
   if v_start>now()+interval '30 minutes' and
      private.saas_barber_slot_free(v_tenant,p_employee_id,v_start,v_end) then
      v_slots:=v_slots || to_jsonb(to_char(v_cursor,'HH24:MI'));
   end if;
   v_cursor:=v_cursor+make_interval(mins=>v_hours.step_minutes);
 end loop;
 return jsonb_build_object('slots',v_slots,'timezone',v_hours.timezone);
end;
$fn$;
revoke all on function public.saas_barber_available_slots(text,uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.saas_barber_available_slots(text,uuid,date,uuid) to anon,authenticated;

create or replace function public.saas_barber_request_booking(
 p_slug text,p_service_id uuid,p_day date,p_time time,
 p_employee_id uuid,p_guest_name text,p_guest_phone text
) returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
 v_tenant uuid;v_hours public.saas_barber_hours;v_service public.saas_services;
 v_start timestamptz;v_end timestamptz;v_digits text;v_name text;v_id uuid;
 v_slots jsonb;
begin
 -- Public endpoint is strictly for a published/eligible barbershop.
 select s.tenant_id into v_tenant from public.saas_public_stores s
 where s.slug=p_slug and s.template_code='barbershop'
   and private.saas_public_store_visible(s.tenant_id);
 if v_tenant is null then raise exception 'Barbearia indisponível para agendamentos.';end if;
 v_name:=btrim(regexp_replace(coalesce(p_guest_name,''),'[[:space:]]+',' ','g'));
 v_digits:=regexp_replace(coalesce(p_guest_phone,''),'[^0-9]','','g');
 if char_length(v_name) not between 2 and 80 or char_length(v_digits) not between 10 and 13
 then raise exception 'Informe nome e telefone válidos.';end if;
 perform pg_advisory_xact_lock(hashtextextended('saas_barber:'||v_tenant::text,0));
 if exists(select 1 from public.saas_barber_requests r
    where r.tenant_id=v_tenant and r.guest_phone=v_digits
     and r.created_at>now()-interval '2 minutes') then
   raise exception 'Aguarde antes de solicitar outro horário.';
 end if;
 if (select count(*) from public.saas_barber_requests r
    where r.tenant_id=v_tenant and r.guest_phone=v_digits
     and r.created_at>now()-interval '24 hours')>=3
 or (select count(*) from public.saas_barber_requests r
    where r.tenant_id=v_tenant and r.created_at>now()-interval '24 hours')>=80
 then raise exception 'Limite temporário de solicitações atingido.';end if;
 v_slots:=public.saas_barber_available_slots(p_slug,p_service_id,p_day,p_employee_id);
 if p_time is null or extract(second from p_time)<>0
    or not (v_slots->'slots' ? to_char(p_time,'HH24:MI')) then
   raise exception 'Horário indisponível. Atualize os horários e escolha outro.';
 end if;
 select * into v_hours from public.saas_barber_hours where tenant_id=v_tenant;
 select * into v_service from public.saas_services
 where tenant_id=v_tenant and id=p_service_id and published=true and status='active';
 if v_hours.tenant_id is null or v_service.id is null then raise exception 'Serviço indisponível.';end if;
 v_start:=(p_day+p_time) at time zone v_hours.timezone;
 v_end:=v_start+make_interval(mins=>v_service.duration_minutes);
 insert into public.saas_barber_requests(
   tenant_id,service_id,employee_id,guest_name,guest_phone,starts_at,ends_at,service_price
 ) values(v_tenant,p_service_id,p_employee_id,v_name,v_digits,v_start,v_end,v_service.price)
 returning id into v_id;
 return jsonb_build_object('ok',true,'status','pending',
   'code','LA-'||upper(substr(replace(v_id::text,'-',''),1,10)));
end;
$fn$;
revoke all on function public.saas_barber_request_booking(text,uuid,date,time,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.saas_barber_request_booking(text,uuid,date,time,uuid,text,text)
 to anon,authenticated;

create or replace function public.saas_barber_decide_request(p_request_id uuid,p_decision text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare v_request public.saas_barber_requests;v_appointment uuid;
begin
 if (select auth.uid()) is null then raise exception 'Faça login como gestor.';end if;
 if p_decision not in ('accept','reject') then raise exception 'Decisão inválida.';end if;
 select * into v_request from public.saas_barber_requests where id=p_request_id;
 if v_request.id is null then raise exception 'Solicitação não encontrada.';end if;
 if not public.saas_has_tenant_role(v_request.tenant_id,
    array['owner'::public.saas_member_role,'admin'::public.saas_member_role]) then
   raise exception 'Sem permissão para gerenciar solicitações.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('saas_barber:'||v_request.tenant_id::text,0));
 select * into v_request from public.saas_barber_requests where id=p_request_id for update;
 if v_request.status<>'pending' then
   return jsonb_build_object('ok',true,'status',v_request.status,'appointment_id',v_request.appointment_id);
 end if;
 if p_decision='reject' then
   update public.saas_barber_requests set status='rejected',decided_at=now()
   where id=v_request.id;
   return jsonb_build_object('ok',true,'status','rejected');
 end if;
 if v_request.expires_at<=now() then raise exception 'Solicitação expirada. Peça ao cliente para solicitar novamente.';end if;
 if not public.saas_has_commercial_access(v_request.tenant_id) or
 not exists(select 1 from public.saas_public_stores
   where tenant_id=v_request.tenant_id and template_code='barbershop')
 then raise exception 'A publicação da empresa está indisponível.';end if;
 if not exists (
    select 1 from public.saas_services s
    where s.id=v_request.service_id and s.tenant_id=v_request.tenant_id
      and s.status='active' and s.published=true
 ) then raise exception 'Este serviço não está mais disponível.';end if;
 if v_request.employee_id is not null and not exists (
    select 1 from public.saas_employees e
    where e.id=v_request.employee_id and e.tenant_id=v_request.tenant_id
      and e.status='active'
 ) then raise exception 'Profissional indisponível. Solicite um novo horário.';end if;
 if not private.saas_barber_slot_free(
    v_request.tenant_id,v_request.employee_id,v_request.starts_at,v_request.ends_at,v_request.id)
 then raise exception 'Horário ocupado. Rejeite a solicitação e escolha outro.';end if;
 update public.saas_barber_requests set status='accepted',decided_at=now()
 where id=v_request.id;
 insert into public.saas_appointments(
   tenant_id,customer_id,employee_id,service_id,starts_at,ends_at,price,
   status,guest_name,guest_phone,booking_origin
 ) values(
   v_request.tenant_id,null,v_request.employee_id,v_request.service_id,
   v_request.starts_at,v_request.ends_at,v_request.service_price,
   'confirmed',v_request.guest_name,v_request.guest_phone,'online'
 ) returning id into v_appointment;
 update public.saas_barber_requests set appointment_id=v_appointment where id=v_request.id;
 return jsonb_build_object('ok',true,'status','accepted','appointment_id',v_appointment);
end;
$fn$;
revoke all on function public.saas_barber_decide_request(uuid,text) from public,anon,authenticated;
grant execute on function public.saas_barber_decide_request(uuid,text) to authenticated;
