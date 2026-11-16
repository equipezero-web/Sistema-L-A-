import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=readFileSync('assets/js/config.js','utf8');
const base=config.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
const key=config.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)?.[1];
assert.ok(base&&key);
const endpoint=base+'/functions/v1/saas-transparent-checkout';
async function send(body){
 const response=await fetch(endpoint,{method:'POST',
  headers:{'Content-Type':'application/json',apikey:key},
  body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 return {response,data};
}
const check=await send({action:'status',slug:'loja-inexistente-cobranca'});
assert.equal(check.response.status,200);
assert.equal(check.data.ok,true);
assert.equal(check.data.checkout_enabled,false);
assert.equal(check.data.public_key,null);
const charge=await send({action:'submit',slug:'loja-inexistente-cobranca'});
assert.equal(charge.response.status,503);
assert.equal(charge.data.checkout_enabled,false);
console.log('Checkout Transparente endpoint refuses payment submit and does not reveal a public key.');
