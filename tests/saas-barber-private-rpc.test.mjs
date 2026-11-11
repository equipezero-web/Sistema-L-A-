import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/sql/saas_barber_private_api_boundary_63.sql','utf8');
const booking=readFileSync('assets/js/public-barber-booking.js','utf8');
const agenda=readFileSync('assets/js/agenda.js','utf8');
const internal=['saas_barber_public_setup','saas_barber_available_slots',
 'saas_barber_request_booking','saas_barber_decide_request'];

test('Privileged booking code moves out of the exposed API schema',()=>{
 assert.match(migration,/create schema if not exists booking_private/);
 assert.match(migration,/revoke all on schema booking_private from public,anon,authenticated/);
 assert.match(migration,/grant usage on schema booking_private to anon,authenticated/);
 for(const name of internal){
  assert.match(migration,new RegExp('alter function public\\.'+name+'\\('));
  assert.match(migration,new RegExp('function booking_private\\.'+name+'\\('));
  assert.match(migration,new RegExp('create function public\\.'+name+'\\('));
 }
 assert.match(migration,/if v_count<>4 then/);
});
test('Public wrappers are SECURITY INVOKER and use empty search_path',()=>{
 const definitions=[...migration.matchAll(/create function public\.saas_barber_[\s\S]*?\$fn\$;/g)].map(m=>m[0]);
 assert.equal(definitions.length,4);
 for(const d of definitions){
   assert.match(d,/security invoker set search_path=''/);
   assert.match(d,/select booking_private\.saas_barber_/);
   assert.doesNotMatch(d,/SECURITY DEFINER/i);
 }
});
test('Anonymous users can request but cannot decide, and direct booking table stays private',()=>{
 assert.match(migration,/public\.saas_barber_request_booking\(text,uuid,date,time,uuid,text,text\)[\s\S]*?to anon,authenticated/);
 assert.match(migration,/public\.saas_barber_decide_request\(uuid,text\)[\s\S]*?to authenticated/);
 assert.doesNotMatch(migration,/saas_barber_decide_request\(uuid,text\)[\s\S]*?to anon,/);
 assert.doesNotMatch(migration,/grant (?:select|insert|update|delete) on public\.saas_barber_requests/i);
});
test('Frontends keep calling the same public RPCs; no changes to subscription or users',()=>{
 assert.match(booking,/rpc\('saas_barber_public_setup'/);
 assert.match(booking,/rpc\('saas_barber_available_slots'/);
 assert.match(booking,/rpc\('saas_barber_request_booking'/);
 assert.match(agenda,/rpc\('saas_barber_decide_request'/);
 assert.doesNotMatch(migration,/alter table public\.saas_subscriptions|update public\.saas_subscriptions|delete from public\.saas_subscriptions/);
 assert.doesNotMatch(migration,/auth\.users|saas_members/);
});
