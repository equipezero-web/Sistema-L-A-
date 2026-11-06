import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('app/plano.html','utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Expected billing module');
const executable=script.replace(/import\{[^}]+\}from'[^']+';/g,'');

test('Subscription page inline JavaScript parses',()=>{
  assert.doesNotThrow(()=>new vm.Script(executable));
});

test('Owner cannot start duplicate checkout while an existing agreement is pending or still active',()=>{
  assert.match(executable,/canStartCheckout=checkoutEnabled&&!active&&\(!sub\|\|sub\.status==='cancelled'\)/);
  assert.match(executable,/if\(!canStartCheckout\)throw new Error/);
  assert.match(executable,/Assinatura existente — consulte o status/);
});

test('Frontend still obtains entitlement from server RPC, not payment redirect',()=>{
  assert.match(executable,/saas_subscription_access/);
  assert.match(executable,/saas-billing/);
  assert.doesNotMatch(executable,/location\.search.*active|localStorage.*active/);
});
