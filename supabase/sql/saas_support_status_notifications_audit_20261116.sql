-- Notify ticket authors about support decisions and keep a minimal audit trail.
-- Does not email external users or publish messages to another tenant.
create or replace function private.saas_support_status_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status is not distinct from new.status then return new; end if;
 insert into public.saas_notifications(tenant_id,recipient_user_id,category,title,message)
 values(new.tenant_id,new.created_by,'support','Seu chamado foi atualizado',
  'O status do chamado mudou para '||new.status||'.');
 insert into public.saas_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(new.tenant_id,(select auth.uid()),'support.status_changed','support_ticket',new.id::text,
  pg_catalog.jsonb_build_object('from',old.status,'to',new.status));
 return new;
end;
$$;
revoke all on function private.saas_support_status_notification() from public,anon,authenticated;
drop trigger if exists saas_support_status_changed on public.saas_support_tickets;
create trigger saas_support_status_changed
 after update of status on public.saas_support_tickets
 for each row execute function private.saas_support_status_notification();
