-- Event-driven, minimal notices for tenant managers. Never copy customer PII.
-- Requires saas_operational_support_notifications_20261116.sql.
create or replace function private.saas_notify_tenant_managers()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_title text;v_message text;v_category text;v_status text;
begin
 if tg_op='UPDATE' and old.status::text is not distinct from new.status::text then return new; end if;
 v_status:=new.status::text;
 case tg_table_name
  when 'saas_orders' then
    v_category:='order';v_title:='Atualização de pedido';
    v_message:='Um pedido da sua empresa está com status '||v_status||'.';
  when 'saas_appointments','saas_barber_requests' then
    v_category:='booking';v_title:='Atualização de agendamento';
    v_message:='Uma solicitação de agendamento está com status '||v_status||'.';
  when 'saas_subscriptions' then
    v_category:='account';v_title:='Atualização da assinatura';
    v_message:='O status da assinatura do SaaS foi atualizado para '||v_status||'.';
  else return new;
 end case;
 insert into public.saas_notifications(tenant_id,recipient_user_id,category,title,message)
 select new.tenant_id,m.user_id,v_category,v_title,v_message
 from public.saas_members m
 where m.tenant_id=new.tenant_id
  and m.status::text='active'
  and m.role::text in ('owner','admin');
 return new;
end;
$$;
revoke all on function private.saas_notify_tenant_managers() from public,anon,authenticated;

drop trigger if exists saas_notify_order_change on public.saas_orders;
create trigger saas_notify_order_change after insert or update of status
 on public.saas_orders for each row execute function private.saas_notify_tenant_managers();

drop trigger if exists saas_notify_appointment_change on public.saas_appointments;
create trigger saas_notify_appointment_change after insert or update of status
 on public.saas_appointments for each row execute function private.saas_notify_tenant_managers();

drop trigger if exists saas_notify_booking_request_change on public.saas_barber_requests;
create trigger saas_notify_booking_request_change after insert or update of status
 on public.saas_barber_requests for each row execute function private.saas_notify_tenant_managers();

drop trigger if exists saas_notify_subscription_change on public.saas_subscriptions;
create trigger saas_notify_subscription_change after insert or update of status
 on public.saas_subscriptions for each row execute function private.saas_notify_tenant_managers();
