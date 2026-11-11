import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const cases=[
 {file:'servicos',kind:'Serviço',saveFn:'saveService',listFn:'listServices',name:'Serviço teste'},
 {file:'clientes',kind:'Cliente',saveFn:'saveCustomer',listFn:'listCustomers',name:'Cliente teste'},
 {file:'funcionarios',kind:'Funcionário',saveFn:'saveEmployee',listFn:'listEmployees',name:'Funcionário teste'},
 {file:'produtos',kind:'Produto',saveFn:'saveProduct',listFn:'listProducts',name:'Produto teste'}
];

async function scenario(item,{role='owner',canManage=true,loadError=null}={}){
 const html=readFileSync('app/'+item.file+'.html','utf8');
 const src=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(src,item.file+' script module must exist');
 const executable=src.replace(/^import\{[^}]+\}from'[^']+';/,'');
 assert.notEqual(executable,src,item.file+' import must be removed for VM harness');
 const knownIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const nodes=new Map(),writes=[],calls=[],nav=[];
 function el(id){
  assert.ok(knownIds.includes(id),'Unbound HTML ID '+id+' in '+item.file);
  if(!nodes.has(id)){
   const classes=new Set();
   const node={
    id,value:id==='filter'?'all':'',innerHTML:'',textContent:'',
    src:'',checked:false,disabled:false,files:[],
    style:{},classList:{add:v=>classes.add(v),contains:v=>classes.has(v)},
    reset(){},querySelector(selector){assert.equal(selector,'button[type="submit"]');return {disabled:false,textContent:'Salvar'}},
    showModal(){this.open=true},close(){this.open=false}
   };
   nodes.set(id,node);
  }
  return nodes.get(id);
 }
 const funcs={
  getBusinessContext:async()=>({
   tenant:{id:'tenant-test',name:'Lapis Servidor'},
   membership:{role},
   canManage
  }),
  listServices:async()=>{calls.push('listServices');if(loadError)throw loadError;return []},
  listCustomers:async()=>{calls.push('listCustomers');if(loadError)throw loadError;return []},
  listEmployees:async()=>{calls.push('listEmployees');if(loadError)throw loadError;return []},
  listProducts:async()=>{calls.push('listProducts');if(loadError)throw loadError;return []},
  saveService:async(_tenant,payload)=>{writes.push({entity:'service',payload});return {id:'new-service'}},
  saveCustomer:async(_tenant,payload)=>{writes.push({entity:'customer',payload});return {id:'new-customer'}},
  saveEmployee:async(_tenant,payload)=>{writes.push({entity:'employee',payload});return {id:'new-employee'}},
  saveProduct:async(_tenant,payload)=>{writes.push({entity:'product',payload});return {id:'new-product'}},
  archiveService:async()=>{}, archiveCustomer:async()=>{},
  archiveEmployee:async()=>{},archiveProduct:async()=>{},
  setServicePublished:async()=>{},setProductPublished:async()=>{},
  uploadTenantAsset:async()=>{throw new Error('Unexpected test upload')}
 };
 const location={replace:x=>nav.push(x)};
 // Host browser properties like window.name and window.status are deliberately NOT nodes.
 const ctx={...funcs,document:{getElementById:el},location,
  name:'native-window-name',status:'native-window-status',close:()=>{throw new Error('window.close must not be used')},
  URL:{createObjectURL:()=> 'blob:test'},confirm:()=>true,
  console,Number,Intl
 };
 await vm.runInNewContext('(async()=>{'+executable+'})()',ctx);
 const node=id=>el(id);
 return {html,src,node,writes,calls,nav};
}

for(const item of cases){
 test(item.file+': + Novo opens real dialog despite browser global name/status',async()=>{
  const r=await scenario(item);
  assert.equal(typeof r.node('newBtn').onclick,'function');
  r.node('newBtn').onclick();
  assert.equal(r.node('modal').open,true);
  assert.equal(r.node('name').value,'');
  assert.ok(r.node('form').onsubmit,'Save listener must exist');
  assert.match(r.src,/const ui = Object.fromEntries/);
  assert.match(r.html,/type="submit">Salvar/);
 });
 test(item.file+': cancel and close buttons dismiss dialog',async()=>{
  const r=await scenario(item);
  r.node('newBtn').onclick();
  r.node('close').onclick();
  assert.equal(r.node('modal').open,false);
  r.node('newBtn').onclick();
  r.node('cancel').onclick();
  assert.equal(r.node('modal').open,false);
 });
 test(item.file+': creates record and displays success',async()=>{
  const r=await scenario(item);
  r.node('newBtn').onclick();
  r.node('name').value=item.name;
  if(item.file==='servicos'){
   r.node('price').value='25';
   r.node('duration').value='45';
   r.node('serviceStatus').value='active';
  }else if(item.file==='clientes'){
   r.node('phone').value='';
   r.node('email').value='test@example.invalid';
   r.node('customerStatus').value='active';
  }else if(item.file==='funcionarios'){
   r.node('specialty').value='Teste';
   r.node('employeeStatus').value='active';
  }else{
   r.node('price').value='30';
   r.node('stock').value='1';
   r.node('productStatus').value='active';
  }
  const submit={disabled:false,textContent:'Salvar'};
  await r.node('form').onsubmit({preventDefault(){},submitter:submit});
  assert.equal(r.writes.length,1);
  assert.equal(r.writes[0].payload.name,item.name);
  assert.equal(r.node('modal').open,false);
  assert.match(r.node('status').textContent,/salv[oa] com sucesso/i);
  assert.equal(submit.disabled,false);
  assert.equal(r.calls.filter(x=>x===item.listFn).length,2);
 });
}

test('Non-managers cannot see new service or customer buttons',async()=>{
 for(const file of ['servicos','clientes','produtos']){
  const item=cases.find(x=>x.file===file);
  const r=await scenario(item,{role:'employee',canManage:false});
  assert.equal(r.node('newBtn').classList.contains('hidden'),true);
 }
});

test('Employees module only allows owner/admin and redirects others',async()=>{
 const item=cases.find(x=>x.file==='funcionarios');
 const r=await scenario(item,{role:'employee',canManage:false});
 assert.deepEqual(r.nav,['./index.html']);
 assert.equal(r.node('newBtn').onclick,undefined);
});

test('Loading failures are visible through the explicit status element',async()=>{
 for(const item of cases){
  const r=await scenario(item,{loadError:new Error('Falha ao consultar registros')});
  assert.match(r.node('status').textContent,/Falha ao consultar registros/);
  assert.equal(r.node('status').className,'status show error');
 }
});
