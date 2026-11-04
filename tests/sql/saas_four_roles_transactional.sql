-- L&A Royal SaaS | Transactional integration test of four account contexts.
-- Never commit this script. All accounts, tenants, sales and movements are fictitious
-- and rolled back. Real browser login and real MFA remain outside this SQL simulation.
begin;
insert into auth.users(id,email,aud,role,instance_id) values
('bb000000-0000-4000-8000-000000000001','smoke-1@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
('bb000000-0000-4000-8000-000000000002','smoke-2@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
('bb000000-0000-4000-8000-000000000003','smoke-3@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
('bb000000-0000-4000-8000-000000000004','smoke-4@validation.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.saas_tenants(id,name,slug,business_mode,owner_user_id) values
('bb100000-0000-4000-8000-000000000001','Test Shop Alpha','la-validation-smoke-alpha','products','bb000000-0000-4000-8000-000000000001'),
('bb100000-0000-4000-8000-000000000002','Test Shop Beta','la-validation-smoke-beta','products','bb000000-0000-4000-8000-000000000004');
insert into public.saas_members(tenant_id,user_id,role,status) values
('bb100000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','owner','active'),
('bb100000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000002','admin','active'),
('bb100000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000003','employee','active'),
('bb100000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000004','owner','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"bb000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('smoke.product',
 (select id::text from public.saas_create_product('bb100000-0000-4000-8000-000000000001'::uuid,'Test Shampoo',null,'SMOKE-SKU',50,20,10,null,'active')),true);
do $owner$
declare costs jsonb;
begin
 costs:=public.saas_manager_product_costs('bb100000-0000-4000-8000-000000000001'::uuid);
 if not exists(select 1 from jsonb_array_elements(costs) c where c->>'id'=current_setting('smoke.product') and (c->>'cost')::numeric=20) then
  raise exception 'FAIL OWNER COSTS';end if;
 if (select stock_quantity from public.saas_products where id=current_setting('smoke.product')::uuid)<>10 then
  raise exception 'FAIL INITIAL STOCK';end if;
 begin
  update public.saas_tenants set active=false where id='bb100000-0000-4000-8000-000000000001'::uuid;
  raise exception 'FAIL OWNER TENANT DEACTIVATION';
 exception when others then
  if sqlerrm<>'Somente o Super Admin pode alterar a ativação da empresa' then raise;end if;
 end;
 begin
  update public.saas_members set role='owner' where tenant_id='bb100000-0000-4000-8000-000000000001'::uuid and user_id='bb000000-0000-4000-8000-000000000003'::uuid;
  raise exception 'FAIL OWNER DUPLICATION';
 exception when others then
  if sqlerrm<>'O papel de proprietário deve corresponder ao proprietário registrado da empresa' then raise;end if;
 end;
end $owner$;
select set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"bb000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
do $staff$
declare snap jsonb;
begin
 if (select count(*) from public.saas_products where tenant_id='bb100000-0000-4000-8000-000000000001'::uuid)<>1 then
  raise exception 'FAIL STAFF CATALOG';end if;
 begin
  execute 'select cost from public.saas_products limit 1';
  raise exception 'FAIL STAFF DIRECT COST';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.saas_manager_product_costs('bb100000-0000-4000-8000-000000000001'::uuid);
  raise exception 'FAIL STAFF COSTS RPC';
 exception when others then
  if sqlerrm<>'Sem permissão para consultar custos de produtos' then raise;end if;
 end;
 begin
  perform public.saas_adjust_inventory(current_setting('smoke.product')::uuid,1,'Unauthorized stock',null,null);
  raise exception 'FAIL STAFF STOCK CHANGE';
 exception when others then
  if sqlerrm<>'insufficient permission' then raise;end if;
 end;
 snap:=public.saas_ai_business_snapshot('bb100000-0000-4000-8000-000000000001'::uuid);
 if snap ? 'financial_30d' or snap ? 'financial_previous_30d' or snap ? 'order_revenue_30d' then
  raise exception 'FAIL STAFF AI FINANCIAL EXPOSURE';end if;
 if (snap->'top_products_30d'->0) ? 'revenue' then
  raise exception 'FAIL STAFF PRODUCT REVENUE';end if;
end $staff$;
select set_config('smoke.order',
 public.saas_create_order_atomic('bb100000-0000-4000-8000-000000000001'::uuid,null,'Smoke pending sale',5,
   jsonb_build_array(jsonb_build_object('product_id',current_setting('smoke.product'),'quantity',2)))::text,true);
do $create_appt$
declare appt_id uuid;
begin
 insert into public.saas_appointments(tenant_id,starts_at,ends_at,price,status)
 values('bb100000-0000-4000-8000-000000000001'::uuid,now()+interval '2 days',now()+interval '2 days 1 hour',80,'pending')
 returning id into appt_id;
 perform set_config('smoke.appointment',appt_id::text,true);
end $create_appt$;
do $pending$
begin
 if (select status::text from public.saas_orders where id=current_setting('smoke.order')::uuid)<>'pending' then
  raise exception 'FAIL PENDING ORDER STATUS';end if;
 if (select total from public.saas_orders where id=current_setting('smoke.order')::uuid)<>95 then
  raise exception 'FAIL ORDER TOTAL';end if;
 begin
  perform public.saas_complete_order(current_setting('smoke.order')::uuid);
  raise exception 'FAIL STAFF ORDER COMPLETION';
 exception when others then
  if sqlerrm<>'Sem permissão.' then raise;end if;
 end;
 begin
  perform public.saas_complete_appointment(current_setting('smoke.appointment')::uuid);
  raise exception 'FAIL STAFF APPOINTMENT COMPLETION';
 exception when others then
  if sqlerrm<>'Sem permissão.' then raise;end if;
 end;
end $pending$;
select set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"bb000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
do $manager$
declare costs jsonb;snap jsonb;
begin
 costs:=public.saas_manager_product_costs('bb100000-0000-4000-8000-000000000001'::uuid);
 if not exists(select 1 from jsonb_array_elements(costs) c where c->>'id'=current_setting('smoke.product') and (c->>'cost')::numeric=20) then
  raise exception 'FAIL ADMIN COSTS';end if;
 perform public.saas_adjust_inventory(current_setting('smoke.product')::uuid,3,'Manager restock',null,null);
 if (select stock_quantity from public.saas_products where id=current_setting('smoke.product')::uuid)<>13 then
  raise exception 'FAIL STOCK RESTOCK';end if;
 perform public.saas_complete_order(current_setting('smoke.order')::uuid);
 perform public.saas_complete_appointment(current_setting('smoke.appointment')::uuid);
 if (select stock_quantity from public.saas_products where id=current_setting('smoke.product')::uuid)<>11 then
  raise exception 'FAIL SALE STOCK DEBIT';end if;
 if (select status::text from public.saas_orders where id=current_setting('smoke.order')::uuid)<>'completed' then
  raise exception 'FAIL ORDER STATUS COMPLETED';end if;
 if (select count(*) from public.saas_financial_entries where tenant_id='bb100000-0000-4000-8000-000000000001'::uuid and amount in (95,80))<>2 then
  raise exception 'FAIL AUTOMATIC FINANCIAL ENTRIES';end if;
 snap:=public.saas_ai_business_snapshot('bb100000-0000-4000-8000-000000000001'::uuid);
 if not (snap ? 'financial_30d') then raise exception 'FAIL ADMIN AI ACCESS';end if;
end $manager$;
-- Recheck employee data visibility after completed sales have generated real test revenue.
select set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"bb000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
do $staff_after_sale$
declare snap jsonb;role_snap jsonb;
begin
 if (select count(*) from public.saas_financial_entries where tenant_id='bb100000-0000-4000-8000-000000000001'::uuid)<>0 then
  raise exception 'FAIL EMPLOYEE FINANCIAL TABLE ISOLATION';end if;
 snap:=public.saas_ai_business_snapshot('bb100000-0000-4000-8000-000000000001'::uuid);
 role_snap:=public.saas_ai_role_snapshot('bb100000-0000-4000-8000-000000000001'::uuid);
 if snap ? 'financial_30d' or snap ? 'order_revenue_30d' or role_snap ? 'financial_30d' then
  raise exception 'FAIL EMPLOYEE FINANCIAL SNAPSHOT AFTER SALE';end if;
 if (snap->'top_products_30d'->0) ? 'revenue' or (role_snap->'top_services_30d'->0) ? 'revenue' then
  raise exception 'FAIL EMPLOYEE RANKING REVENUE AFTER SALE';end if;
 if (snap->>'completed_orders_30d')::integer<>1 then
  raise exception 'FAIL EMPLOYEE OPERATIONAL METRICS AFTER SALE';end if;
end $staff_after_sale$;
select set_config('request.jwt.claim.sub','bb000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"bb000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',true);
do $other_tenant$
begin
 if (select count(*) from public.saas_products where tenant_id='bb100000-0000-4000-8000-000000000001'::uuid)<>0 then
  raise exception 'FAIL TENANT CATALOG ISOLATION';end if;
 begin
  perform public.saas_manager_product_costs('bb100000-0000-4000-8000-000000000001'::uuid);
  raise exception 'FAIL OTHER TENANT COST RPC';
 exception when others then
  if sqlerrm<>'Sem permissão para consultar custos de produtos' then raise;end if;
 end;
 begin
  perform public.saas_create_order_atomic('bb100000-0000-4000-8000-000000000001'::uuid,null,null,0,
   jsonb_build_array(jsonb_build_object('product_id',current_setting('smoke.product'),'quantity',1)));
  raise exception 'FAIL OTHER TENANT SALE';
 exception when others then
  if sqlerrm<>'Sem permissão para criar pedidos.' then raise;end if;
 end;
end $other_tenant$;
reset role;
select 'PASS: 4 roles simulated; product, sale, stock, appointments, finance, AI, tenant isolation' as validation;
rollback;
