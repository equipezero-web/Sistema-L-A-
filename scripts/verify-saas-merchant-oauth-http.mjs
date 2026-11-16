import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cfg=readFileSync('assets/js/config.js','utf8');
const endpoint=cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1]+'/functions/v1/saas-merchant-oauth';
const key=cfg.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)?.[1];
assert.ok(endpoint.startsWith('https://')&&key);
const headers={'Content-Type':'application/json',apikey:key};
const invalid=await fetch(endpoint+'?state=invalid',{headers,signal:AbortSignal.timeout(20000)});
console.log('Invalid OAuth callback HTTP status:',invalid.status);
assert.ok(invalid.status>=400&&invalid.status<600,'Invalid callback state unexpectedly accepted');
const withoutSession=await fetch(endpoint,{method:'POST',headers,
 body:JSON.stringify({action:'start',tenant_id:'00000000-0000-4000-8000-000000000000'}),
 signal:AbortSignal.timeout(20000)});
console.log('Unauthenticated OAuth start HTTP status:',withoutSession.status);
assert.ok(withoutSession.status>=400&&withoutSession.status<600,'Unauthenticated merchant authorization unexpectedly accepted');
const body=await withoutSession.text();
assert.doesNotMatch(body,/authorization_url|access_token|refresh_token|client_secret/);
console.log('OAuth endpoint rejects invalid callback and unauthenticated start, without leaking credentials.');
