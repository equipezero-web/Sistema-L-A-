-- L&A Royal SaaS | Teste negativo de permissões sem dados de clientes.
-- EXECUTE em uma conexão administrativa do banco. Nenhuma alteração permanente.
-- Estas verificações NÃO substituem testes com sessões reais dos quatro perfis.

begin;
set local role authenticated;

-- Leitura operacional e planejamento de edição não devem exigir SELECT(cost).
select id,name,price,stock_quantity from public.saas_products limit 0;
explain (costs off)
update public.saas_products set cost=4.50,price=10,name='Teste'
where id='00000000-0000-0000-0000-000000000001'::uuid
returning id,tenant_id,name,description,sku,price,stock_quantity,image_url,status,created_at,updated_at,published;

do $test$
declare v_fake_tenant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  begin
    perform cost from public.saas_products limit 1;
    raise exception 'TEST FAILED: cost is readable without managerial authorization';
  exception when insufficient_privilege then null;
  end;

  if public.saas_ai_business_snapshot(v_fake_tenant) is not null then
    raise exception 'TEST FAILED: raw AI data exposed without valid tenant membership';
  end if;
  if public.saas_ai_role_snapshot(v_fake_tenant) is not null then
    raise exception 'TEST FAILED: role AI data exposed without valid tenant membership';
  end if;

  begin
    perform public.saas_manager_product_costs(v_fake_tenant);
    raise exception 'TEST FAILED: manager costs returned without authentication';
  exception when others then
    if sqlerrm <> 'Sem permissão para consultar custos de produtos' then raise; end if;
  end;

  begin
    perform public.saas_create_order_atomic(v_fake_tenant,null,null,0,'[]'::jsonb);
    raise exception 'TEST FAILED: unauthenticated order creation';
  exception when others then
    if sqlerrm <> 'Sem permissão para criar pedidos.' then raise; end if;
  end;
end $test$;
rollback;
