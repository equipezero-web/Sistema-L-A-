// Pure server-side Mercado Pago request contract. No HTTP calls or access tokens.
// Never import this into public browser code. Payment submission stays disabled.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHOD=/^[a-z0-9_]{2,40}$/;
const EMAIL=/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]{2,30}$/;

function valid(value,description){if(!value)throw new Error(description)}
function serverAmount(cents){
 valid(Number.isSafeInteger(cents)&&cents>0&&cents<=100_000_000,"Invalid server amount");
 return cents/100;
}
export function buildMerchantPaymentRequest({intentId,attemptId,subtotalCents,formData}){
 valid(typeof intentId==="string"&&UUID.test(intentId),"Invalid intent");
 valid(typeof attemptId==="string"&&UUID.test(attemptId),"Invalid attempt");
 valid(formData&&typeof formData==="object"&&!Array.isArray(formData),"Invalid payment form");
 const method=formData.payment_method_id;
 const payer=formData.payer;
 valid(typeof method==="string"&&METHOD.test(method),"Invalid payment method");
 valid(payer&&typeof payer==="object"&&typeof payer.email==="string"&&EMAIL.test(payer.email),"Invalid payer");
 const amount=serverAmount(subtotalCents);
 const payload={transaction_amount:amount,description:"Compra na loja",payment_method_id:method,
  external_reference:intentId,payer:{email:payer.email.trim().toLowerCase()}};
 if(method!=="pix"){
  valid(typeof formData.token==="string"&&/^[a-zA-Z0-9_-]{8,256}$/.test(formData.token),"Invalid payment token");
  valid(Number.isInteger(formData.installments)&&formData.installments>=1&&formData.installments<=24,"Invalid installments");
  payload.token=formData.token;
  payload.installments=formData.installments;
  if(typeof formData.issuer_id==="string"&&/^[0-9]{1,20}$/.test(formData.issuer_id))payload.issuer_id=formData.issuer_id;
 }
 // Stable across retries. Generated server-side on attempt creation, not per click.
 return {idempotencyKey:attemptId,payload};
}
export function verifyMerchantPaymentResult(payment,{intentId,accountId,subtotalCents}){
 if(!payment||typeof payment!=="object"||!UUID.test(String(intentId||"")))return null;
 const id=String(payment.id??"");
 const collector=String(payment.collector_id??payment.collector?.id??"");
 const amount=Number(payment.transaction_amount);
 const status=String(payment.status??"");
 if(!/^[0-9]{1,30}$/.test(id)||!accountId||collector!==String(accountId)||
  String(payment.external_reference??"")!==intentId||payment.currency_id!=="BRL"||
  !Number.isFinite(amount)||Math.round(amount*100)!==subtotalCents||
  !["pending","in_process","approved","rejected","cancelled","refunded","charged_back"].includes(status))
  return null;
 return {paymentId:id,status};
}
