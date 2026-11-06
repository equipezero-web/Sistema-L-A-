import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const files={
 products:readFileSync('app/produtos.html','utf8'),
 services:readFileSync('app/servicos.html','utf8'),
 inventory:readFileSync('app/estoque.html','utf8'),
 business:readFileSync('assets/js/business.js','utf8'),
 finance:readFileSync('assets/js/financeiro.js','utf8'),
 appearance:readFileSync('assets/js/appearance.js','utf8'),
 reports:readFileSync('app/relatorios.html','utf8')
};
const source=html=>html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
const cleaned=text=>text.replace(/\bimport\s*\{[^}]+\}\s*from['"][^'"]+['"];?/g,'');

test('Catalog and inventory inline modules parse after removing import syntax',()=>{
 for(const key of ['products','services','inventory','reports']){
  const code=source(files[key]);
  assert.ok(code, 'module absent: '+key);
  assert.doesNotThrow(()=>new vm.Script('(async()=>{'+cleaned(code)+'})'),key);
 }
});

test('Employee catalog is read-only even if a hidden edit or save event fires',()=>{
 for(const key of ['products','services']){
  const src=source(files[key]);
  assert.match(src,/if\(!ctx\.canManage\)newBtn\.classList\.add\('hidden'\)/);
  assert.match(src,/function open\([px]=\{\}\)\{if\(!ctx\?\.canManage\)return;/);
  assert.match(src,/rows\.onclick=async e=>\{if\(!ctx\?\.canManage\)return;/);
  assert.match(src,/form\.onsubmit=async e=>\{e\.preventDefault\(\);const b=e\.submitter;try\{if\(!ctx\?\.canManage\)throw new Error/);
 }
});

test('Employee cannot activate inventory adjust modal or submit stock change',()=>{
 const src=source(files.inventory);
 assert.match(src,/rows\.onclick=e=>\{if\(!ctx\?\.canManage\)return;/);
 assert.match(src,/if\(!ctx\?\.canManage\)throw new Error\('Seu perfil não pode ajustar o estoque\.'/);
 assert.match(src,/ctx\.canManage\?money\(Number\(p\.cost\|\|0\)\*p\.stock_quantity\):"Restrito"/);
});

test('Inventory and product costs have distinct manager and employee access paths',()=>{
 assert.match(files.business,/if\(!\['owner','admin'\]\.includes\(role\)\)return products;/);
 assert.match(files.business,/rpc\('saas_manager_product_costs'/);
 assert.match(files.finance,/if\(!\['owner','admin'\]\.includes\(ctx\.membership\.role\)\)\{location\.replace/);
 assert.match(files.appearance,/if\(!\['owner','admin'\]\.includes\(ctx\.membership\.role\)\)\{location\.replace/);
 assert.match(source(files.reports),/if\(!\['owner','admin'\]\.includes\(ctx\.membership\.role\)\)\{location\.replace/);
});
