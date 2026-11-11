-- Etapa #55: restore the user-scoped MFA preference RPC without granting direct
-- UPDATE on protected profile security columns.
-- This migration is intentionally non-destructive: keep existing grants for profiles.
create or replace function private.saas_set_mfa_preference(p_preference text)
returns void
language plpgsql volatile security definer set search_path=''
as $function$
declare
  v_uid uuid;
  v_aal text;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_preference is null or p_preference not in ('enabled','declined') then
    raise exception 'invalid mfa preference';
  end if;
  v_aal := coalesce((select auth.jwt() ->> 'aal'), 'aal1');
  if p_preference = 'enabled' and v_aal <> 'aal2' then
    raise exception 'MFA must be verified before it can be marked enabled';
  end if;
  update public.saas_profiles
    set mfa_preference = p_preference, mfa_prompted_at = now()
    where user_id = v_uid;
  if not found then
    raise exception 'profile not found';
  end if;
end;
$function$;

-- The privileged implementation remains in the private (non-Data API) schema.
revoke all on function private.saas_set_mfa_preference(text) from public, anon, authenticated;
grant execute on function private.saas_set_mfa_preference(text) to authenticated;

-- Keep the existing public RPC signature; the wrapper itself has caller privileges.
create or replace function public.saas_set_mfa_preference(p_preference text)
returns void
language sql volatile security invoker set search_path=''
as $function$
  select private.saas_set_mfa_preference(p_preference);
$function$;
revoke all on function public.saas_set_mfa_preference(text) from public, anon, authenticated;
grant execute on function public.saas_set_mfa_preference(text) to authenticated;
