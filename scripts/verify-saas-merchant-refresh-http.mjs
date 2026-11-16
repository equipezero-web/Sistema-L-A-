import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cfg=readFileSync('assets/js/config.js','utf8');
const base=cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
const key=cfg.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)?.[1];
assert.ok(base&&key);
const result=await fetch(base+'/functions/v1/saas-merchant-refresh',{
 method:'POST',
 headers:{apikey:key,'Content-Type':'application/json'},
 body:JSON.stringify({action:'refresh',tenant_id:'00000000-0000-4000-8000-000000000000'}),
 signal:AbortSignal.timeout(20000)
});
assert.equal(result.status,401,'Refresh must reject missing Supabase user session');
const body=await result.text();
assert.doesNotMatch(body,/refresh_token|access_token|client_secret/);
console.log('Deployed merchant refresh denied unauthenticated request (401).');
