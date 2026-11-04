-- L&A Royal SaaS | Correct operational RPC privileges and mixed-table tenant trigger.
-- Versioned from verified Supabase definitions, 2026-11-04.
-- No changes to customer data. Execute after base schema exists.

revoke all on function private.saas_create_product_impl(uuid,text,text,text,numeric,numeric,integer,text,public.saas_record_status) from public,anon;
revoke all on function private.saas_adjust_inventory_impl(uuid,integer,text,text,uuid) from public,anon;
revoke all on function private.saas_create_tenant(text,text,public.saas_business_mode) from public,anon;

grant execute on function private.saas_create_product_impl(uuid,text,text,text,numeric,numeric,integer,text,public.saas_record_status) to authenticated;
grant execute on function private.saas_adjust_inventory_impl(uuid,integer,text,text,uuid) to authenticated;
grant execute on function private.saas_create_tenant(text,text,public.saas_business_mode) to authenticated;

-- Invoker wrappers remain unchanged. Each private SECURITY DEFINER implementation
-- checks auth.uid() and the authorized company role before performing writes.

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
  select id,name,price,stock_quantity,status,tenant_id into v_product from public.saas_products where id=v_id and tenant_id=p_tenant_id and status='active';
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
$function$;

CREATE OR REPLACE FUNCTION public.saas_enforce_same_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_table_name='saas_orders' then
    if new.customer_id is not null
       and not exists (
         select 1 from public.saas_customers c
         where c.id=new.customer_id and c.tenant_id=new.tenant_id
       ) then raise exception 'customer tenant mismatch'; end if;

  elsif tg_table_name='saas_order_items' then
    if not exists(select 1 from public.saas_orders o where o.id=new.order_id and o.tenant_id=new.tenant_id) then
      raise exception 'order tenant mismatch';
    end if;
    if new.product_id is not null
       and not exists(select 1 from public.saas_products p where p.id=new.product_id and p.tenant_id=new.tenant_id) then
      raise exception 'product tenant mismatch';
    end if;

  elsif tg_table_name='saas_appointments' then
    if new.customer_id is not null
       and not exists(select 1 from public.saas_customers c where c.id=new.customer_id and c.tenant_id=new.tenant_id) then
      raise exception 'customer tenant mismatch';
    end if;
    if new.employee_id is not null
       and not exists(select 1 from public.saas_employees e where e.id=new.employee_id and e.tenant_id=new.tenant_id) then
      raise exception 'employee tenant mismatch';
    end if;
    if new.service_id is not null
       and not exists(select 1 from public.saas_services s where s.id=new.service_id and s.tenant_id=new.tenant_id) then
      raise exception 'service tenant mismatch';
    end if;

  elsif tg_table_name='saas_inventory_movements' then
    if not exists(select 1 from public.saas_products p where p.id=new.product_id and p.tenant_id=new.tenant_id) then
      raise exception 'product tenant mismatch';
    end if;
  else
    raise exception 'unexpected tenant validation table: %',tg_table_name;
  end if;
  return new;
end;
$function$;

-- Order creation checks price/availability but does not lock the product row:
-- employee has SELECT permission but not UPDATE permission under RLS.
-- Stock is decremented only by saas_complete_order, which locks rows with FOR UPDATE
-- and rechecks remaining stock under owner/admin privileges.
