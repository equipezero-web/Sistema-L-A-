import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sql=readFileSync('supabase/sql/saas_public_assets_hardening.sql','utf8');
const js=readFileSync('assets/js/business.js','utf8');
const appearance=readFileSync('app/aparencia.html','utf8');

test('Bucket only permits raster images and limits files to 5 MB',()=>{
 assert.match(sql,/array\['image\/png','image\/jpeg','image\/webp'\]::text\[\]/);
 assert.match(sql,/file_size_limit = 5242880/);
 assert.doesNotMatch(sql,/image\/svg\+xml/);
 assert.doesNotMatch(appearance,/image\/svg\+xml|PNG, JPG, WEBP ou SVG/);
});
test('Storage policies enforce both tenant ownership and active status',()=>{
 assert.match(sql,/public\.saas_has_tenant_role\(/);
 assert.match(sql,/public\.saas_tenants t[\s\S]*t\.active is true/);
 assert.match(sql,/\(branding\|products\|services\|catalog\)/);
 for(const verb of ['select','insert','update','delete'])
   assert.match(sql,new RegExp('create policy saas_public_assets_owner_'+verb+' on storage\\.objects'));
 assert.match(sql,/for update to authenticated using \([\s\S]*?\) with check \(/);
 assert.doesNotMatch(sql,/to anon/i);
});
test('Storage authorizer is invoker-only and unavailable to anon',()=>{
 assert.match(sql,/security invoker/);
 assert.match(sql,/revoke all on function public\.saas_can_manage_public_asset\(text\) from public, anon, authenticated/);
 assert.match(sql,/grant execute on function public\.saas_can_manage_public_asset\(text\) to authenticated/);
});
test('Frontend upload generates server-compatible UUID path and checks MIME',()=>{
 const snippet=js.slice(js.indexOf('export async function uploadTenantAsset'),js.indexOf('const PRODUCT_PUBLIC_COLUMNS'));
 assert.ok(snippet.startsWith('export async function uploadTenantAsset'));
 const source=snippet.replace(/^export /,'');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(snippet,/\['branding','products','services','catalog'\]/);
 assert.match(snippet,/crypto\.randomUUID\(\)/);
 assert.match(snippet,/if\(!ext\) throw new Error/);
 assert.match(snippet,/const extensions=\{'image\/png':'png','image\/jpeg':'jpg','image\/webp':'webp'\}/);
 assert.doesNotMatch(snippet,/file\.name\.split/);
});
