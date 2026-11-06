import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const paths=[
  'auth/login.html','auth/cadastro.html',
  'security/setup-2fa.html','onboarding/index.html'
];
const modules=new Map();

for(const path of paths){
  const html=readFileSync(path,'utf8');
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,path+' must have inline module source');
  const moduleCode=match[1].replace(/\bimport\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g,'');
  modules.set(path,moduleCode);
  test('JavaScript syntax: '+path,()=>{
    assert.doesNotThrow(()=>new vm.Script('(async()=>{\n'+moduleCode+'\n})',{filename:path}));
  });
  test('Explicitly bound controls exist: '+path,()=>{
    const selected=[...moduleCode.matchAll(/(?:document\.)?querySelector\('#([A-Za-z][\w-]*)'\)/g)].map(x=>x[1]);
    for(const id of selected)assert.match(html,new RegExp('\\bid=["\\x27]'+id+'["\\x27]'),'Missing #'+id);
  });
}

test('2FA confirm event listener targets the button, not window.confirm',()=>{
  const code=modules.get('security/setup-2fa.html');
  assert.match(code,/confirm=document\.querySelector\('#confirm'\)/);
  assert.match(code,/confirm\.addEventListener\('click'/);
});
test('AAL2 is checked after verifying the TOTP challenge',()=>{
  for(const path of ['auth/login.html','security/setup-2fa.html']){
    const code=modules.get(path);
    assert.match(code,/currentLevel!=='aal2'/);
  }
});
