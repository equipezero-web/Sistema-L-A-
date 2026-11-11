-- Etapa #65: editor completo da aparência por empresa.
-- Nenhuma informação privada, assinatura ou preço de cobrança entra no espelho público.
alter table public.saas_store_themes
 add column if not exists design_settings jsonb not null default '{}'::jsonb;
alter table public.saas_public_stores
 add column if not exists design_settings jsonb not null default '{}'::jsonb;
alter table public.saas_store_themes
 add constraint saas_design_settings_safe_shape
 check (jsonb_typeof(design_settings)='object' and octet_length(design_settings::text)<=24000);
alter table public.saas_public_stores
 add constraint saas_public_design_settings_safe_shape
 check (jsonb_typeof(design_settings)='object' and octet_length(design_settings::text)<=24000);

create or replace function public.saas_sync_public_store(p_tenant_id uuid)
returns void language plpgsql security definer set search_path=''
as $fn$
declare
 t public.saas_tenants%rowtype;
 th public.saas_store_themes%rowtype;
begin
 select * into t from public.saas_tenants where id=p_tenant_id;
 select * into th from public.saas_store_themes where tenant_id=p_tenant_id;
 if t.id is null or th.tenant_id is null or not t.active
    or not t.onboarding_completed or not th.published
    or not public.saas_has_commercial_access(p_tenant_id) then
   delete from public.saas_public_stores where tenant_id=p_tenant_id;
   return;
 end if;
 insert into public.saas_public_stores(
   tenant_id,name,slug,business_type,business_mode,logo_url,primary_color,
   secondary_color,background_color,text_color,font_style,layout_id,template_code,
   design_settings,updated_at
 ) values (
   t.id,t.name,t.slug,t.business_type,t.business_mode,th.logo_url,th.primary_color,
   th.secondary_color,th.background_color,th.text_color,th.font_style,th.layout_id,
   t.template_code,th.design_settings,now()
 )
 on conflict(tenant_id) do update
 set name=excluded.name,slug=excluded.slug,
     business_type=excluded.business_type,business_mode=excluded.business_mode,
     logo_url=excluded.logo_url,primary_color=excluded.primary_color,
     secondary_color=excluded.secondary_color,background_color=excluded.background_color,
     text_color=excluded.text_color,font_style=excluded.font_style,
     layout_id=excluded.layout_id,template_code=excluded.template_code,
     design_settings=excluded.design_settings,updated_at=now();
end;
$fn$;
-- Existing authorized syncing remains in effect, including trial access and publication.
select public.saas_sync_public_store(tenant_id) from public.saas_store_themes
where published=true;
