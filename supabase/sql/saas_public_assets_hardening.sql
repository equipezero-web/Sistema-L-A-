-- Etapa #47: somente imagens raster públicas, e uploads isolados por tenant
-- O bucket é deliberadamente PUBLICO: URLs de logos/catalogos nao sao privadas.
-- Nenhum objeto existia no bucket no momento desta migration.

update storage.buckets
set allowed_mime_types = array['image/png','image/jpeg','image/webp']::text[],
    file_size_limit = 5242880
where id = 'saas-public-assets';

create or replace function public.saas_can_manage_public_asset(p_path text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
 select case
   when p_path ~ '^tenants/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(branding|products|services|catalog)/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(png|jpg|jpeg|webp)$'
   then public.saas_has_tenant_role(
     split_part(p_path,'/',2)::uuid,
     array['owner'::public.saas_member_role,'admin'::public.saas_member_role]
   ) and exists(
     select 1 from public.saas_tenants t
     where t.id=split_part(p_path,'/',2)::uuid and t.active is true
   )
   else false
 end;
$$;

revoke all on function public.saas_can_manage_public_asset(text) from public, anon, authenticated;
grant execute on function public.saas_can_manage_public_asset(text) to authenticated;

drop policy if exists saas_public_assets_owner_select on storage.objects;
drop policy if exists saas_public_assets_owner_insert on storage.objects;
drop policy if exists saas_public_assets_owner_update on storage.objects;
drop policy if exists saas_public_assets_owner_delete on storage.objects;

create policy saas_public_assets_owner_select on storage.objects
for select to authenticated using (
 bucket_id='saas-public-assets' and public.saas_can_manage_public_asset(name)
);
create policy saas_public_assets_owner_insert on storage.objects
for insert to authenticated with check (
 bucket_id='saas-public-assets' and public.saas_can_manage_public_asset(name)
);
create policy saas_public_assets_owner_update on storage.objects
for update to authenticated using (
 bucket_id='saas-public-assets' and public.saas_can_manage_public_asset(name)
) with check (
 bucket_id='saas-public-assets' and public.saas_can_manage_public_asset(name)
);
create policy saas_public_assets_owner_delete on storage.objects
for delete to authenticated using (
 bucket_id='saas-public-assets' and public.saas_can_manage_public_asset(name)
);
