// Browser-level width and touch-regression tests. Uses a local static server, not Supabase.
// Run: npm i --no-save playwright@1.55.0 && npx playwright install chromium
//      node tests/saas-mobile-browser.test.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript',
 '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer((req,res)=>{
 try{
  const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
   .replace(/^\/+/, '')||'index.html';
  const full=resolve(root,rel);
  if(!full.startsWith(root+sep)){
   res.writeHead(403);res.end();return;
  }
  const body=readFileSync(full);
  res.writeHead(200,{'Content-Type':mime[extname(full)]||'application/octet-stream',
   'Cache-Control':'no-store'});
  res.end(body);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const address=server.address();
const origin='http://127.0.0.1:'+address.port;
const widths=[280,320,360,375,390,412,430,480,600,820,900,1024];
const pages=[
 'index.html','auth/login.html','auth/cadastro.html',
 'onboarding/index.html','app/index.html','app/aparencia.html',
 'app/agenda.html','app/clientes.html','app/funcionarios.html',
 'app/servicos.html','app/estoque.html','app/plano.html',
 'app/configuracoes.html','app/royal-ai.html','app/recepcao-contas.html',
 'super-admin/index.html','store/index.html','store/barbearia.html',
 'store/reservar.html','store/recepcao.html'
];
const drawerJs=readFileSync('assets/js/app.js','utf8');
const drawerStart=drawerJs.indexOf('// Mobile drawer:');
const drawerEnd=drawerJs.indexOf("$('#logout')?.addEventListener",drawerStart);
assert.ok(drawerStart>=0&&drawerEnd>drawerStart,'Mobile menu code must be present');
const isolatedDrawer="const $ = selector => document.querySelector(selector);\n"+
 drawerJs.slice(drawerStart,drawerEnd);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},
 isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage();
page.setDefaultTimeout(5000);
// Suppress network/auth while retaining every real HTML and CSS rule.
await page.route(/\.js(?:\?.*)?$/,route=>route.fulfill({
 status:200,contentType:'application/javascript',body:''
}));
const failures=[];let passed=0;
try{
 for(const path of pages){
  for(const width of widths){
   const height=width<=430?740:width<=600?780:900;
   await page.setViewportSize({width,height});
   await page.goto(origin+'/'+path,{waitUntil:'load',timeout:12000});
   if(path==='app/aparencia.html'){
    await page.evaluate(()=>{
     document.querySelector('#barberDesigner').hidden=false;
     document.querySelectorAll('#designerForm fieldset').forEach(el=>el.hidden=false);
    });
   }
   if(path==='store/barbearia.html'){
    await page.evaluate(()=>{
     document.querySelectorAll('#app .section').forEach(el=>{
      el.classList.add('active');el.hidden=false;
     });
     const cards=document.querySelector('#planGrid');
     if(cards){
      cards.innerHTML='<article class="card"><h3>Plano completo</h3><p>Benefícios personalizados e agendamentos semanais</p></article>';
     }
     const gallery=document.querySelector('#clientShopGallery');
     if(gallery)gallery.innerHTML='<figure><div style="width:100%;aspect-ratio:4/3;background:#293544"></div><figcaption>Nosso espaço</figcaption></figure>';
    });
   }
   if(path==='store/index.html'){
    await page.evaluate(()=>{
     document.querySelector('#catalog').innerHTML=Array.from({length:4},(_,i)=>
       '<article class="store-card"><div class="store-placeholder">Imagem</div>'+
       '<div class="body"><h3>Serviço ou produto especial '+i+
       '</h3><p>Descrição detalhada de serviço ou produto</p>'+
       '<strong>R$ 30,00</strong></div></article>').join('');
    });
   }
   if(path==='store/recepcao.html'){
    await page.evaluate(()=>{
     const dash=document.querySelector('#dashboard');dash.hidden=false;
     document.querySelector('#requestRows').innerHTML=
       '<tr><td>12/11/2026 às 10:00</td><td>Cliente de demonstração</td><td>Corte</td>'+
       '<td>Pendente</td><td><button>Confirmar</button><button>Recusar</button></td></tr>';
     document.querySelector('#appointmentRows').innerHTML=
       '<tr><td>12/11/2026 às 10:00</td><td>Cliente de demonstração</td><td>Corte</td>'+
       '<td>Confirmado</td><td><button>Concluir</button></td></tr>';
    });
   }
   const dims=await page.evaluate(()=>{
    const w=window.innerWidth;
    const r=el=>{const x=el.getBoundingClientRect();return {
      left:Math.round(x.left),right:Math.round(x.right),width:Math.round(x.width)}};
    const overflowing=[...document.querySelectorAll('body *')]
      .filter(el=>{
       const st=getComputedStyle(el);
       if(st.display==='none'||st.visibility==='hidden')return false;
       const rect=el.getBoundingClientRect();
       if(rect.width===0||rect.height===0)return false;
       // Horizontal scroll *inside* tables is intentional.
       return rect.right>w+3&&rect.left<w+3&&!el.closest('.table-wrap,.table-scroll');
      }).slice(0,5).map(el=>({tag:el.tagName,selector:el.id||el.className||'',
       rect:r(el)}));
    return {viewport:w,doc:document.documentElement.scrollWidth,
     body:document.body.scrollWidth,offenders:overflowing};
   });
   const good=dims.doc<=width+2&&dims.body<=width+2;
   if(!good)failures.push({page:path,width,...dims});
   else passed++;
   if(path==='store/barbearia.html'&&width<=620){
    const nav=await page.locator('#app .sidebar .nav').boundingBox();
    const taps=await page.locator('#app .sidebar .nav button').evaluateAll(els=>
      els.map(el=>({width:Math.round(el.getBoundingClientRect().width),
       height:Math.round(el.getBoundingClientRect().height),
       label:el.getAttribute('aria-label')})));
    if(!nav||nav.y<height-130||nav.y+nav.height>height+2||
       taps.length!==5||taps.some(x=>x.width<36||x.height<44||!x.label))
      failures.push({page:path,width,nav,taps,error:'Mobile bottom tabs not accessible'});
   }
   if(path==='app/index.html'&&width<=900){
    await page.addScriptTag({content:isolatedDrawer});
    await page.locator('#menuToggle').click();
    const open=await page.locator('#sidebar').evaluate(el=>el.classList.contains('open'));
    const expanded=await page.locator('#menuToggle').getAttribute('aria-expanded');
    if(!open||expanded!=='true')failures.push({page:path,width,error:'Drawer did not open'});
    await page.locator('#sidebarBackdrop').click({position:{x:width-10,y:Math.min(height-10,120)}});
    const closed=await page.locator('#sidebar').evaluate(el=>!el.classList.contains('open'));
    const unlocked=await page.locator('body').evaluate(el=>!el.classList.contains('mobile-nav-open'));
    if(!closed||!unlocked)failures.push({page:path,width,error:'Drawer did not close and unlock'});
   }
  }
 }
 console.log('MOBILE_BROWSER_RESULTS '+JSON.stringify({views:pages.length,widths,passed,failures:failures.slice(0,15)}));
 assert.equal(failures.length,0,
  'Mobile layout regressions: '+JSON.stringify(failures.slice(0,6)));
}finally{
 await context.close();
 await browser.close();
 await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}
