import {supabase} from './supabase.js';
import {getBusinessContext,uploadTenantAsset} from './business.js';

const get=id=>document.getElementById(id);
const fields=['signatureMode','signatureStart','signatureEnd','signatureAngle','fontSize','sectionGap','cardRadius','contentWidth','buttonColor','mutedColor',
 'navigationBackground','cardBackground','heroTitle','heroSubtitle','bookingTitle',
 'bookingButtonLabel','clubTitle','clubDescription','plansTitle','plansDescription',
 'profileTitle','profileDescription','appointmentsTitle','footerText','showClub','showPlans','showProfile'];
const defaults={signatureMode:'solid',signatureStart:'#D4AF37',signatureEnd:'#F4DC8A',signatureAngle:135,
 fontSize:15,sectionGap:28,cardRadius:18,contentWidth:1280,
 buttonColor:'#D4AF37',mutedColor:'#AAA99F',navigationBackground:'#07182A',cardBackground:'#0A1018',
 heroTitle:'Seu estilo. Nossa assinatura.',
 heroSubtitle:'Atendimento personalizado em um único espaço. Selecione o serviço, a data e um horário disponível.',
 bookingTitle:'Agendar atendimento',bookingButtonLabel:'Solicitar horário',
 clubTitle:'Barbearia',clubDescription:'Conheça nosso ambiente e os serviços disponíveis.',
 plansTitle:'Planos',plansDescription:'Confira os benefícios de nossos planos.',
 profileTitle:'Perfil e atendimento',profileDescription:'Gerencie suas informações e seus horários.',
 appointmentsTitle:'Agendamentos',footerText:'',
 showClub:true,showPlans:true,showProfile:true,
 backgroundImageUrl:'',heroImageUrl:'',gallery:[],plans:[]
};
let ctx=null,design={...defaults},saving=false;
const isUrl=value=>{
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname.endsWith('.supabase.co')}catch{return false}
};
const status=(text,error=false)=>{
 get('designerStatus').textContent=text;
 get('designerStatus').className='status show '+(error?'error':'ok');
};
function fieldValue(name){
 const el=get(name);return el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;
}
function planEditor(plan={}){
 const box=document.createElement('div');box.className='card';
 box.style.cssText='display:grid;gap:8px;padding:14px';
 for(const [key,label,type,value] of [
  ['name','Nome do plano','text',plan.name||''],
  ['price','Valor anunciado (R$)','number',plan.price??''],
  ['description','Descrição','text',plan.description||''],
  ['features','Benefícios (um por linha)','textarea',(plan.features||[]).join('\n')]
 ]){
  const field=document.createElement('label');field.className='field';
  field.textContent=label;
  const input=document.createElement(type==='textarea'?'textarea':'input');
  if(type!=='textarea')input.type=type;
  if(type==='number'){input.min='0';input.step='0.01'}
  input.dataset.planField=key;input.value=String(value);input.maxLength=key==='features'?500:230;
  field.append(input);box.append(field);
 }
 const button=document.createElement('button');button.type='button';button.className='btn';
 button.textContent='Remover plano';button.addEventListener('click',()=>{box.remove();preview()});
 box.append(button);
 get('plansEditor').append(box);
}
function galleryEditor(photo={}){
 const box=document.createElement('div');box.className='card';
 box.style.cssText='display:flex;gap:12px;align-items:center;padding:12px;flex-wrap:wrap';
 const url=String(photo.url||'');
 if(isUrl(url)){
  const img=document.createElement('img');img.src=url;img.alt='Foto do ambiente';
  img.style.cssText='width:90px;height:75px;object-fit:cover;border-radius:10px';box.append(img);
 }
 const input=document.createElement('input');input.dataset.galleryUrl='1';input.value=url;input.type='hidden';
 const caption=document.createElement('input');caption.dataset.galleryCaption='1';
 caption.value=String(photo.caption||'');caption.placeholder='Legenda da imagem';caption.maxLength=100;
 caption.style.minWidth='180px';
 const remove=document.createElement('button');remove.type='button';remove.className='btn';
 remove.textContent='Remover';remove.addEventListener('click',()=>{box.remove();preview()});
 box.append(input,caption,remove);get('galleryEditor').append(box);
}
function readPlans(){
 return [...get('plansEditor').children].map(box=>{
  const values=Object.fromEntries([...box.querySelectorAll('[data-plan-field]')].map(i=>[i.dataset.planField,i.value.trim()]));
  return {
   name:values.name.slice(0,65),
   price:Math.max(0,Number(values.price)||0),
   description:values.description.slice(0,230),
   features:(values.features||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,8)
  };
 }).filter(x=>x.name).slice(0,8);
}
function readGallery(){
 return [...get('galleryEditor').children].map(box=>({
  url:box.querySelector('[data-gallery-url]').value,
  caption:box.querySelector('[data-gallery-caption]').value.trim().slice(0,100)
 })).filter(x=>isUrl(x.url)).slice(0,12);
}
const THEME_PALETTES={"gold":["#D4AF37","#F4DC8A"],"navy":["#061441","#143B8A"],"sea":["#087E9A","#54D5C5"],"ocean":["#003C6C","#049DCD"],"silver":["#8A96A6","#F0F3F7"],"sky":["#327EE8","#A7E6FF"]};
const GRADIENT_KEYS=['primary','secondary','background','text'];
const validColor=x=>typeof x==='string'&&/^#[0-9a-f]{6}$/i.test(x);
function sanitizeGradient(x,base='#D4AF37'){const a=x&&typeof x==='object'?x:{};return {mode:a.mode==='gradient'?'gradient':'solid',start:validColor(a.start)?a.start:base,end:validColor(a.end)?a.end:base,angle:Number.isFinite(+a.angle)?Math.max(0,Math.min(360,+a.angle)):135};}
function gradientCss(g){return g.mode==='gradient'?'linear-gradient('+g.angle+'deg,'+g.start+','+g.end+')':g.start;}

