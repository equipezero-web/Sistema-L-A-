import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/sql/saas_online_order_intents_20261116.sql','utf8');
const storefront=readFileSync('store/loja-virtual.html','utf8');
const ui=readFileSync('assets/js/virtual-storefront.js','utf8');
test('Order intents are private and default-disabled for every tenant',()=>{
 assert.match(sql,/private\.saas_online_order_activation/);
 assert.match(sql,/enabled boolean not null default false/);
 assert.match(sql,/private\.saas_online_order_intents/);
 assert.match(sql,/alter table private\.saas_online_order_activation enable row level security/);
 assert.match(sql,/alter table private\.saas_online_order_intents enable row level security/);
 assert.match(sql,/revoke all on private\.saas_online_order_activation,private\.saas_online_order_intents from public,anon,authenticated/);
 assert.match(sql,/where a\.tenant_id=p_tenant_id and a\.enabled/);
 assert.match(sql,/Checkout online ainda não habilitado/);
});
test('Idempotency is tenant-scoped and conflicting cart keys are rejected',()=>{
 assert.match(sql,/unique\(tenant_id,request_key\)/);
 assert.match(sql,/request_fingerprint/);
 assert.match(sql,/md5\(v_normalized::text\)/);
 assert.match(sql,/Chave de idempotência reutilizada com outro carrinho/);
 assert.match(sql,/on conflict\(tenant_id,request_key\) do nothing/);
 assert.match(sql,/select v_existing\.id,v_existing\.subtotal,v_existing\.expires_at,true/);
});
test('Server validates quantity, prices, published products, availability and tenant',()=>{
 assert.match(sql,/jsonb_array_length\(p_items\) not between 1 and 20/);
 assert.match(sql,/v_qty not between 1 and 99/);
 assert.match(sql,/v_total_qty>200/);
 assert.match(sql,/Produto duplicado/);
 assert.match(sql,/p\.id=v_product_id and p\.tenant_id=p_tenant_id for share/);
 assert.match(sql,/v_row\.status::text<>'active'/);
 assert.match(sql,/not v_row\.published/);
 assert.match(sql,/v_row\.stock_quantity<v_qty/);
 assert.match(sql,/v_subtotal:=v_subtotal\+\(v_row\.price\*v_qty\)/);
 assert.match(sql,/s\.tenant_id=p_tenant_id and s\.template_code='virtual_store'/);
 assert.match(sql,/return query select v_existing\.id/);
});
test('Only service role can call the preparation RPC; storefront remains informational',()=>{
 assert.match(sql,/revoke all on function public\.saas_online_order_prepare\(uuid,uuid,jsonb\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.saas_online_order_prepare\(uuid,uuid,jsonb\) to service_role/);
 assert.match(storefront,/Finalizar compra — em integração/);
 assert.match(storefront,/disabled aria-describedby="checkoutNotice"/);
 assert.match(ui,/saas-store-quote/);
 assert.doesNotMatch(ui,/saas_online_order_prepare|saas_create_order_atomic/);
 assert.doesNotMatch(sql,/insert into public\.saas_orders|update public\.saas_products|perform private\.saas_adjust_inventory_impl/);
});
