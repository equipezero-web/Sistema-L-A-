import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync('assets/js/app.js','utf8');
const html=readFileSync('app/index.html','utf8');
const start=js.indexOf('function hideFinancialWidgets()');
const end=js.indexOf('function show(',start);
assert.ok(start>0 && end>start, 'Financial metric helpers should exist');
const snippet=js.slice(start,end);

async function scenario(role,{financeError=null,financeRows=[],orderCount=3}={}){
 const nodes=new Map();
 const node=id=>{
   if(!nodes.has(id)){
     const classes=new Set();
     nodes.set(id,{textContent:'',classList:{add(value){classes.add(value)},contains(value){return classes.has(value)}}});
   }
   return nodes.get(id);
 };
 const operations=[];
 const responses={
   saas_orders:{count:orderCount,error:null},
   saas_customers:{count:2,error:null},
   saas_appointments:{count:1,error:null},
   saas_financial_entries:{data:financeRows,error:financeError}
 };
 const supabase={from(table){
   const op={table,columns:null,options:null};
   operations.push(op);
   const chain={
     select(columns,options){op.columns=columns;op.options=options;return chain},
     eq(){return chain},gte(){return chain},neq(){return chain},
     then(resolve,reject){return Promise.resolve(responses[table]).then(resolve,reject)}
   };
   return chain;
 }};
 let errorMessage='';
 const context={
   supabase,
   document:{querySelector:node},
   Date,Intl,
   brl:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),
   show(value){errorMessage=value}
 };
 vm.runInNewContext(snippet+'\nmetrics("tenant-test",'+JSON.stringify(role)+')',context);
 await new Promise(resolve=>setImmediate(resolve));
 return {operations,node,get errorMessage(){return errorMessage}};
}

test('employee uses count-only operational queries and never queries finance',async()=>{
 const r=await scenario('employee');
 assert.deepEqual(r.operations.map(x=>x.table),['saas_orders','saas_customers','saas_appointments']);
 assert.equal(r.operations[0].columns,'id');
 assert.equal(r.operations[0].options.count,'exact');
 assert.equal(r.operations[0].options.head,true);
 assert.equal(r.node('#metricRevenueCard').classList.contains('hidden'),true);
 assert.equal(r.node('#financialSummary').classList.contains('hidden'),true);
 assert.equal(r.node('#metricOrders').textContent,3);
});

test('owner shows zero actual revenue, not completed-order fallback',async()=>{
 const r=await scenario('owner',{financeRows:[{kind:'expense',amount:14}]});
 assert.equal(r.operations.filter(x=>x.table==='saas_financial_entries').length,1);
 assert.equal(r.node('#metricRevenue').textContent,'R$ 0,00');
 assert.equal(r.node('#metricBalance').textContent,'-R$ 14,00');
});

test('administrator can read financial entries but does not request order totals',async()=>{
 const r=await scenario('admin',{financeRows:[{kind:'income',amount:50}]});
 assert.equal(r.node('#metricRevenue').textContent,'R$ 50,00');
 assert.equal(r.operations[0].columns,'id');
});

test('finance query failure is not mislabeled as zero revenue',async()=>{
 const r=await scenario('owner',{financeError:{message:'permission denied'}});
 assert.equal(r.node('#metricRevenue').textContent,'Indisponível');
 assert.match(r.errorMessage,/financeiros/);
});

test('dashboard links and metrics remain hidden until membership and settings pass',()=>{
 assert.match(html,/\.dashboard:not\(\.access-ready\) \.side-nav a/);
 assert.match(html,/\.dashboard:not\(\.access-ready\) \.metric-grid/);
 assert.match(js,/modules\(s,t\?\.business_mode,member.role\);if\(member.role==='employee'\)\{hideFinancialWidgets\(\)\}document.body.classList.add\('access-ready'\)/);
});
