-- Etapa #63: separar funções do contrato público e código privilegiado
-- da agenda da barbearia. O esquema booking_private NÃO é exposto pela Data API.
create schema if not exists booking_private;
revoke all on schema booking_private from public,anon,authenticated;
grant usage on schema booking_private to anon,authenticated;

-- Os OIDs e corpos originais são preservados; nenhuma regra de booking muda.
alter function public.saas_barber_public_setup(text)
  set schema booking_private;
alter function public.saas_barber_available_slots(text,uuid,date,uuid)
  set schema booking_private;
alter function public.saas_barber_request_booking(text,uuid,date,time,uuid,text,text)
  set schema booking_private;
alter function public.saas_barber_decide_request(uuid,text)
  set schema booking_private;

-- As únicas quatro entrypoints de booking do schema privado são explicitamente concedidas.
revoke all on function booking_private.saas_barber_public_setup(text)
  from public,anon,authenticated;
grant execute on function booking_private.saas_barber_public_setup(text)
  to anon,authenticated;
revoke all on function booking_private.saas_barber_available_slots(text,uuid,date,uuid)
  from public,anon,authenticated;
grant execute on function booking_private.saas_barber_available_slots(text,uuid,date,uuid)
  to anon,authenticated;
revoke all on function booking_private.saas_barber_request_booking(text,uuid,date,time,uuid,text,text)
  from public,anon,authenticated;
grant execute on function booking_private.saas_barber_request_booking(text,uuid,date,time,uuid,text,text)
  to anon,authenticated;
revoke all on function booking_private.saas_barber_decide_request(uuid,text)
  from public,anon,authenticated;
grant execute on function booking_private.saas_barber_decide_request(uuid,text)
  to authenticated;

-- As quatro funções visíveis pelo PostgREST são SECURITY INVOKER e não acessam
-- dados privilegiados: delegam apenas às funções explicitamente autorizadas.
create function public.saas_barber_public_setup(p_slug text)
returns jsonb language sql stable security invoker set search_path=''
as $fn$
  select booking_private.saas_barber_public_setup(p_slug);
$fn$;
revoke all on function public.saas_barber_public_setup(text) from public,anon,authenticated;
grant execute on function public.saas_barber_public_setup(text) to anon,authenticated;

create function public.saas_barber_available_slots(
  p_slug text,p_service_id uuid,p_day date,p_employee_id uuid default null
) returns jsonb language sql stable security invoker set search_path=''
as $fn$
  select booking_private.saas_barber_available_slots(p_slug,p_service_id,p_day,p_employee_id);
$fn$;
revoke all on function public.saas_barber_available_slots(text,uuid,date,uuid)
 from public,anon,authenticated;
grant execute on function public.saas_barber_available_slots(text,uuid,date,uuid)
 to anon,authenticated;

create function public.saas_barber_request_booking(
  p_slug text,p_service_id uuid,p_day date,p_time time,
  p_employee_id uuid,p_guest_name text,p_guest_phone text
) returns jsonb language sql volatile security invoker set search_path=''
as $fn$
  select booking_private.saas_barber_request_booking(
    p_slug,p_service_id,p_day,p_time,p_employee_id,p_guest_name,p_guest_phone
  );
$fn$;
revoke all on function public.saas_barber_request_booking(text,uuid,date,time,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.saas_barber_request_booking(text,uuid,date,time,uuid,text,text)
  to anon,authenticated;

create function public.saas_barber_decide_request(p_request_id uuid,p_decision text)
returns jsonb language sql volatile security invoker set search_path=''
as $fn$
  select booking_private.saas_barber_decide_request(p_request_id,p_decision);
$fn$;
revoke all on function public.saas_barber_decide_request(uuid,text)
  from public,anon,authenticated;
grant execute on function public.saas_barber_decide_request(uuid,text)
  to authenticated;

-- Ensure only the four expected internal functions exist in our dedicated schema.
do $verify$
declare v_count integer;
begin
 select count(*) into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='booking_private';
 if v_count<>4 then
   raise exception 'Unexpected function count in dedicated booking_private schema: %',v_count;
 end if;
end;
$verify$;
