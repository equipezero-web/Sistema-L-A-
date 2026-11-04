-- L&A Royal SaaS | Correctly timestamp platform actions and owner notices (2026-11-04)
-- Explicit clock_timestamp() preserves decision order even within one transaction.

CREATE OR REPLACE FUNCTION public.saas_my_platform_notice()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select to_jsonb(n) from public.saas_platform_notices n
 join public.saas_tenants t on t.id=n.tenant_id
 where t.owner_user_id=(select auth.uid())
 order by n.created_at desc,n.id desc limit 1;
$function$

CREATE OR REPLACE FUNCTION public.saas_platform_expel_tenant(p_tenant_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.saas_is_platform_super_admin() then raise exception 'Acesso administrativo negado';end if;
 if p_reason is null or length(trim(p_reason))<10 or length(p_reason)>1000 then raise exception 'Informe motivo com 10 a 1000 caracteres';end if;
 perform 1 from public.saas_tenants where id=p_tenant_id for update;
 if not found then raise exception 'Empresa não encontrada';end if;
 update public.saas_tenants set active=false,updated_at=now() where id=p_tenant_id;
 update public.saas_members set status='suspended',updated_at=now() where tenant_id=p_tenant_id and status='active';
 insert into public.saas_platform_actions(tenant_id,actor_id,action,reason,created_at) values(p_tenant_id,(select auth.uid()),'expel',trim(p_reason),clock_timestamp());
 insert into public.saas_platform_notices(tenant_id,title,message,created_at) values(p_tenant_id,'Acesso à plataforma encerrado',trim(p_reason),clock_timestamp());
 perform public.saas_sync_public_store(p_tenant_id);
end $function$

CREATE OR REPLACE FUNCTION public.saas_platform_restore_owner(p_tenant_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_last text;
begin
 if not public.saas_is_platform_super_admin() then raise exception 'Acesso negado'; end if;
 if length(trim(coalesce(p_reason,'')))<10 or length(p_reason)>1000 then raise exception 'Motivo inválido'; end if;
 select owner_user_id into v_owner from public.saas_tenants where id=p_tenant_id for update;
 if not found then raise exception 'Empresa não encontrada'; end if;
 select action into v_last from public.saas_platform_actions where tenant_id=p_tenant_id and action in ('expel','restore') order by created_at desc,id desc limit 1;
 if v_last is distinct from 'expel' then raise exception 'Não há expulsão pendente'; end if;
 update public.saas_tenants set active=true,updated_at=now() where id=p_tenant_id;
 update public.saas_members set status='active',updated_at=now() where tenant_id=p_tenant_id and user_id=v_owner and role='owner' and status='suspended';
 if not found then raise exception 'Vínculo do proprietário não encontrado'; end if;
 insert into public.saas_platform_actions(tenant_id,actor_id,action,reason,created_at) values(p_tenant_id,auth.uid(),'restore',trim(p_reason),clock_timestamp());
 insert into public.saas_platform_notices(tenant_id,title,message,created_at) values(p_tenant_id,'Acesso do proprietário restaurado',trim(p_reason),clock_timestamp());
 perform public.saas_sync_public_store(p_tenant_id);
end $function$

CREATE OR REPLACE FUNCTION public.saas_platform_set_tenant_active(p_tenant_id uuid, p_active boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_last text;
begin
 if not public.saas_is_platform_super_admin() then raise exception 'Acesso administrativo negado'; end if;
 if length(trim(coalesce(p_reason,'')))<10 or length(p_reason)>1000 then raise exception 'Informe um motivo com 10 a 1000 caracteres'; end if;
 perform 1 from public.saas_tenants where id=p_tenant_id for update;
 if not found then raise exception 'Empresa não encontrada'; end if;
 if p_active then
  select action into v_last from public.saas_platform_actions where tenant_id=p_tenant_id and action in ('expel','restore') order by created_at desc,id desc limit 1;
  if v_last='expel' then raise exception 'Empresa expulsa: use Restaurar acesso do proprietário'; end if;
 end if;
 update public.saas_tenants set active=p_active,updated_at=now() where id=p_tenant_id;
 insert into public.saas_platform_actions(tenant_id,actor_id,action,reason,created_at) values(p_tenant_id,auth.uid(),case when p_active then 'reactivate' else 'suspend' end,trim(p_reason),clock_timestamp());
 insert into public.saas_platform_notices(tenant_id,title,message,created_at) values(p_tenant_id,case when p_active then 'Loja reativada' else 'Loja desativada pela plataforma' end,trim(p_reason),clock_timestamp());
 perform public.saas_sync_public_store(p_tenant_id);
end $function$
