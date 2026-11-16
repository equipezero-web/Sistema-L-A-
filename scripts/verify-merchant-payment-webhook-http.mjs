import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cfg=readFileSync('assets/js/config.js','utf8');
const base=cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
const key=cfg.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)?.[1];
assert.ok(base&&key);
const result=await fetch(base+'/functions/v1/saas-merchant-payment-webhook?data.id=123456789',{
 method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
 body:JSON.stringify({type:'payment',user_id:123456789,data:{id:'123456789'}}),
 signal:AbortSignal.timeout(20000)
});
assert.equal(result.status,503,'Unconfigured merchant webhook must remain disabled');
const body=await result.text();
assert.doesNotMatch(body,/access_token|refresh_token|client_secret/);
console.log('Merchant payment webhook is fail-closed without provider configuration (503).');
