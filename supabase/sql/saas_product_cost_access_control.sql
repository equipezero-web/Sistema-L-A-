-- L&A Royal SaaS: Restrição de custos de produtos por perfil
-- Source of production routines and SELECT privilege changes.
-- Apply as a single migration in environments where these functions already exist.

CREATE OR REPLACE FUNCTION public.saas_ai_business_snapshot(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'tenant', (select jsonb_build_object('name',t.name,'business_mode',t.business_mode,'business_type',t.business_type) from public.saas_tenants t where t.id=p_tenant_id),
    'financial_30d', jsonb_build_object(
      'income', coalesce((select sum(f.amount) from public.saas_financial_entries f where f.tenant_id=p_tenant_id and f.kind='income' and f.occurred_on >= current_date-29),0),
      'expense', coalesce((select sum(f.amount) from public.saas_financial_entries f where f.tenant_id=p_tenant_id and f.kind='expense' and f.occurred_on >= current_date-29),0)
    ),
    'financial_previous_30d', jsonb_build_object(
      'income', coalesce((select sum(f.amount) from public.saas_financial_entries f where f.tenant_id=p_tenant_id and f.kind='income' and f.occurred_on between current_date-59 and current_date-30),0),
      'expense', coalesce((select sum(f.amount) from public.saas_financial_entries f where f.tenant_id=p_tenant_id and f.kind='expense' and f.occurred_on between current_date-59 and current_date-30),0)
    ),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'stock',p.stock_quantity,'status',p.status) order by p.stock_quantity asc) from (select id,tenant_id,name,price,stock_quantity,status from public.saas_products where tenant_id=p_tenant_id and status='active' order by stock_quantity asc limit 30) p),'[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'price',s.price,'duration_minutes',s.duration_minutes) order by s.name) from (select * from public.saas_services where tenant_id=p_tenant_id and status='active' order by created_at desc limit 30) s),'[]'::jsonb),
    'orders_30d', (select count(*) from public.saas_orders o where o.tenant_id=p_tenant_id and o.created_at >= now()-interval '30 days'),
    'completed_orders_30d', (select count(*) from public.saas_orders o where o.tenant_id=p_tenant_id and o.status='completed' and o.created_at >= now()-interval '30 days'),
    'order_revenue_30d', coalesce((select sum(o.total) from public.saas_orders o where o.tenant_id=p_tenant_id and o.status='completed' and o.created_at >= now()-interval '30 days'),0),
    'appointments_30d', (select count(*) from public.saas_appointments a where a.tenant_id=p_tenant_id and a.starts_at >= now()-interval '30 days'),
    'completed_appointments_30d', (select count(*) from public.saas_appointments a where a.tenant_id=p_tenant_id and a.status='completed' and a.starts_at >= now()-interval '30 days'),
    'upcoming_appointments', (select count(*) from public.saas_appointments a where a.tenant_id=p_tenant_id and a.starts_at >= now() and a.starts_at < now()+interval '7 days' and a.status not in ('cancelled','completed','no_show')),
    'active_customers', (select count(*) from public.saas_customers c where c.tenant_id=p_tenant_id and c.status='active'),
    'active_employees', (select count(*) from public.saas_employees e where e.tenant_id=p_tenant_id and e.status='active'),
    'low_stock_count', (select count(*) from public.saas_products p where p.tenant_id=p_tenant_id and p.status='active' and p.stock_quantity <= 5),
    'top_products_30d', coalesce((select jsonb_agg(x order by (x->>'quantity')::numeric desc) from (select jsonb_build_object('name',coalesce(p.name,oi.description),'quantity',sum(oi.quantity),'revenue',sum(oi.total)) x from public.saas_order_items oi join public.saas_orders o on o.id=oi.order_id and o.tenant_id=oi.tenant_id left join public.saas_products p on p.id=oi.product_id and p.tenant_id=oi.tenant_id where oi.tenant_id=p_tenant_id and o.status='completed' and o.created_at>=now()-interval '30 days' group by coalesce(p.name,oi.description) order by sum(oi.quantity) desc limit 5) q),'[]'::jsonb),
    'top_services_30d', coalesce((select jsonb_agg(x order by (x->>'appointments')::numeric desc) from (select jsonb_build_object('name',s.name,'appointments',count(*),'revenue',sum(s.price)) x from public.saas_appointments a join public.saas_services s on s.id=a.service_id and s.tenant_id=a.tenant_id where a.tenant_id=p_tenant_id and a.status='completed' and a.starts_at>=now()-interval '30 days' group by s.name order by count(*) desc limit 5) q),'[]'::jsonb)
  )
  where public.saas_is_platform_super_admin() or public.saas_is_tenant_member(p_tenant_id);
$function$

CREATE OR REPLACE FUNCTION public.saas_complete_order(p_order_id uuid)
 RETURNS saas_orders
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_order public.saas_orders;
  v_item record;
  v_product record;
