-- Harden booking conflicts even if appointments are created from different clients.
-- This trigger applies to direct writes, approvals, and reschedules.
-- It does not create appointments or alter existing bookings.
create or replace function private.saas_prevent_employee_booking_overlap()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.employee_id is null or new.status::text not in ('pending','confirmed') then
   return new;
 end if;
 if new.ends_at<=new.starts_at then
   raise exception 'Horário de agendamento inválido.' using errcode='23514';
 end if;
 -- Serialize writes per tenant and professional, including concurrent requests.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(new.tenant_id::text||':'||new.employee_id::text, 0)
 );
 if exists (
   select 1 from public.saas_appointments a
   where a.tenant_id=new.tenant_id
     and a.employee_id=new.employee_id
     and a.id is distinct from new.id
     and a.status::text in ('pending','confirmed')
     and a.starts_at<new.ends_at and a.ends_at>new.starts_at
 ) then
   raise exception 'Profissional já possui agendamento nesse horário.'
     using errcode='23P01';
 end if;
 return new;
end;
$$;
revoke all on function private.saas_prevent_employee_booking_overlap()
 from public,anon,authenticated;
drop trigger if exists saas_appointments_prevent_overlap on public.saas_appointments;
create trigger saas_appointments_prevent_overlap
before insert or update of tenant_id,employee_id,starts_at,ends_at,status
on public.saas_appointments for each row
execute function private.saas_prevent_employee_booking_overlap();
