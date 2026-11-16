import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const sales=read('assets/js/vendas.js');
const finance=read('assets/js/financeiro.js');
const agenda=read('assets/js/agenda.js');
const reports=read('app/relatorios.html');
const shop=read('app/aparencia.html');
const shopJs=read('assets/js/appearance.js');
const dashboard=read('app/index.html');
const financeHtml=read('app/financeiro.html');

const inline=html=>html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
const normalize=source=>source
 .replace(/\bimport\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g,'')
 .replace(/import\.meta\.url/g,"'https://example.invalid/app/agenda.html'");

test('Vendas and Financeiro escape database-originated text before HTML insertion',()=>{
 assert.match(sales,/const escapeHtml=/);
 assert.match(sales,/escapeHtml\(o\.saas_customers\?\.name/);
 assert.match(sales,/escapeHtml\(x\.name\)/);
 assert.match(sales,/escapeHtml\(o\.status\)/);
 assert.match(finance,/escapeHtml\(x\.description\)/);
 assert.match(finance,/escapeHtml\(x\.category\|\|'—'\)/);
 assert.match(finance,/escapeHtml\(x\.reference_type\|\|'Manual'\)/);
});
test('Order form validates every item rather than silently dropping invalid quantities',()=>{
 assert.match(sales,/selected\.some\(x=>!x\.p\|\|!Number\.isSafeInteger\(x\.q\)\|\|x\.q<1\)/);
 assert.match(sales,/saas_create_order_atomic/);
});
test('Finance and reporting exports include headers and use tenant-scoped data',()=>{
 for(const id of ['financeFrom','financeTo','financeSearch','financeExport'])assert.match(financeHtml,new RegExp('id="'+id+'"'));
 assert.match(finance,/\.eq\('tenant_id',ctx\.tenant\.id\)/);
 assert.match(finance,/function exportFinance\(/);
 assert.match(finance,/csvCell/);
 assert.match(reports,/id="exportCsv"/);
 assert.match(inline(reports),/saas_report_summary/);
 assert.match(inline(reports),/function exportReport/);
 assert.match(inline(reports),/\['Empresa',companyName\]/);
});
test('Dashboard is explicitly illustrative and store theme has honest device preview',()=>{
 assert.match(dashboard,/id="chartIllustrationNote"/);
 assert.match(dashboard,/Gráfico ilustrativo/);
 assert.match(shop,/id="previewDesktop"/);
 assert.match(shop,/id="previewMobile"/);
 assert.match(shopJs,/function setPreviewDevice/);
});
test('Agenda links to canonical storefront, not deprecated duplicate booking page',()=>{
 assert.match(agenda,/store\/\?slug=/);
 assert.doesNotMatch(agenda,/store\/reservar\.html\?slug=/);
});
test('Updated JavaScript syntax remains valid',()=>{
 for(const source of [sales,finance,agenda,shopJs,inline(reports)])
  assert.doesNotThrow(()=>new vm.Script(normalize(source)));
});
