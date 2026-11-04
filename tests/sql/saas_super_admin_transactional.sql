-- L&A Royal SaaS | Super Admin AAL1/AAL2 and expulsion/recovery transactional test.
-- This test uses fake auth identities + a local session_replication_role override to seed
-- one fake privileged profile; the override returns to origin immediately.
-- All operations are rolled back. Never run inside a long-lived/shared transaction.
begin;
insert into auth.users(id,email,aud,role,instance_id) values
('bb000000-0000-4000-8000-000000000005','smoke-owner-s@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
('bb000000-0000-4000-8000-000000000006','smoke-admin-s@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
('bb000000-0000-4000-8000-000000000009','smoke-super-s@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.saas_tenants(id,name,slug,business_mode,owner_user_id)
values('bb100000-0000-4000-8000-000000000009','Super Test Shop','la-validation-super-smoke','products','bb000000-0000-4000-8000-000000000005');
insert into public.saas_members(tenant_id,user_id,role,status) values
('bb100000-0000-4000-8000-000000000009','bb000000-0000-4000-8000-000000000005','owner','active'),
('bb100000-0000-4000-8000-000000000009','bb000000-0000-4000-8000-000000000006','admin','active');
-- Only the synthetic Super Admin profile is elevated; triggers are restored immediately.
set local session_replication_role='replica';
update public.saas_profiles set is_platform_super_admin=true where user_id='bb000000-0000-4000-8000-000000000009'::uuid;
set local session_replication_role='origin';
set local role authenticated;
set local request.jwt.claim.sub='bb000000-0000-4000-8000-000000000009';
set local request.jwt.claims='{"sub":"bb000000-0000-4000-8000-000000000009","role":"authenticated","aal":"aal1"}';
do $low_aal$
begin
 if public.saas_is_platform_super_admin() then raise exception 'FAIL AAL1 SUPER PRIVILEGE';end if;
 begin
  perform public.saas_platform_tenants();
  raise exception 'FAIL AAL1 ADMIN RPC';
 exception when others then
  if sqlerrm<>'Acesso administrativo negado' then raise;end if;
 end;
end $low_aal$;
set local request.jwt.claims='{"sub":"bb000000-0000-4000-8000-000000000009","role":"authenticated","aal":"aal2"}';
do $super$
declare tenants jsonb;history jsonb;
begin
 if not public.saas_is_platform_super_admin() then raise exception 'FAIL AAL2 IDENTITY';end if;
 tenants:=public.saas_platform_tenants();
 if not exists(select 1 from jsonb_array_elements(tenants) x where x->>'id'='bb100000-0000-4000-8000-000000000009') then raise exception 'FAIL SUPER TENANT LIST';end if;
 perform public.saas_platform_set_tenant_active('bb100000-0000-4000-8000-000000000009'::uuid,false,'Planned test suspension');
 if (select active from public.saas_tenants where id='bb100000-0000-4000-8000-000000000009'::uuid) then raise exception 'FAIL SUSPEND';end if;
 perform public.saas_platform_set_tenant_active('bb100000-0000-4000-8000-000000000009'::uuid,true,'Planned test reactivation');
 if not (select active from public.saas_tenants where id='bb100000-0000-4000-8000-000000000009'::uuid) then raise exception 'FAIL REACTIVATION';end if;
 perform public.saas_platform_expel_tenant('bb100000-0000-4000-8000-000000000009'::uuid,'Planned test expulsion');
 if (select active from public.saas_tenants where id='bb100000-0000-4000-8000-000000000009'::uuid) then raise exception 'FAIL EXPEL TENANT';end if;
 if (select count(*) from public.saas_members where tenant_id='bb100000-0000-4000-8000-000000000009'::uuid and status='suspended')<>2 then raise exception 'FAIL SUSPEND ALL MEMBERS';end if;
 begin
  perform public.saas_platform_set_tenant_active('bb100000-0000-4000-8000-000000000009'::uuid,true,'Illegal reactivation');
  raise exception 'FAIL ORDINARY REACTIVATION AFTER EXPEL';
 exception when others then
  if sqlerrm<>'Empresa expulsa: use Restaurar acesso do proprietário' then raise;end if;
 end;
 perform public.saas_platform_restore_owner('bb100000-0000-4000-8000-000000000009'::uuid,'Restoring just test owner');
 if not (select active from public.saas_tenants where id='bb100000-0000-4000-8000-000000000009'::uuid) then raise exception 'FAIL RESTORE TENANT';end if;
 if (select status::text from public.saas_members where tenant_id='bb100000-0000-4000-8000-000000000009'::uuid and user_id='bb000000-0000-4000-8000-000000000005'::uuid)<>'active' then raise exception 'FAIL RESTORE OWNER';end if;
 if (select status::text from public.saas_members where tenant_id='bb100000-0000-4000-8000-000000000009'::uuid and user_id='bb000000-0000-4000-8000-000000000006'::uuid)<>'suspended' then raise exception 'FAIL NONOWNER REMAINS SUSPENDED';end if;
 history:=public.saas_platform_audit_filtered(20,0,'bb100000-0000-4000-8000-000000000009'::uuid,null,null,null);
 if (history->>'total')::integer<>4 then raise exception 'FAIL AUDIT COUNT: %',history->>'total';end if;
end $super$;
set local request.jwt.claim.sub='bb000000-0000-4000-8000-000000000005';
set local request.jwt.claims='{"sub":"bb000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}';
do $owner_notice$
declare notice jsonb;
begin
 notice:=public.saas_my_platform_notice();
 if notice->>'title'<>'Acesso do proprietário restaurado' then raise exception 'FAIL OWNER NOTICE';end if;
end $owner_notice$;
reset role;
select 'PASS simulated Super Admin: AAL1 denied / AAL2 allowed / suspend-reactivate-expel-restore / audit / owner notice' as validation;
rollback;