begin
  select * into v_order from public.saas_orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado.'; end if;
  if not (public.saas_has_tenant_role(v_order.tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]) or public.saas_is_platform_super_admin()) then raise exception 'Sem permissão.'; end if;
  if v_order.status='completed' then return v_order; end if;
  if v_order.status='cancelled' then raise exception 'Pedido cancelado não pode ser concluído.'; end if;
  for v_item in select * from public.saas_order_items where order_id=p_order_id loop
    if v_item.product_id is not null then
      select id,name,price,stock_quantity,status,tenant_id into v_product from public.saas_products where id=v_item.product_id and tenant_id=v_order.tenant_id for update;
      if v_product.id is null then raise exception 'Produto inválido no pedido.'; end if;
      if v_product.stock_quantity < v_item.quantity then raise exception 'Estoque insuficiente para %.',v_product.name; end if;
      update public.saas_products set stock_quantity=stock_quantity-v_item.quantity::integer where id=v_product.id;
      insert into public.saas_inventory_movements(tenant_id,product_id,quantity_delta,reason,reference_type,reference_id,created_by)
      values(v_order.tenant_id,v_product.id,-v_item.quantity::integer,'Venda concluída','order',v_order.id,(select auth.uid()));
    end if;
  end loop;
  update public.saas_orders set status='completed',updated_at=now() where id=p_order_id returning * into v_order;
  insert into public.saas_financial_entries(tenant_id,kind,description,amount,occurred_on,category,reference_type,reference_id,created_by)
  values(v_order.tenant_id,'income','Venda concluída',v_order.total,current_date,'Vendas','order',v_order.id,(select auth.uid()))
  on conflict (tenant_id,reference_type,reference_id) where reference_type is not null and reference_id is not null do nothing;
  return v_order;
end;$function$

CREATE OR REPLACE FUNCTION public.saas_create_order_atomic(p_tenant_id uuid, p_customer_id uuid, p_notes text, p_discount numeric, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_order_id uuid;v_subtotal numeric:=0;v_item jsonb;v_product record;v_qty integer;v_id uuid;v_seen uuid[]:=array[]::uuid[];
begin
 if (select auth.uid()) is null or not public.saas_has_tenant_role(p_tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role,'employee'::public.saas_member_role]) then raise exception 'Sem permissão para criar pedidos.'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Informe entre 1 e 100 produtos.'; end if;
 if p_discount is null or p_discount<0 or p_discount>100000000 then raise exception 'Desconto inválido.'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item->'quantity') <> 'number' or (v_item->>'quantity') !~ '^[0-9]{1,6}$' then raise exception 'Quantidade inválida.'; end if;
  v_id:=(v_item->>'product_id')::uuid;v_qty:=(v_item->>'quantity')::integer;
  if v_qty<1 then raise exception 'Quantidade inválida.'; end if;
  if v_id=any(v_seen) then raise exception 'Produto duplicado. Agrupe as quantidades.'; end if;
  v_seen:=array_append(v_seen,v_id);
  select id,name,price,stock_quantity,status,tenant_id into v_product from public.saas_products where id=v_id and tenant_id=p_tenant_id and status='active' for update;
  if not found then raise exception 'Produto indisponível.'; end if;
  if v_product.stock_quantity<v_qty then raise exception 'Estoque insuficiente para %.',v_product.name; end if;
  v_subtotal:=v_subtotal+v_product.price*v_qty;
 end loop;
 if p_discount>v_subtotal then raise exception 'Desconto superior ao subtotal.'; end if;
 insert into public.saas_orders(tenant_id,customer_id,notes,status,subtotal,discount,total,created_by)
 values(p_tenant_id,p_customer_id,nullif(trim(p_notes),''),'pending',v_subtotal,p_discount,v_subtotal-p_discount,(select auth.uid())) returning id into v_order_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_id:=(v_item->>'product_id')::uuid;v_qty:=(v_item->>'quantity')::integer;
  select id,name,price,stock_quantity,status,tenant_id into v_product from public.saas_products where id=v_id and tenant_id=p_tenant_id;
  insert into public.saas_order_items(tenant_id,order_id,product_id,description,quantity,unit_price,total)
  values(p_tenant_id,v_order_id,v_id,v_product.name,v_qty,v_product.price,v_qty*v_product.price);
 end loop;
 return v_order_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.saas_manager_product_costs(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if (select auth.uid()) is null or
    not (public.saas_has_tenant_role(p_tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]) or public.saas_is_platform_super_admin()) then
   raise exception 'Sem permissão para consultar custos de produtos';
 end if;
 if not exists (select 1 from public.saas_tenants where id=p_tenant_id and active is true) then
   raise exception 'Empresa desativada';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'cost',p.cost)),'[]'::jsonb)
 into result from public.saas_products p where p.tenant_id=p_tenant_id;
 return result;
end $function$


revoke all on function public.saas_manager_product_costs(uuid) from public,anon,authenticated;
grant execute on function public.saas_manager_product_costs(uuid) to authenticated;

-- Remove table-wide SELECT grants. Other grants remain RLS-controlled.
revoke select on table public.saas_products from anon,authenticated;
grant select (
 id,tenant_id,name,description,sku,price,stock_quantity,
 image_url,status,created_at,updated_at,published
) on table public.saas_products to authenticated;
