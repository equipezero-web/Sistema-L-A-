-- L&A Royal SaaS - etapa 46: corrigir ciclo de RLS em saas_profiles
-- RLS de saas_profiles consulta public.saas_is_platform_super_admin().
-- A implementação antiga dessa função também lia saas_profiles como invoker,
-- provocando recursão durante a avaliação de políticas.
-- A verificação privada é SECURITY DEFINER, com search_path vazio.
-- A entrada pública permanece SECURITY INVOKER.
create or replace function private.saas_is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((
      select p.is_platform_super_admin
      from public.saas_profiles p
      where p.user_id = (select auth.uid())
    ), false)
    and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

revoke all on function private.saas_is_platform_super_admin() from public, anon, authenticated;
grant execute on function private.saas_is_platform_super_admin() to authenticated;

create or replace function public.saas_is_platform_super_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.saas_is_platform_super_admin();
$$;

revoke all on function public.saas_is_platform_super_admin() from public, anon, authenticated;
grant execute on function public.saas_is_platform_super_admin() to authenticated;
