-- Etapa #61: modelos por empresa no mesmo SaaS, sem importar bancos/segredos externos.
-- Cada modelo reutiliza as tabelas isoladas por tenant_id e a publicação existente.
alter table public.saas_tenants
  add column if not exists template_code text not null default 'generic';
alter table public.saas_public_stores
  add column if not exists template_code text not null default 'generic';

alter table public.saas_tenants
  add constraint saas_tenants_template_code_allowed
  check (template_code in ('generic','barbershop','virtual_store','instagram_orders','business_communication'));
alter table public.saas_public_stores
  add constraint saas_public_stores_template_code_allowed
  check (template_code in ('generic','barbershop','virtual_store','instagram_orders','business_communication'));

-- Existing barber shops, including Lapis Servidor, receive the correct model
-- without touching their service catalog, owner, commercial access or theme.
update public.saas_tenants
set template_code='barbershop'
where template_code='generic' and lower(coalesce(business_type,'')) like '%barbear%';

-- Preserve the audited publication gate, including paid or scoped test access.
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
    secondary_color,background_color,text_color,font_style,layout_id,template_code,updated_at
  ) values (
    t.id,t.name,t.slug,t.business_type,t.business_mode,th.logo_url,th.primary_color,
    th.secondary_color,th.background_color,th.text_color,th.font_style,th.layout_id,t.template_code,now()
  )
  on conflict(tenant_id) do update
  set name=excluded.name,slug=excluded.slug,
      business_type=excluded.business_type,business_mode=excluded.business_mode,
      logo_url=excluded.logo_url,primary_color=excluded.primary_color,
      secondary_color=excluded.secondary_color,background_color=excluded.background_color,
      text_color=excluded.text_color,font_style=excluded.font_style,
      layout_id=excluded.layout_id,template_code=excluded.template_code,updated_at=now();
end;
$fn$;

-- The new onboarding entrypoint is atomic: a failed template write rolls back
-- the entire tenant creation and does not leave an orphaned company.
create or replace function public.saas_onboard_company_template(
  p_name text,
  p_slug text,
  p_business_mode public.saas_business_mode,
  p_business_type text,
  p_template_code text,
  p_logo_url text,
  p_primary_color text,
  p_secondary_color text,
  p_background_color text,
  p_text_color text,
  p_font_style text,
  p_layout_id text,
  p_publish boolean
) returns public.saas_tenants
language plpgsql security invoker set search_path=''
as $fn$
declare
  v_tenant public.saas_tenants;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  if p_template_code is null or p_template_code not in
    ('generic','barbershop','virtual_store','instagram_orders','business_communication')
  then
    raise exception 'invalid business template';
  end if;
  v_tenant := public.saas_onboard_company(
    p_name,p_slug,p_business_mode,p_business_type,p_logo_url,
    p_primary_color,p_secondary_color,p_background_color,p_text_color,
    p_font_style,p_layout_id,p_publish
  );
  update public.saas_tenants
    set template_code=p_template_code
    where id=v_tenant.id and owner_user_id=(select auth.uid())
    returning * into v_tenant;
  if not found then
    raise exception 'owner permission required';
  end if;
  return v_tenant;
end;
$fn$;
revoke all on function public.saas_onboard_company_template(
  text,text,public.saas_business_mode,text,text,text,text,text,text,text,text,text,boolean
) from public,anon,authenticated;
grant execute on function public.saas_onboard_company_template(
  text,text,public.saas_business_mode,text,text,text,text,text,text,text,text,text,boolean
) to authenticated;

-- Refresh public data for stores that were already published before this stage.
-- The resync function checks every tenant's actual publishing eligibility.
select public.saas_sync_public_store(t.id)
from public.saas_tenants t
where t.template_code='barbershop';
