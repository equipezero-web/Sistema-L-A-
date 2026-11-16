import {supabase} from './supabase.js';

// Checkout Bricks are mounted only after BOTH the cart quote and the
// server-authoritative tenant readiness explicitly allow payments.
// No SDK, card inputs or payment processing are loaded in the current phase.
const slug=new URLSearchParams(location.search).get('slug');
const container=document.getElementById('paymentBrick_container');
const message=document.getElementById('transparentPaymentStatus');
let paymentController=null;
let ready=null;
let generation=0;
let quoteExpiryTimer=null;
function show(text){if(message)message.textContent=text}
function validKey(key){return typeof key==='string'&&/^(APP_USR|TEST)-[A-Za-z0-9-]{10,160}$/.test(key)}
function script(){
 if(typeof window.MercadoPago==='function')return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const element=document.createElement('script');
  element.src='https://sdk.mercadopago.com/js/v2';
  element.async=true;
  element.onload=resolve;
  element.onerror=()=>reject(new Error('O provedor de pagamentos não pôde ser carregado.'));
  document.head.append(element);
 });
}
async function unmount(){
 generation++;
 if(quoteExpiryTimer!==null){clearTimeout(quoteExpiryTimer);quoteExpiryTimer=null;}
 if(paymentController){
  try{await paymentController.unmount()}catch{ /* reset on navigation */ }
  paymentController=null;
 }
 if(container){container.hidden=true;container.replaceChildren()}
}
async function refreshReadiness(){
 if(!slug||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)){
  show('Loja inválida. Não é possível iniciar pagamentos.');return
 }
 try{
  const {data,error}=await supabase.functions.invoke('saas-transparent-checkout',{
   body:{action:'status',slug}
  });
  if(error||data?.ok!==true)throw Error('Configuração indisponível.');
  ready=data.checkout_enabled===true&&validKey(data.public_key)?data:null;
  if(!ready)show('Checkout Transparente em homologação. Nenhuma cobrança é realizada nesta loja.');
  else show('O meio de pagamento será exibido após a cotação válida.');
 }catch{
  ready=null;show('Pagamentos indisponíveis. Nenhuma cobrança foi iniciada.');
 }
}
document.addEventListener('la:cart-updated',()=>{void unmount()});
document.addEventListener('la:quote-validated',async event=>{
 const quote=event.detail;
 if(!ready||quote?.checkout_enabled!==true){
  await unmount();return;
 }
 const cents=Number(quote.subtotal_cents);
 if(!Number.isSafeInteger(cents)||cents<=0||quote.currency!=='BRL'||
  !Number.isFinite(Date.parse(quote.expires_at))||Date.parse(quote.expires_at)<=Date.now()){
  await unmount();show('Atualize a cotação para iniciar o pagamento.');return;
 }
 await unmount();
 const run=generation;
 const expiresAt=Date.parse(quote.expires_at);
 try{
  await script();
  if(run!==generation||expiresAt<=Date.now()){
   if(run===generation)show('Cotação expirada. Atualize o carrinho.');
   return;
  }
  const mp=new window.MercadoPago(ready.public_key,{locale:'pt-BR'});
  const settings={
   initialization:{amount:cents/100},
   customization:{paymentMethods:{
    creditCard:'all',debitCard:'all',bankTransfer:['pix'],ticket:['bolbradesco']
   }},
   callbacks:{
    onReady:()=>show('Meios de pagamento carregados.'),
    // Intentionally fail-closed until a real idempotent Payments API processor
    // and complete financial/order fulfillment are implemented.
    onSubmit:()=>Promise.reject(new Error('Processamento de pagamentos ainda não homologado.')),
    onError:()=>show('Falha no componente do provedor. Atualize a cotação.')
   }
  };
  const controller=await mp.bricks().create('payment','paymentBrick_container',settings);
  if(run!==generation||expiresAt<=Date.now()){
   await controller.unmount();
   if(run===generation)show('Cotação expirada. Atualize o carrinho.');
   return;
  }
  paymentController=controller;
  container.hidden=false;
  quoteExpiryTimer=setTimeout(()=>{
   if(run===generation){
    void unmount();
    show('Cotação expirada. Atualize o carrinho para tentar novamente.');
   }
  },Math.max(0,expiresAt-Date.now()));
 }catch{show('Pagamento indisponível. Nenhuma cobrança foi realizada.')}
});
void refreshReadiness();
