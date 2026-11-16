import {supabase} from './supabase.js';

const byId=id=>document.getElementById(id);
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const params=new URLSearchParams(location.search);
const slug=params.get('slug');
const cart=new Map();
let products=[],lastFocus=null;
const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:null;
const safeImage=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}};
const node=(tag,className='',content='')=>{const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=String(content);return el};
const status=message=>{byId('status').textContent=message};
let quoteInFlight=false,cartVersion=0;
function invalidateQuote(){
 cartVersion++;
 byId('quoteStatus').textContent='Seleção alterada. Confira os valores atuais antes de prosseguir.';
}
async function validateCart(){
 if(quoteInFlight||!cart.size)return;
 const version=cartVersion;
 const items=[...cart].map(([id,quantity])=>({id,quantity}));
 const button=byId('validateCart');
 button.disabled=true;quoteInFlight=true;
 byId('quoteStatus').textContent='Conferindo valores e disponibilidade...';
 try{
  const {data,error}=await supabase.functions.invoke('saas-store-quote',{body:{slug,items}});
  if(version!==cartVersion)return;
  if(error||!data?.ok){
   let detail=typeof data?.error==='string'?data.error:'';
   if(!detail&&error?.context?.json){
    const body=await error.context.json().catch(()=>null);
    detail=typeof body?.error==='string'?body.error:'';
   }
   throw Error(detail||'Não foi possível confirmar os valores. Atualize o catálogo.');
  }
  const cents=Number(data.subtotal_cents);
  if(!Number.isSafeInteger(cents)||cents<0||data.currency!=='BRL'||data.checkout_enabled!==false)
    throw Error('Resposta de cotação inválida.');
  byId('quoteStatus').textContent='Subtotal conferido: '+money.format(cents/100)+'. Cotação informativa válida por até 2 minutos; estoque não reservado. Checkout indisponível.';
 }catch(error){
  if(version===cartVersion)byId('quoteStatus').textContent=error?.message||'Falha ao conferir valores.';
 }finally{
  quoteInFlight=false;button.disabled=!cart.size;
 }
}
byId('validateCart').addEventListener('click',validateCart);

