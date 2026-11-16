-- Server-only disconnection: remove all local merchant tokens and pending authorization attempts.
-- This unlinks the seller from the SaaS, but does NOT claim to revoke permission at Mercado Pago.
create or replace function public.saas_merchant_oauth_disconnect(p_tenant_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare
 v_access uuid;
 v_refresh uuid;
 v_had_credentials boolean := false;
begin
 if p_tenant_id is null then raise exception 'Empresa inválida.'; end if;
 -- Lock tenant for consistency across owner disconnect actions.
 perform 1 from public.saas_tenants where id=p_tenant_id for update;
 if not found then raise exception 'Empresa inválida.'; end if;
 delete from private.saas_merchant_oauth_attempts where tenant_id=p_tenant_id;
 select access_secret_id,refresh_secret_id into v_access,v_refresh
 from private.saas_merchant_oauth_credentials where tenant_id=p_tenant_id for update;
 v_had_credentials := found;
 if v_had_credentials then
  delete from private.saas_merchant_oauth_credentials where tenant_id=p_tenant_id;
  delete from vault.secrets where id in (v_access,v_refresh);
 end if;
 update public.saas_merchant_payment_connections
 set status='revoked',provider_account_label=null,connected_at=null,last_verified_at=null,updated_at=now()
 where tenant_id=p_tenant_id and provider='mercado_pago';
 return v_had_credentials;
end;
$$;
revoke all on function public.saas_merchant_oauth_disconnect(uuid) from public,anon,authenticated;
grant execute on function public.saas_merchant_oauth_disconnect(uuid) to service_role;
