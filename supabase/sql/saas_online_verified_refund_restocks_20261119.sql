-- Reconcile an externally verified refund/chargeback against a previously
-- settled order. NEVER issues a refund to Mercado Pago: provider refund/chargeback
-- must be confirmed separately before calling this service-only RPC.
create or replace function public.saas_online_reverse_verified_payment(p_intent_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
 v_intent private.saas_online_order_intents%rowtype;
 v_receipt private.saas_online_payment_receipts%rowtype;
 v_settlement private.saas_online_paid_order_settlements%rowtype;
 v_item record;
 v_delivery text;
 v_order_status text;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role'
 then raise exception 'Backend exclusivo.'; end if;
 if p_intent_id is null then return 'invalid'; end if;
 -- Lock order-intent first, consistent with approved-payment settlement.
 select * into v_intent from private.saas_online_order_intents
  where id=p_intent_id for update;
 if not found then return 'not_found'; end if;
 select * into v_settlement from private.saas_online_paid_order_settlements
  where intent_id=p_intent_id and tenant_id=v_intent.tenant_id for update;
 if not found then return 'no_settlement'; end if;
 if v_settlement.state='reversed' then return 'reversed'; end if;
 if v_settlement.state='refund_review' then return 'refund_review'; end if;
 select * into v_receipt from private.saas_online_payment_receipts
  where intent_id=p_intent_id and tenant_id=v_intent.tenant_id
   and provider='mercado_pago' and provider_payment_id=v_settlement.provider_payment_id;
 if not found or v_receipt.payment_status not in ('refunded','charged_back')
 then return 'not_refunded'; end if;

 if v_settlement.state='needs_review' then
  -- No order was generated and nothing was deducted.
  update private.saas_online_paid_order_settlements
    set state='reversed',review_reason=null,updated_at=now()
    where intent_id=p_intent_id;
  return 'reversed';
 end if;
 if v_settlement.state<>'fulfilled' or v_settlement.order_id is null
 then return 'invalid_settlement'; end if;
 select status::text into v_order_status from public.saas_orders
   where id=v_settlement.order_id and tenant_id=v_settlement.tenant_id for update;
 if not found then return 'missing_order'; end if;
 select state into v_delivery from public.saas_order_fulfillment
   where order_id=v_settlement.order_id and tenant_id=v_settlement.tenant_id for update;
 -- Never automatically restock a shipped/delivered/returned parcel.
 if v_delivery in ('shipped','delivered','returned')
   or v_order_status='completed'
 then
   update private.saas_online_paid_order_settlements
     set state='refund_review',review_reason='parcel_already_dispatched',
       updated_at=now() where intent_id=p_intent_id;
   return 'refund_review';
 end if;
 if v_order_status not in ('confirmed','pending')
 then
   update private.saas_online_paid_order_settlements
     set state='refund_review',review_reason='unexpected_order_status',
       updated_at=now() where intent_id=p_intent_id;
   return 'refund_review';
 end if;

 perform pg_catalog.set_config('app.saas_verified_commerce','allowed',true);
 update public.saas_orders set status='cancelled'
   where id=v_settlement.order_id and tenant_id=v_settlement.tenant_id;
 for v_item in
  select oi.product_id,oi.quantity from public.saas_order_items oi
  where oi.tenant_id=v_settlement.tenant_id and oi.order_id=v_settlement.order_id
  order by oi.product_id for update
 loop
  -- The original product must still exist for audited restocking.
  if v_item.product_id is null or v_item.quantity<>trunc(v_item.quantity) then
    raise exception 'Produto excluído ou quantidade incompatível com reposição.';
  end if;
  perform pg_catalog.set_config('app.saas_inventory_adjustment','allowed',true);
  update public.saas_products set stock_quantity=stock_quantity+v_item.quantity
   where id=v_item.product_id and tenant_id=v_settlement.tenant_id;
  if not found then raise exception 'Produto original ausente; revisão manual obrigatória.'; end if;
  insert into public.saas_inventory_movements
    (tenant_id,product_id,quantity_delta,reason,reference_type,reference_id)
  values(v_settlement.tenant_id,v_item.product_id,v_item.quantity,
    'Estorno verificado de pedido online','saas_online_refund',v_settlement.order_id);
  perform pg_catalog.set_config('app.saas_inventory_adjustment','',true);
 end loop;
 update private.saas_online_paid_order_settlements
   set state='reversed',updated_at=now(),review_reason=null
   where intent_id=p_intent_id;
 perform pg_catalog.set_config('app.saas_verified_commerce','',true);
 return 'reversed';
end; $$;
revoke all on function public.saas_online_reverse_verified_payment(uuid)
  from public,anon,authenticated;
grant execute on function public.saas_online_reverse_verified_payment(uuid) to service_role;
