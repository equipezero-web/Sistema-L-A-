import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync('store/loja-virtual.html','utf8');
const router=readFileSync('store/index.html','utf8');
const code=readFileSync('assets/js/virtual-storefront.js','utf8');
const executable=code.replace(/^import\s*\{[^}]+\}\s*from\s*'[^']+';/,'');
const products=[
 {id:'p-one',item_type:'product',name:'Camisa Premium',description:'Algodão',price:49.9,image_url:null,in_stock:true},
 {id:'p-two',item_type:'product',name:'Bolsa',description:'Bolsa resistente',price:79.9,image_url:'javascript:alert(1)',in_stock:false}
];
const published={
 tenant_id:'tenant-xyz',slug:'loja-teste',name:'Marca da Empresa',
 template_code:'virtual_store',primary_color:'#D4AF37',secondary_color:'#13264D',
 background_color:'#07101F',text_color:'#FFFFFF',font_style:'Lato',logo_url:null,
 design_settings:{themeGradients:{primary:{mode:'gradient',start:'#D4AF37',end:'#F4DC8A',angle:135}}}
};
function makeNode(tag='div',id=''){
 const events={};
 const node={id,tag,style:{setProperty(k,v){this[k]=v}},hidden:false,disabled:false,
  value:'',textContent:'',children:[],dataset:{},listeners:events,
  addEventListener(key,fn){events[key]=fn},
  focus(){},append(...a){this.children.push(...a)},replaceChildren(...a){this.children=[...a]},
  setAttribute(){},
  closest(){return this}
 };
 return node;
}
async function scenario({store=published,items=products,slug='loja-teste'}={}){
 const els=new Map(),calls=[],warnings=[],quotes=[];
 const get=id=>{if(!els.has(id))els.set(id,makeNode('div',id));return els.get(id)};
 const document={
  getElementById:get,createElement:t=>makeNode(t),createTextNode:t=>makeNode('text','text-node-'+t),
  addEventListener(){},activeElement:makeNode('button'),
  documentElement:{style:{setProperty(){}}},body:{style:{}}
 };
 get('sortProducts').value='name';
 const supabase={functions:{invoke:async(name,payload)=>{quotes.push({name,payload});return {data:{ok:true,currency:'BRL',subtotal_cents:4990,checkout_enabled:false},error:null}}},from(table){
  calls.push(table);
  let q={select(){return q},eq(){return q},
   maybeSingle:async()=>({data:store,error:null}),
   order:async()=>({data:items,error:null})};return q;
 }};
 const context={document,supabase,URL,URLSearchParams,Intl,Number,Map,
  location:{search:'?slug='+encodeURIComponent(slug),href:'https://example.invalid/store/loja-virtual.html'},
  console:{warn:(...x)=>warnings.push(x)}
 };
 assert.doesNotThrow(()=>new vm.Script(executable));
 vm.runInNewContext(executable,context);
 await new Promise(r=>setImmediate(r));
 return {get,calls,warnings,quotes,context};
}
test('Dedicated storefront has accessible controls and checkout explicitly disabled',()=>{
 for(const id of ['brandName','productGrid','searchProducts','sortProducts','openCart','cartPanel','cartItems','cartCount','cartTotal','checkoutNotice','quoteStatus','validateCart'])
  assert.match(html,new RegExp('id="'+id+'"'),id);
 assert.match(html,/Finalizar compra — em integração/);
 assert.match(html,/disabled aria-describedby="checkoutNotice"/);
 assert.match(html,/role="dialog"/);
 assert.doesNotMatch(html,/Lapis Servidor|Lápis Servidor|Adriano Paulo/);
});
test('Only published tenant source is read and product query is tenant scoped',async()=>{
 const x=await scenario();
 assert.deepEqual(x.calls,['saas_public_stores','saas_public_catalog_items']);
 assert.equal(x.get('brandName').textContent,'Marca da Empresa');
 assert.equal(x.get('productGrid').children.length,2);
 assert.equal(x.get('productGrid').children[0].children[1].children[0].textContent,'Bolsa');
 assert.match(code,/\.eq\('tenant_id',store\.tenant_id\)\.eq\('item_type','product'\)/);
 assert.doesNotMatch(code,/supabase\.from\('[^']+'\)\.(insert|update|delete)\(|supabase\.rpc\(/);
 assert.doesNotMatch(code,/service_role|MP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
});
test('Unavailable company is not allowed to load products',async()=>{
 const x=await scenario({store:null});
 assert.deepEqual(x.calls,['saas_public_stores']);
 assert.match(x.get('status').textContent,/indisponível/);
});
test('Client-side selection adds only in-stock products and cannot charge money',async()=>{
 const x=await scenario();
 const available=x.get('productGrid').children[1];
 const unavailable=x.get('productGrid').children[0];
 const itemButton=available.children[1].children.at(-1);
 assert.equal(itemButton.disabled,false);
 assert.equal(unavailable.children[1].children.at(-1).disabled,true);
 x.get('productGrid').listeners.click({target:{closest:()=>itemButton}});
 assert.equal(x.get('cartCount').textContent,'1');
 assert.equal(x.get('cartPanel').hidden,false);
 assert.equal(x.get('cartItems').children.length,1);
 assert.match(x.get('cartTotal').textContent,/49,90/);
});
test('Router sends virtual_store to dedicated page and leaves other models untouched',()=>{
 assert.match(router,/store\.template_code==='barbershop'\?'barbearia\.html':'loja-virtual\.html'/);
 assert.match(router,/store\.template_code === 'barbershop' \|\| store\.template_code === 'virtual_store'/);
});

test('Cart quote calls read-only server validation and remains non-transactional',async()=>{
 const x=await scenario();
 const button=x.get('productGrid').children[1].children[1].children.at(-1);
 x.get('productGrid').listeners.click({target:{closest:()=>button}});
 assert.equal(x.get('validateCart').disabled,false);
 await x.get('validateCart').listeners.click();
 assert.equal(x.quotes.length,1);
 assert.equal(x.quotes[0].name,'saas-store-quote');
 assert.equal(x.quotes[0].payload.body.slug,'loja-teste');
 assert.equal(x.quotes[0].payload.body.items[0].quantity,1);
 assert.match(x.get('quoteStatus').textContent,/conferido/i);
 assert.match(x.get('quoteStatus').textContent,/Checkout indisponível/);
 assert.equal(x.get('cartTotal').textContent,'R$ 49,90');
});
test('Quote Edge Function only reads public tenant catalog with bounded inputs',()=>{
 const source=readFileSync('supabase/functions/saas-store-quote/index.ts','utf8');
 assert.match(source,/saas_public_stores/);
 assert.match(source,/saas_public_catalog_items/);
 assert.match(source,/store\.template_code!=="virtual_store"/);
 assert.match(source,/item\.quantity/);
 assert.match(source,/items\.length>20/);
 assert.match(source,/checkout_enabled:false/);
 assert.match(source,/subtotal_cents:subtotalCents/);
 assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|MP_ACCESS_TOKEN|\.insert\(|\.update\(|\.delete\(/);
});
