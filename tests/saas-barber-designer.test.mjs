import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const sql=readFileSync('supabase/sql/saas_barber_full_designer_65.sql','utf8');
const page=readFileSync('app/aparencia.html','utf8');
const designer=readFileSync('assets/js/appearance-designer.js','utf8');
const publicPage=readFileSync('store/barbearia.html','utf8');
const storefront=readFileSync('assets/js/barber-original-template.js','utf8');
const identifiers=['backgroundFile','heroFile','fontSize','sectionGap','cardRadius','contentWidth',
 'buttonColor','mutedColor','navigationBackground','cardBackground','heroTitle','heroSubtitle',
 'bookingTitle','bookingButtonLabel','clubTitle','clubDescription','galleryFile','galleryEditor',
 'plansTitle','plansDescription','plansEditor','profileTitle','profileDescription',
 'appointmentsTitle','footerText','showClub','showPlans','showProfile','designerForm'];
test('Original client layout has section-wide customizable styling',()=>{
 for(const id of identifiers)assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(publicPage,/--designer-gap/);
 assert.match(publicPage,/--designer-radius/);
 assert.match(publicPage,/--designer-width/);
 assert.match(publicPage,/--designer-card/);
 assert.match(publicPage,/--designer-navigation/);
 assert.match(publicPage,/--designer-font/);
 assert.match(publicPage,/#app \[hidden\]/);
});
test('Only published companies mirror safe design settings from private themes',()=>{
 assert.match(sql,/alter table public\.saas_store_themes/);
 assert.match(sql,/alter table public\.saas_public_stores/);
 assert.match(sql,/octet_length\(design_settings::text\)<=24000/);
 assert.match(sql,/not public\.saas_has_commercial_access\(p_tenant_id\)/);
 assert.match(sql,/not th\.published/);
 assert.match(sql,/th\.design_settings/);
 assert.match(sql,/design_settings=excluded\.design_settings/);
 assert.doesNotMatch(sql,/alter table public\.saas_subscriptions|update public\.saas_subscriptions/);
});
test('Designer handles multiple sections and only stores tenant scoped theme data',()=>{
 assert.match(designer,/ctx\.tenant\.template_code!=='barbershop'/);
 assert.match(designer,/getBusinessContext\(\)/);
 assert.match(designer,/uploadTenantAsset\(ctx\.tenant\.id,file,'branding'\)/);
 assert.match(designer,/\.update\(\{design_settings:next\}\)\.eq\('tenant_id',ctx\.tenant\.id\)/);
 assert.match(designer,/slice\(0,8\)/);
 assert.match(designer,/slice\(0,12\)/);
 assert.match(designer,/form\.addEventListener|designerForm'\)\.addEventListener/);
});
test('Storefront renders company plans and gallery as DOM text nodes, not untrusted HTML',()=>{
 assert.match(storefront,/design_settings/);
 assert.match(storefront,/function applyDesign/);
 assert.match(storefront,/document\.createElement\('figure'\)/);
 assert.match(storefront,/document\.createElement\('h3'\)/);
 assert.match(storefront,/li\.textContent=/);
 assert.match(storefront,/design\.showPlans!==false/);
 assert.match(storefront,/design\.showProfile!==false/);
 assert.match(storefront,/design\.showClub!==false/);
 assert.doesNotMatch(storefront,/innerHTML\s*=/);
 const strip=s=>s.replace(/^import\s*\{[^}]+\}\s*from\s*'[^']+';/gm,'');
 assert.doesNotThrow(()=>new vm.Script(strip(storefront)));
 assert.doesNotThrow(()=>new vm.Script(strip(designer)));
});