function applyTheme(store){
 const root=document.documentElement.style;
 const primary=color(store.primary_color)||'#D4AF37';
 const secondary=color(store.secondary_color)||'#13264D';
 const base=color(store.background_color)||'#07101F';
 const ink=color(store.text_color)||'#F6F4EC';
 root.setProperty('--accent',primary);root.setProperty('--secondary',secondary);
 root.setProperty('--base',base);root.setProperty('--ink',ink);
 root.setProperty('--surface', 'color-mix(in srgb,'+secondary+' 64%,'+base+')');
 const grad=store.design_settings?.themeGradients||{};
 function paint(key,solid,cssVar){
  const setting=grad[key];
  if(setting?.mode!=='gradient'||!color(setting.start)||!color(setting.end))return;
  const angle=Number.isFinite(+setting.angle)?Math.max(0,Math.min(360,+setting.angle)):135;
  root.setProperty(cssVar,'linear-gradient('+angle+'deg,'+setting.start+','+setting.end+')');
 }
 paint('primary',primary,'--accent-gradient');
 const bg=grad.background;
 if(bg?.mode==='gradient'&&color(bg.start)&&color(bg.end)){
  const a=Number.isFinite(+bg.angle)?Math.max(0,Math.min(360,+bg.angle)):135;
  document.body.style.background='linear-gradient('+a+'deg,'+bg.start+','+bg.end+') fixed';
 }
 const fonts=['Inter','Poppins','Montserrat','Playfair Display','Roboto','Lato'];
 root.setProperty('--font',fonts.includes(store.font_style)?'"'+store.font_style+'",Arial,sans-serif':'"Lato",Arial,sans-serif');
}
function renderProducts(){
 const query=byId('searchProducts').value.trim().toLocaleLowerCase('pt-BR');
 const order=byId('sortProducts').value;
 const list=products.filter(p=>(p.name+' '+(p.description||'')).toLocaleLowerCase('pt-BR').includes(query)).slice();
 list.sort((a,b)=>order==='price-asc'?a.price-b.price:order==='price-desc'?b.price-a.price:a.name.localeCompare(b.name,'pt-BR'));
 const grid=byId('productGrid');grid.replaceChildren();
 for(const item of list){
  const card=node('article','product');const visual=node('div','photo');
  const image=safeImage(item.image_url);
  if(image){const el=node('img');el.src=image;el.loading='lazy';el.alt='Imagem de '+item.name;visual.append(el)}
  else visual.append(node('span','placeholder','Imagem não disponível'));
  const body=node('div','product-body');
  body.append(node('h3','',item.name),node('p','',item.description||'Produto disponível na loja.'));
  body.append(node('strong','price',money.format(item.price)));
  const add=node('button','btn btn-primary',item.in_stock?'Adicionar à seleção':'Indisponível');
  add.type='button';add.disabled=!item.in_stock;add.dataset.productId=item.id;
  body.append(add);card.append(visual,body);grid.append(card);
 }
 byId('resultCount').textContent=list.length+' produto(s)';
 if(!list.length)status(products.length?'Nenhum produto corresponde à pesquisa.':'Nenhum produto publicado no momento.');
 else status('');
}
function renderCart(){
 const container=byId('cartItems');container.replaceChildren();let total=0,count=0;
 for(const [id,qty] of cart){
  const p=products.find(x=>x.id===id&&x.in_stock);
  if(!p||qty<1){cart.delete(id);continue}
  count+=qty;total+=p.price*qty;
  const entry=node('article','cart-item');
  const line=node('div','cart-item-line');
  line.append(node('strong','',p.name),node('span','',money.format(p.price*qty)));
  const qtyRow=node('div','qty');qtyRow.append(node('small','','Quantidade: '+qty));
  for(const [action,label] of [['minus','−'],['plus','+'],['remove','Remover']]){
   const button=node('button','',label);button.type='button';button.dataset.cartAction=action;button.dataset.productId=id;
   button.setAttribute('aria-label',action==='plus'?'Aumentar quantidade de '+p.name:action==='minus'?'Diminuir quantidade de '+p.name:'Remover '+p.name);
   if(action==='plus'&&qty>=99)button.disabled=true;
   qtyRow.append(button);
  }
  entry.append(line,qtyRow);container.append(entry);
 }
 if(!count)container.append(node('p','','Sua seleção está vazia.'));
 byId('cartTotal').textContent=money.format(total);
 byId('cartCount').textContent=String(count);
 byId('clearCart').disabled=count===0;
 byId('validateCart').disabled=count===0||quoteInFlight;
}
function openCart(){lastFocus=document.activeElement;byId('cartBackdrop').hidden=false;byId('cartPanel').hidden=false;document.body.style.overflow='hidden';byId('closeCart').focus();renderCart()}
function closeCart(){byId('cartPanel').hidden=true;byId('cartBackdrop').hidden=true;document.body.style.overflow='';lastFocus?.focus?.()}
byId('openCart').addEventListener('click',openCart);
byId('closeCart').addEventListener('click',closeCart);
byId('cartBackdrop').addEventListener('click',closeCart);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!byId('cartPanel').hidden)closeCart()});
byId('searchProducts').addEventListener('input',renderProducts);
byId('sortProducts').addEventListener('change',renderProducts);
byId('productGrid').addEventListener('click',event=>{
 const button=event.target.closest('button[data-product-id]');if(!button||button.disabled)return;
 const id=button.dataset.productId,item=products.find(x=>x.id===id&&x.in_stock);
 if(!item)return;cart.set(id,Math.min(99,(cart.get(id)||0)+1));invalidateQuote();renderCart();openCart();
});
byId('cartItems').addEventListener('click',event=>{
 const button=event.target.closest('button[data-cart-action]');if(!button)return;
 const {cartAction:action,productId:id}=button.dataset;
 const qty=cart.get(id);if(!qty)return;
 if(action==='remove'||action==='minus'&&qty===1)cart.delete(id);
 else cart.set(id,action==='plus'?Math.min(99,qty+1):Math.max(1,qty-1));
 invalidateQuote();renderCart();
});
byId('clearCart').addEventListener('click',()=>{cart.clear();invalidateQuote();renderCart()});
async function boot(){
 try{
  if(!slug||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)){status('Endereço inválido. Utilize o link público da empresa.');return}
  const {data:store,error:storeError}=await supabase.from('saas_public_stores')
   .select('tenant_id,name,slug,template_code,logo_url,primary_color,secondary_color,background_color,text_color,font_style,design_settings')
   .eq('slug',slug).maybeSingle();
  if(storeError)throw Error('Não foi possível consultar a publicação da empresa.');
  if(!store||store.template_code!=='virtual_store'){status('Loja indisponível ou modelo incorreto.');return}
  applyTheme(store);
  document.title=store.name+' | Loja Virtual';
  byId('brandName').textContent=store.name;byId('footerBrand').textContent=store.name;
  byId('heroTitle').replaceChildren(document.createTextNode('Descubra '),node('em','','nossos produtos.'));
  byId('heroSubtitle').textContent='Conheça o catálogo de '+store.name+'. Selecione seus favoritos e acompanhe o subtotal estimado.';
  const logo=safeImage(store.logo_url);if(logo){byId('logo').src=logo;byId('logo').hidden=false}
  const {data,error}=await supabase.from('saas_public_catalog_items')
   .select('id,item_type,name,description,price,image_url,in_stock')
   .eq('tenant_id',store.tenant_id).eq('item_type','product').order('name');
  if(error)throw Error('Não foi possível carregar os produtos publicados.');
  products=(data||[]).filter(item=>typeof item.name==='string'&&Number.isFinite(Number(item.price))&&Number(item.price)>=0)
   .map(item=>({...item,price:Number(item.price),in_stock:item.in_stock===true}));
  renderProducts();renderCart();
 }catch(error){status(error.message||'Erro ao carregar a loja.');console.warn('Falha ao carregar a loja virtual:',error)}
}
void boot();
