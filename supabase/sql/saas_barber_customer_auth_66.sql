-- Etapa #66 - cliente cadastra-se com e-mail verificado no Supabase Auth.
-- Vínculo privado de usuário à empresa, sem confundir cliente com usuário ADM.
create table if not exists private.saas_barber_customer_accounts (
  tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.saas_customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id,user_id),
  unique(tenant_id,customer_id)
);
alter table private.saas_barber_customer_accounts enable row level security;
revoke all on private.saas_barber_customer_accounts from public,anon,authenticated;

alter table public.saas_barber_requests
 add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
create index if not exists saas_barber_requests_customer_user_idx
on public.saas_barber_requests(tenant_id,customer_user_id,created_at desc);

create or replace function booking_private.saas_barber_customer_register(
 p_slug text,p_name text,p_phone text
) returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
 v_tenant uuid;v_user uuid:=(select auth.uid());v_email text;v_name text;v_phone text;
 v_customer uuid;v_existing uuid;
begin
 if v_user is null then raise exception 'Entre na sua conta para cadastrar-se.';end if;
 select lower(u.email) into v_email from auth.users u
 where u.id=v_user and u.email_confirmed_at is not null and u.is_anonymous is not true;
 if v_email is null then raise exception 'Confirme seu e-mail antes de utilizar a barbearia.';end if;
 select s.tenant_id into v_tenant from public.saas_public_stores s
 where s.slug=p_slug and s.template_code='barbershop'
 and private.saas_public_store_visible(s.tenant_id);
 if v_tenant is null then raise exception 'Barbearia indisponível para cadastro.';end if;
 v_name:=btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g'));
 v_phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if char_length(v_name) not between 2 and 80 or char_length(v_phone) not between 10 and 13
 then raise exception 'Informe nome e telefone válidos.';end if;
 select a.customer_id into v_existing from private.saas_barber_customer_accounts a
 where a.tenant_id=v_tenant and a.user_id=v_user;
 if v_existing is not null then
   update public.saas_customers set name=v_name,phone=v_phone,email=v_email
   where id=v_existing and tenant_id=v_tenant and status='active'
   returning id into v_customer;
   if v_customer is null then raise exception 'Cadastro desativado. Contate a barbearia.';end if;
 else
   insert into public.saas_customers(tenant_id,name,phone,email,status)
   values(v_tenant,v_name,v_phone,v_email,'active')
   returning id into v_customer;
   insert into private.saas_barber_customer_accounts(tenant_id,user_id,customer_id)
   values(v_tenant,v_user,v_customer);
 end if;
 return jsonb_build_object('name',v_name,'phone',v_phone,'email',v_email,'registered',true);
end;
$fn$;
revoke all on function booking_private.saas_barber_customer_register(text,text,text) from public,anon,authenticated;
grant usage on schema booking_private to authenticated;
grant execute on function booking_private.saas_barber_customer_register(text,text,text) to authenticated;

create or replace function public.saas_barber_customer_register(
 p_slug text,p_name text,p_phone text
) returns jsonb language sql volatile security invoker set search_path=''
as $fn$
 select booking_private.saas_barber_customer_register(p_slug,p_name,p_phone);
$fn$;
revoke all on function public.saas_barber_customer_register(text,text,text) from public,anon,authenticated;
grant execute on function public.saas_barber_customer_register(text,text,text) to authenticated;

