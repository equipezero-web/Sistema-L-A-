-- L&A Royal SaaS | Validated sale completion and atomic stock movement (2026-11-04)
-- Uses the existing private inventory function rather than broadening table privileges.

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
      perform private.saas_adjust_inventory_impl(
        v_product.id,-v_item.quantity::integer,'Venda concluída','order',v_order.id
      );
    end if;
  end loop;
  update public.saas_orders set status='completed',updated_at=now() where id=p_order_id returning * into v_order;
  insert into public.saas_financial_entries(tenant_id,kind,description,amount,occurred_on,category,reference_type,reference_id,created_by)
  values(v_order.tenant_id,'income','Venda concluída',v_order.total,current_date,'Vendas','order',v_order.id,(select auth.uid()))
  on conflict (tenant_id,reference_type,reference_id) where reference_type is not null and reference_id is not null do nothing;
  return v_order;
end;$function$
