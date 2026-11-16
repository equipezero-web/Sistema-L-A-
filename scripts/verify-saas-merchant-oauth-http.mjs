import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cfg=readFileSync('assets/js/config.js','utf8');
const endpoint=cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1]+'/functions/v1/saas-merchant-oauth';
const key=cfg.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)?.[1];
assert.ok(endpoint.startsWith('https://')&&key);
const headers={'Content-Type':'application/json',apikey:key};
const invalid=await fetch(endpoint+'?state=invalid',{headers,signal:AbortSignal.timeout(20000)});
console.log('Invalid OAuth callback HTTP status:',invalid.status);
assert.equal(invalid.status,400,'Invalid callback state must be rejected at the OAuth handler');
const withoutSession=await fetch(endpoint,{method:'POST',headers,
 body:JSON.stringify({action:'start',tenant_id:'00000000-0000-4000-8000-000000000000'}),
 signal:AbortSignal.timeout(20000)});
console.log('Unauthenticated OAuth start HTTP status:',withoutSession.status);
assert.equal(withoutSession.status,401,'Unauthenticated merchant authorization must be rejected');
const body=await withoutSession.text();
assert.doesNotMatch(body,/authorization_url|access_token|refresh_token|client_secret/);
const withoutUnlinkSession=await fetch(endpoint,{method:'POST',headers,
 body:JSON.stringify({action:'disconnect',tenant_id:'00000000-0000-4000-8000-000000000000'}),
 signal:AbortSignal.timeout(20000)});
assert.equal(withoutUnlinkSession.status,401,'Unauthenticated merchant disconnect must be rejected');
const unlinkBody=await withoutUnlinkSession.text();
assert.doesNotMatch(unlinkBody,/access_token|refresh_token|client_secret/);
console.log('OAuth endpoint rejects invalid callback, unauthenticated start and unauthenticated disconnect.');
