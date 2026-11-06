import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('auth/login.html', 'utf8');
const moduleSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(moduleSource, 'Login module should exist');
const source = moduleSource.replace(/import\{[^}]+\}from'[^']+';/g, '');

async function run({ factors = [], currentLevel = 'aal1', nextLevel = 'aal2', superAdmin = false, hasSession = true } = {}) {
  const elements = new Map();
  const node = id => {
    if (!elements.has(id)) {
      const flags = new Set(['hidden']);
      elements.set(id, {
        value: '123456', textContent: '', className: '', handlers: {},
        classList: { add: v => flags.add(v), remove: v => flags.delete(v), contains: v => flags.has(v) },
        addEventListener(event, fn) { this.handlers[event] = fn; }
      });
    }
    return elements.get(id);
  };
  const location = { href: '', replace(path) { this.href = path; } };
  let challenges = 0;
  const context = {
    document: { querySelector: selector => node(selector.slice(1)) },
    location,
    signIn: async () => ({error:null}),
    getSession: async () => hasSession ? {user:{id:'test'}} : null,
    getAAL: async () => ({currentLevel, nextLevel}),
    getMyProfile: async () => ({is_platform_super_admin: superAdmin}),
    listMfaFactors: async () => ({totp:factors}),
    challengeTotp: async () => {challenges++; currentLevel = 'aal2';}
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { node, location, get challenges() { return challenges; } };
}

test('AAL1 never challenges an unverified factor or enters dashboard', async () => {
  const app = await run({factors:[{id:'unverified',status:'unverified'}]});
  assert.equal(app.location.href, '../security/setup-2fa.html');
  assert.equal(app.challenges, 0);
  assert.equal(app.node('mfaBox').classList.contains('hidden'), true);
});

test('AAL1 with verified TOTP requires successful challenge', async () => {
  const app = await run({factors:[{id:'verified',status:'verified'}]});
  assert.equal(app.location.href, '');
  assert.equal(app.node('mfaBox').classList.contains('hidden'), false);
  await app.node('verifyMfa').handlers.click();
  assert.equal(app.challenges, 1);
  assert.equal(app.location.href, '../app/index.html');
});

test('Super Admin with no verified factor goes to mandatory setup', async () => {
  const app = await run({superAdmin:true,factors:[{id:'pending',status:'unverified'}]});
  assert.equal(app.location.href, '../security/setup-2fa.html?required=1');
  assert.equal(app.challenges, 0);
});

test('AAL2 with verified session can open authorized dashboard', async () => {
  const app = await run({factors:[{id:'verified',status:'verified'}],currentLevel:'aal2'});
  assert.equal(app.location.href, '../app/index.html');
});

test('No session remains at login', async () => {
  const app = await run({hasSession:false});
  assert.equal(app.location.href, '');
});
