-- Transactional first-login test. All fictitious identities/tenants are rolled back.
begin;
insert into auth.users(id,email,aud,role,instance_id) values
('cd000000-0000-4000-8000-000000000001','new-smoke@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
('cd000000-0000-4000-8000-000000000002','owner-smoke@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
('cd000000-0000-4000-8000-000000000003','employee-smoke@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.saas_tenants(id,name,slug,business_mode,owner_user_id)
values('cd100000-0000-4000-8000-000000000001','Smoke Existing Tenant','la-smoke-existing-20261106','products','cd000000-0000-4000-8000-000000000002');
insert into public.saas_members(tenant_id,user_id,role,status) values
('cd100000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000002','owner','active'),
('cd100000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000003','employee','suspended');
set local role authenticated;
set local request.jwt.claim.sub='cd000000-0000-4000-8000-000000000001';
set local request.jwt.claims='{"sub":"cd000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
do $newuser$
declare result jsonb; onboarding public.saas_tenants;
begin
 result:=public.saas_my_access_summary();
 if result->>'has_any_membership'<>'false' or result->>'has_owned_tenant'<>'false' or result->>'is_platform_super_admin'<>'false' then
   raise exception 'FAIL NEW USER SUMMARY: %',result;
 end if;
 onboarding:=public.saas_onboard_company('Smoke New Business','la-smoke-new-20261106','products','Livraria',null,'#D4AF37','#F1D477','#08090C','#FFFFFF','Inter','royal-classic',false);
 if onboarding.id is null or onboarding.onboarding_completed is not true or onboarding.business_type<>'Livraria' then
   raise exception 'FAIL ONBOARDING';
 end if;
 if (select count(*) from public.saas_members where tenant_id=onboarding.id and user_id=auth.uid() and role='owner' and status='active')<>1 then
   raise exception 'FAIL OWNER MEMBERSHIP';
 end if;
 if (select published from public.saas_store_themes where tenant_id=onboarding.id) then
   raise exception 'FAIL PREMATURE PUBLICATION';
 end if;
 result:=public.saas_my_access_summary();
 if result->>'has_any_membership'<>'true' or result->>'has_owned_tenant'<>'true' then
   raise exception 'FAIL POST-ONBOARDING SUMMARY';
 end if;
end $newuser$;
select set_config('request.jwt.claim.sub','cd000000-0000-4000-8000-000000000002',true);
do $existing$ begin
 if public.saas_my_access_summary()->>'has_owned_tenant'<>'true' then
   raise exception 'FAIL EXISTING OWNER';
 end if;
end $existing$;
select set_config('request.jwt.claim.sub','cd000000-0000-4000-8000-000000000003',true);
do $suspended$ begin
 if public.saas_my_access_summary()->>'has_any_membership'<>'true' or public.saas_my_access_summary()->>'has_owned_tenant'<>'false' then
   raise exception 'FAIL SUSPENDED EMPLOYEE';
 end if;
end $suspended$;
reset role;
select 'PASS: first login, onboarding, existing owner, suspended employee, unpublished tenant' as validation;
rollback;
