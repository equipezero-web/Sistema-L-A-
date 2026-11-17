// Meta webhook signature verification building block. Not a public event endpoint.
// A tenant's Instagram Professional account must be OAuth-bound before ingestion.
export async function verifyMetaSignature({rawBody,signature,appSecret}){
 if(typeof rawBody!=='string'||rawBody.length>100000||!/^sha256=[a-f0-9]{64}$/i.test(signature||'')||
    typeof appSecret!=='string'||appSecret.length<16)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(appSecret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(rawBody));
 const expected=[...new Uint8Array(mac)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const submitted=signature.slice(7).toLowerCase();
 let difference=0;
 for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^submitted.charCodeAt(i);
 return difference===0;
}
export function extractInstagramEvents(body){
 if(!body||body.object!=='instagram'||!Array.isArray(body.entry))return [];
 const events=[];
 for(const entry of body.entry.slice(0,100)){
  const accountId=String(entry?.id??'');
  if(!/^[0-9]{5,30}$/.test(accountId))continue;
  for(const change of (Array.isArray(entry?.messaging)?entry.messaging:[]).slice(0,100)){
   const messageId=String(change?.message?.mid??'');
   if(!messageId||messageId.length>250)continue;
   events.push({accountId,messageId});
  }
 }
 return events;
}
// Event IDs alone are not customer messages. The official API, tenant OAuth,
// permissions, consent, rate limits and replay-safe ledger are required before
// storing or replying to content. Never infer a tenant from untrusted payloads.
