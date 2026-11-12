import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const file=path=>readFileSync(path,'utf8');
const settings=file('app/configuracoes.html');
const theme=file('app/aparencia.html');
const appearance=file('assets/js/appearance.js');
const designer=file('assets/js/appearance-designer.js');
const router=file('store/index.html');
const barber=file('store/barbearia.html');
const barberJs=file('assets/js/barber-original-template.js');

test('Enterprise model is selected in onboarding and not switched in settings',()=>{
 const onboarding=file('onboarding/index.html');
 assert.match(onboarding,/templateCode|template_code/);
 assert.doesNotMatch(settings,/id="templateCode"|id="templateForm"|saveTemplate|Modelo da empresa/);
 assert.doesNotMatch(theme,/id="layout"/);
 assert.doesNotMatch(appearance,/\$\('#layout'\)|layout_id:/);
});
test('The company public URL is canonical and barber never opens a duplicated catalog',()=>{
 assert.match(settings,/\.\.\/store\/\?slug=/);
 assert.match(appearance,/\.\.\/store\/\?slug=/);
 assert.match(router,/store\.template_code === 'barbershop'/);
 assert.doesNotMatch(router,/get\('view'\) !== 'catalogo'/);
 assert.doesNotMatch(barber,/id="backToStore"|id="mobileBackToStore"/);
 assert.doesNotMatch(barberJs,/view=catalogo/);
});
test('Brand displayed to customers belongs to tenant and not to the platform',()=>{
 assert.match(router,/id="storeEyebrow"/);
 assert.doesNotMatch(router,/<div class="eyebrow">L&A Royal Store<\/div>/);
 assert.match(router,/store\.name/);
 assert.match(barberJs,/store\.name/);
});
test('Global palettes remain tenant-specific while barber tagline color is independent',()=>{
 for(const key of ['gold','navy','sea','ocean','silver','sky'])assert.match(appearance,new RegExp('"'+key+'"'));
 assert.match(appearance,/themeGradients/);
 assert.match(designer,/signatureMode/);
 assert.match(designer,/select\('design_settings'\)/);
 assert.match(designer,/\.\.\.current,\.\.\.collect\(\)/);
 assert.match(barberJs,/applySignatureStyle/);
});
test('Frontend scripts preserve parseability',()=>{
 const strip=s=>s.replace(/^import\s*\{[^}]+\}\s*from\s*'[^']+';/gm,'');
 for(const source of [appearance,designer,barberJs])
  assert.doesNotThrow(()=>new vm.Script(strip(source)));
});