create or replace function booking_private.saas_barber_customer_profile(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v jsonb;
begin
 if (select auth.uid()) is null then return null;end if;
 select jsonb_build_object('name',c.name,'email',c.email,'phone',c.phone,'registered',true)
 into v from private.saas_barber_customer_accounts a
 join public.saas_customers c on c.tenant_id=a.tenant_id and c.id=a.customer_id
 join public.saas_public_stores s on s.tenant_id=a.tenant_id
 join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null
 where a.user_id=(select auth.uid()) and s.slug=p_slug and s.template_code='barbershop'
 and c.status='active' and private.saas_public_store_visible(s.tenant_id);
 return v;
end;
$fn$;
revoke all on function booking_private.saas_barber_customer_profile(text) from public,anon,authenticated;
grant execute on function booking_private.saas_barber_customer_profile(text) to authenticated;
create or replace function public.saas_barber_customer_profile(p_slug text)
returns jsonb language sql stable security invoker set search_path=''
as $fn$
 select booking_private.saas_barber_customer_profile(p_slug);
$fn$;
revoke all on function public.saas_barber_customer_profile(text) from public,anon,authenticated;
grant execute on function public.saas_barber_customer_profile(text) to authenticated;

create or replace function booking_private.saas_barber_customer_history(p_slug text)
returns jsonb language sql stable security definer set search_path=''
as $fn$
 select coalesce(jsonb_agg(jsonb_build_object(
   'code','LA-'||upper(substr(replace(r.id::text,'-',''),1,10)),
   'starts_at',r.starts_at,'ends_at',r.ends_at,'status',r.status,
   'service_name',s.name,'price',r.service_price,
   'appointment_id',r.appointment_id
 ) order by r.created_at desc),'[]'::jsonb)
 from public.saas_barber_requests r
 join public.saas_public_stores ps on ps.tenant_id=r.tenant_id and ps.slug=p_slug
 join private.saas_barber_customer_accounts a
   on a.tenant_id=r.tenant_id and a.user_id=r.customer_user_id
 join public.saas_services s on s.id=r.service_id and s.tenant_id=r.tenant_id
 where r.customer_user_id=(select auth.uid()) and (select auth.uid()) is not null
   and private.saas_public_store_visible(r.tenant_id);
$fn$;
revoke all on function booking_private.saas_barber_customer_history(text) from public,anon,authenticated;
grant execute on function booking_private.saas_barber_customer_history(text) to authenticated;
create or replace function public.saas_barber_customer_history(p_slug text)
returns jsonb language sql stable security invoker set search_path=''
as $fn$
 select booking_private.saas_barber_customer_history(p_slug);
$fn$;
revoke all on function public.saas_barber_customer_history(text) from public,anon,authenticated;
grant execute on function public.saas_barber_customer_history(text) to authenticated;

-- Regra de servidor: não existe reserva de barbearia sem conta de cliente verificada.
create or replace function booking_private.saas_barber_customer_request_guard()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_user uuid:=(select auth.uid());v_name text;v_phone text;
begin
 if v_user is null then
  raise exception 'Cadastre-se e entre na sua conta antes de solicitar um horário.';
 end if;
 select c.name,c.phone into v_name,v_phone
 from private.saas_barber_customer_accounts a
 join public.saas_customers c on c.id=a.customer_id and c.tenant_id=a.tenant_id
 join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null
 where a.user_id=v_user and a.tenant_id=new.tenant_id and c.status='active';
 if v_name is null then raise exception 'Complete seu cadastro de cliente nesta barbearia.';end if;
 new.customer_user_id:=v_user;
 new.guest_name:=v_name;
 new.guest_phone:=regexp_replace(v_phone,'[^0-9]','','g');
 return new;
end;
$fn$;
revoke all on function booking_private.saas_barber_customer_request_guard() from public,anon,authenticated;
create trigger saas_barber_customer_request_guard before insert on public.saas_barber_requests
for each row execute function booking_private.saas_barber_customer_request_guard();

-- Prevent fake contact details from bypassing the existing server-side phone limits.
-- Reapply only if the exact previously audited function body is present.
do $patch$
declare old_definition text;new_definition text;old_body text;new_body text;
begin
 old_definition:=pg_get_functiondef('booking_private.saas_barber_request_booking(text,uuid,date,time,uuid,text,text)'::regprocedure);
 old_body:=$old$
 v_name:=btrim(regexp_replace(coalesce(p_guest_name,''),'[[:space:]]+',' ','g'));
 v_digits:=regexp_replace(coalesce(p_guest_phone,''),'[^0-9]','','g');
$old$;
 new_body:=$new$
 select c.name,regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')
 into v_name,v_digits
 from private.saas_barber_customer_accounts a
 join public.saas_customers c on c.id=a.customer_id and c.tenant_id=a.tenant_id
 join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null
 where a.user_id=(select auth.uid()) and a.tenant_id=v_tenant and c.status='active';
 if v_name is null then
   raise exception 'Cadastre-se e confirme seu e-mail antes de solicitar um horário.';
 end if;
$new$;
 if position(old_body in old_definition)=0 then
  raise exception 'The booking request function changed; verify current source before modifying';
 end if;
 new_definition:=replace(old_definition,old_body,new_body);
 execute new_definition;
end;
$patch$;
