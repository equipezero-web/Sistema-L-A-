import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=readFileSync('assets/js/config.js','utf8');
const matchUrl=config.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
const matchKey=config.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/);
assert.ok(matchUrl&&matchKey,'Public Supabase settings unavailable');
const endpoint=matchUrl[1]+'/functions/v1/saas-store-quote';
async function send(body){
 const response=await fetch(endpoint,{
  method:'POST',
  headers:{'Content-Type':'application/json','apikey':matchKey[1]},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(20000)
 });
 let data;
 try{data=await response.json()}catch{throw Error('Quote function did not return JSON, status '+response.status)}
 return {status:response.status,data};
}
const invalid=await send({slug:'../bad',items:[]});
assert.equal(invalid.status,400,'Invalid slug must be blocked by the quote function');
assert.equal(invalid.data.ok,false);
const missing=await send({slug:'empresa-inexistente-quote-test',items:[{id:'00000000-0000-4000-8000-000000000000',quantity:1}]});
assert.equal(missing.status,404,'Unpublished tenant must not return a quotation');
assert.equal(missing.data.ok,false);
console.log('Read-only public quote endpoint responded to invalid and unpublished tenants as expected.');
