// Payment transport for future server-side checkout processing only.
// NOT wired to an exposed endpoint. Never pass the SaaS subscription token here.
export async function submitMerchantPayment({
 merchantAccessToken,idempotencyKey,payload,transport=fetch,signal
}){
 if(typeof merchantAccessToken!=='string'||merchantAccessToken.length<20)
  throw new Error('Merchant OAuth access token not available');
 if(typeof idempotencyKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))
  throw new Error('Invalid stable idempotency key');
 if(!payload||typeof payload!=='object'||!Number.isFinite(payload.transaction_amount)||
    payload.transaction_amount<=0||!payload.external_reference||!payload.payment_method_id)
  throw new Error('Payment payload must originate from a verified server order');
 let response;
 try{
  response=await transport('https://api.mercadopago.com/v1/payments',{
   method:'POST',signal,headers:{
    'Authorization':'Bearer '+merchantAccessToken,
    'X-Idempotency-Key':idempotencyKey,
    'Content-Type':'application/json'
   },
   body:JSON.stringify(payload)
  });
 }catch{
  // A connection failure can occur after the provider accepted the charge.
  // Never reissue with a new idempotency key: reconcile with provider first.
  return {kind:'unknown',payment:null};
 }
 let data;
 try{data=await response.json()}catch{return {kind:'unknown',payment:null}}
 if(!response.ok)return {
  kind:response.status>=500||response.status===429?'unknown':'rejected',
  payment:null,
  httpStatus:response.status
 };
 return {kind:'provider_response',payment:data};
}