function signaturePreview(){
 const mode=get('signatureMode').value;
 const g=sanitizeGradient({mode,start:get('signatureStart').value,end:get('signatureEnd').value,angle:+get('signatureAngle').value});
 get('signatureSample').style.background=gradientCss(g);
 get('signatureAngleOut').textContent=g.angle+'°';
 const title=get('designerPreviewTitle');title.replaceChildren();
 const text=get('heroTitle').value||'Sua barbearia';const sig='Nossa assinatura.';const i=text.toLocaleLowerCase('pt-BR').indexOf(sig.toLocaleLowerCase('pt-BR'));
 if(i<0){title.textContent=text;return}
 title.append(document.createTextNode(text.slice(0,i)));
 const span=document.createElement('span');span.textContent=text.slice(i,i+sig.length);
 if(g.mode==='gradient'){span.style.background=gradientCss(g);span.style.backgroundClip='text';span.style.webkitBackgroundClip='text';span.style.webkitTextFillColor='transparent'}
 else span.style.color=g.start;
 title.append(span,document.createTextNode(text.slice(i+sig.length)));
}
get('signaturePreset').addEventListener('change',()=>{const pair=THEME_PALETTES[get('signaturePreset').value];if(!pair)return;get('signatureStart').value=pair[0];get('signatureEnd').value=pair[1];preview()});
function preview(){signaturePreview();
 for(const name of fields.filter(x=>x.endsWith('Size')||['sectionGap','cardRadius','contentWidth'].includes(x))){
  const output=get(name+'Out');if(output)output.textContent=get(name).value+'px';
 }
 const designEl=get('designerPreview');
 designEl.style.background=get('cardBackground').value;
 designEl.style.color=get('mutedColor').value;
 designEl.style.borderColor=get('buttonColor').value;
 designEl.style.borderRadius=get('cardRadius').value+'px';
 designEl.style.padding=Math.max(12,Number(get('sectionGap').value))+'px';
 designEl.style.fontSize=get('fontSize').value+'px';
 
 get('designerPreviewTitle').style.color=get('mutedColor').value;
 get('designerPreviewSubtitle').textContent=get('heroSubtitle').value||'';
 get('designerPreviewBadge').textContent=['Serviços',get('showClub').checked?'Barbearia':'',
   get('showPlans').checked?'Planos':'',get('showProfile').checked?'Perfil':''].filter(Boolean).join(' · ');
 const bg=design.backgroundImageUrl;
 designEl.style.backgroundImage=isUrl(bg)?'linear-gradient(#0007,#0009),url("'+bg+'")':'none';
 designEl.style.backgroundSize='cover';
 designEl.style.backgroundPosition='center';
}
function fill(d){
 design={...defaults,...(d&&typeof d==='object'&&!Array.isArray(d)?d:{})};
 for(const name of fields){
  const el=get(name);
  if(el.type==='checkbox')el.checked=design[name]!==false;
  else el.value=String(design[name]??defaults[name]);
 }
 get('signaturePreset').value='custom';get('galleryEditor').replaceChildren();
 (Array.isArray(design.gallery)?design.gallery:[]).slice(0,12).forEach(galleryEditor);
 get('plansEditor').replaceChildren();
 (Array.isArray(design.plans)?design.plans:[]).slice(0,8).forEach(planEditor);
 preview();
}
function collect(){
 const d={...design,backgroundImageUrl:design.backgroundImageUrl||'',heroImageUrl:design.heroImageUrl||''};
 for(const name of fields)d[name]=fieldValue(name);
 d.heroTitle=String(d.heroTitle).slice(0,110);
 d.heroSubtitle=String(d.heroSubtitle).slice(0,350);
 d.clubDescription=String(d.clubDescription).slice(0,1600);
 d.plans=readPlans();d.gallery=readGallery();
 return d;
}
async function uploadAndAdd(file,field){
 if(!file)return;
 status('Enviando imagem de sua loja...');
 const url=await uploadTenantAsset(ctx.tenant.id,file,'branding');
 if(field==='gallery')galleryEditor({url,caption:''});
 else design[field]=url;
 preview();
 status('Imagem enviada. Salve a personalização para publicar.');
}
async function boot(){
 try{
  ctx=await getBusinessContext();
  if(!['owner','admin'].includes(ctx.membership.role)||ctx.tenant.template_code!=='barbershop')return;
  const {data,error}=await supabase.from('saas_store_themes').select('design_settings')
   .eq('tenant_id',ctx.tenant.id).single();
  if(error)throw error;
  fill(data.design_settings);
  get('barberDesigner').hidden=false;
 }catch(e){status(e.message||'Não foi possível abrir o editor.',true)}
}
for(const button of document.querySelectorAll('[data-editor]')){
 button.addEventListener('click',()=>{
  const section=button.dataset.editor;
  for(const panel of document.querySelectorAll('#designerForm fieldset[id^="editor-"]'))
   panel.hidden=panel.id!=='editor-'+section;
  for(const sibling of document.querySelectorAll('[data-editor]'))
   sibling.classList.toggle('primary',sibling===button);
 });
}
get('designerForm').addEventListener('input',preview);
get('addPlan').addEventListener('click',()=>{
 if(get('plansEditor').children.length>=8)return status('Máximo de oito planos.',true);
 planEditor();preview();
});
for(const [id,field] of [
 ['backgroundFile','backgroundImageUrl'],['heroFile','heroImageUrl'],['galleryFile','gallery']
]){
 get(id).addEventListener('change',async()=>{
  const file=get(id).files?.[0];if(!file)return;
  try{
   if(!ctx)throw new Error('Acesso não autorizado.');
   if(field==='gallery'&&get('galleryEditor').children.length>=12)throw new Error('Máximo de doze fotos.');
   await uploadAndAdd(file,field);
  }catch(e){status(e.message,true)}
  finally{get(id).value=''}
 });
}
get('designerForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(saving||!ctx||!['owner','admin'].includes(ctx.membership.role))return;
 saving=true;
 const button=get('designerForm').querySelector('button[type="submit"]');
 button.disabled=true;
 try{
  const next=collect();
  const {error}=await supabase.from('saas_store_themes')
   .update({design_settings:next}).eq('tenant_id',ctx.tenant.id);
  if(error)throw error;
  design=next;
  status('Personalização salva. Na loja publicada, as alterações já estão disponíveis.');
  preview();
 }catch(e){status(e.message||'Não foi possível salvar as alterações.',true)}
 finally{saving=false;button.disabled=false}
});
void boot();
