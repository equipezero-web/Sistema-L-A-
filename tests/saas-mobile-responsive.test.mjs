import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const css=read('assets/css/main.css');
const barber=read('store/barbearia.html');
const reception=read('store/recepcao.html');
const booking=read('store/reservar.html');
const store=read('store/index.html');
const admin=read('super-admin/index.html');
const panel=read('app/index.html');
const app=read('assets/js/app.js');
const barberJs=read('assets/js/barber-original-template.js');

test('All critical SaaS pages keep a responsive viewport and mobile-safe shared CSS',()=>{
 for(const path of [
  'index.html','auth/login.html','auth/cadastro.html','app/index.html',
  'app/aparencia.html','app/agenda.html','app/recepcao-contas.html',
  'app/clientes.html','app/funcionarios.html','app/servicos.html',
  'app/estoque.html','app/plano.html','app/royal-ai.html',
  'app/configuracoes.html','store/index.html','store/barbearia.html',
  'store/recepcao.html','store/reservar.html','onboarding/index.html',
  'super-admin/index.html'
 ]){
  const html=read(path);
  assert.match(html,/name="viewport"/,path);
 }
 assert.match(css,/max-width:900px/);
 assert.match(css,/max-width:600px/);
 assert.match(css,/max-width:340px/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/\.table-wrap\{[^}]*overflow-x:auto/);
 assert.match(css,/\.royal-modal\{[^}]*max-height/);
 assert.match(css,/prefers-reduced-motion/);
});
test('Admin sidebar can open and close with tappable backdrop, Escape and breakpoint cleanup',()=>{
 assert.match(panel,/id="sidebarBackdrop"/);
 assert.match(panel,/id="menuToggle"[^>]*aria-expanded="false"/);
 assert.match(panel,/aria-controls="sidebar"/);
 for(const part of ['closeMobileMenu','openMobileMenu','mobileBackdrop','mobile-nav-open','aria-expanded',
  "event.key==='Escape'","window.innerWidth>900"]){
  assert.ok(app.includes(part),part);
 }
 assert.match(css,/\.sidebar-backdrop:not\(\[hidden\]\)/);
 assert.match(css,/\.dashboard \.sidebar\.open/);
 assert.match(css,/\.dashboard \.menu-toggle/);
 assert.doesNotThrow(()=>new vm.Script(app.replace(/^import .*?;\s*$/gm,'')
   .replace(/boot\(\)\.catch\(e=>show\(e\.message\|\|'Erro ao carregar o painel\.'\)\);/,"")));
});
test('Barber public client has five accessible, safe-area bottom tabs and tenant spacing never overrides phones',()=>{
 for(const label of ['Início','Agendamentos','Barbearia','Planos','Perfil'])
  assert.match(barber,new RegExp('aria-label="'+label+'"'));
 assert.match(barber,/#app \.sidebar \.nav\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(barber,/--barber-safe-bottom/);
 assert.match(barber,/#app \.main\{width:100%;max-width:100%!important;margin-left:0/);
 assert.match(barber,/padding:[^}]*calc\(112px \+ var\(--barber-safe-bottom\)\)/);
 assert.match(barber,/saas-guest-dialog\{max-width:[^}]*max-height/);
 assert.match(barber,/min-height:44px/);
 assert.doesNotMatch(barber,/id="mobileBackToStore"|id="backToStore"/);
 assert.doesNotMatch(barberJs,/mobileBackToStore|view=catalogo/);
 assert.match(barberJs,/target\.hidden/);
 assert.match(barberJs,/b\.hidden=!visible/);
});
test('Reception, booking, generic storefront and super-admin remain usable at narrow widths',()=>{
 assert.match(reception,/@media\(max-width:600px\)/);
 assert.match(reception,/@media\(max-width:350px\)/);
 assert.match(reception,/\.table-scroll\{[^}]*overflow-x:auto/);
 assert.match(reception,/font-size:16px/);
 assert.match(booking,/@media\(max-width:620px\)/);
 assert.match(booking,/@media\(max-width:350px\)/);
 assert.match(booking,/slot-grid\{grid-template-columns:repeat\(auto-fit/);
 assert.match(store,/@media\(max-width:600px\)/);
 assert.match(store,/@media\(max-width:350px\)/);
 assert.match(admin,/\.royal-audit-filters\{display:grid;grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(admin,/max-height:calc\(100dvh/);
});
test('Mobile changes have no SQL, payments, RLS or password functionality',()=>{
 const outputs=[css,barber,reception,booking,store,admin,app,barberJs,panel].join('\n');
 assert.doesNotMatch(outputs,/SUPABASE_SERVICE_ROLE_KEY\s*=/);
 assert.doesNotMatch(css,/\.sidebar\s*\{\s*display:none/);
 assert.match(barberJs,/saas_barber_request_booking/);
 assert.match(reception,/id="loginForm"/);
 assert.match(panel,/data-module="appearance"/);
});
