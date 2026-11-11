import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync('store/index.html', 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(source, 'Store must have a module');
const compiled = source.replace(/^import\s*\{\s*supabase\s*\}\s*from\s*'[^']+';/, '');
assert.notEqual(compiled, source, 'Import must be mocked for isolated tests');

const publishedStore = {
  tenant_id: 'tenant-test', name: 'Lapis Servidor', business_type: 'Serviços',
  background_color: '#ffffff', text_color: '#111111', primary_color: '#c9a227',
  font_style: 'Inter', logo_url: null
};
const publishedItem = {
  item_type: 'service', name: 'Serviço demonstrativo', description: 'Exemplo',
  price: 25, duration_minutes: 30, in_stock: true, image_url: null
};

async function scenario({
  slug = 'lapis-servidor', store = publishedStore, catalog = [publishedItem],
  storeError = null, catalogError = null
} = {}) {
  const nodes = new Map(), requests = [], warnings = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: id === 'storeName' ? 'Carregando loja...' : '',
      innerHTML: '', src: '', hidden: true, style: {}
    });
    return nodes.get(id);
  };
  const doc = {
    title: 'Loja | L&A Royal SaaS',
    getElementById: node,
    body: { style: {}, dataset: {} },
    documentElement: { style: { setProperty() {} } }
  };
  const supabase = {
    from(name) {
      requests.push(name);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle: async () => ({ data: store, error: storeError }),
        order: async () => ({ data: catalog, error: catalogError })
      };
      return chain;
    }
  };
  const browserWindow = { __laPublicStoreSettled: false };
  const context = {
    supabase, document: doc, window: browserWindow, URL, URLSearchParams,
    location: {
      search: slug === null ? '' : '?slug=' + encodeURIComponent(slug),
      href: 'https://equipezero-web.github.io/Sistema-L-A-/store/'
    },
    console: { warn: (...args) => warnings.push(args) }, Intl, Number
  };
  vm.runInNewContext(compiled, context, { filename: 'store/index.html' });
  await new Promise(resolve => setImmediate(resolve));
  return { node, doc, requests, browserWindow, warnings };
}

test('Public store module parses without SyntaxError', () => {
  assert.doesNotThrow(() => new vm.Script(compiled));
  assert.doesNotMatch(compiled, /\.join\(''\)\}\}\}\}function esc/);
});

test('Published store and public catalogue render with anonymous read-only queries', async () => {
  const r = await scenario();
  assert.equal(r.node('storeName').textContent, 'Lapis Servidor');
  assert.equal(r.node('storeType').textContent, 'Serviços');
  assert.match(r.node('catalog').innerHTML, /Serviço demonstrativo/);
  assert.match(r.node('catalog').innerHTML, /R\$\s*25,00/);
  assert.equal(r.node('storeStatus').textContent, '1 item(ns) disponível(is)');
  assert.deepEqual(r.requests, ['saas_public_stores', 'saas_public_catalog_items']);
  assert.equal(r.browserWindow.__laPublicStoreSettled, true);
});

test('Missing slug shows a real message instead of an endless spinner', async () => {
  const r = await scenario({ slug: null });
  assert.equal(r.node('storeName').textContent, 'Loja não informada');
  assert.equal(r.requests.length, 0);
  assert.equal(r.browserWindow.__laPublicStoreSettled, true);
});

test('Unpublished or unknown store shows unavailable state', async () => {
  const r = await scenario({ store: null });
  assert.equal(r.node('storeName').textContent, 'Loja indisponível');
  assert.match(r.node('storeStatus').textContent, /não está publicada/);
  assert.equal(r.browserWindow.__laPublicStoreSettled, true);
});

test('Empty catalogue displays useful feedback', async () => {
  const r = await scenario({ catalog: [] });
  assert.equal(r.node('storeName').textContent, 'Lapis Servidor');
  assert.match(r.node('storeStatus').textContent, /Nenhum produto ou serviço/);
  assert.equal(r.browserWindow.__laPublicStoreSettled, true);
});

test('Failed storefront request is caught and reported', async () => {
  const r = await scenario({ storeError: { message: 'Network failure' } });
  assert.equal(r.node('storeName').textContent, 'Loja temporariamente indisponível');
  assert.match(r.node('storeStatus').textContent, /Não foi possível consultar/);
  assert.equal(r.browserWindow.__laPublicStoreSettled, true);
});

test('Failed catalogue request preserves store name and exposes the error', async () => {
  const r = await scenario({ catalogError: { message: 'API unavailable' } });
  assert.equal(r.node('storeName').textContent, 'Lapis Servidor');
  assert.match(r.node('storeStatus').textContent, /Não foi possível carregar o catálogo/);
  assert.equal(r.browserWindow.__laPublicStoreSettled, true);
});

test('Escapes catalogue fields and rejects non-HTTPS image URLs', async () => {
  const r = await scenario({ catalog: [{
    ...publishedItem, name: '<img src=x onerror=alert(1)>',
    image_url: 'javascript:alert(1)', description: '<script>alert(1)</script>'
  }] });
  const rendered = r.node('catalog').innerHTML;
  assert.ok(rendered.includes('&lt;img'));
  assert.ok(rendered.includes('&lt;script&gt;'));
  assert.ok(!rendered.includes('src="javascript:'));
  assert.ok(!rendered.includes('<script>'));
});

test('Fallback displays error when external module cannot load', () => {
  assert.match(html, /window\.setTimeout\(function \(\)/);
  assert.match(html, /window\.__laPublicStoreSettled/);
  assert.match(html, /Não foi possível concluir o carregamento/);
});

test('Barbershop storefront uses its own presentation and existing public services',async()=>{
 const r=await scenario({store:{...publishedStore,template_code:'barbershop',business_type:'Barbearia'}});
 assert.equal(r.doc.body.dataset.template,'barbershop');
 assert.equal(r.node('storeModelLabel').textContent,'BARBEARIA');
 assert.match(r.node('storeIntro').textContent,/atendimento/);
 assert.match(r.node('catalog').innerHTML,/Serviço demonstrativo/);
 assert.match(r.node('templateNotice').textContent,/agendamento online ainda não está habilitado/);
});
test('Virtual store receives its own storefront identity',async()=>{
 const r=await scenario({store:{...publishedStore,template_code:'virtual_store'}});
 assert.equal(r.doc.body.dataset.template,'virtual_store');
 assert.equal(r.node('storeModelLabel').textContent,'LOJA VIRTUAL');
 assert.match(r.node('storeIntro').textContent,/produtos/);
});
test('Instagram package storefront does not falsely claim submitted orders',async()=>{
 const r=await scenario({store:{...publishedStore,template_code:'instagram_orders'}});
 assert.equal(r.doc.body.dataset.template,'instagram_orders');
 assert.match(r.node('templateNotice').textContent,/geração de pedidos.*integração/);
});
test('Business communication never exposes a public customer catalog or internal messages',async()=>{
 const r=await scenario({store:{...publishedStore,template_code:'business_communication'}});
 assert.equal(r.doc.body.dataset.template,'business_communication');
 assert.equal(r.node('catalog').hidden,true);
 assert.match(r.node('storeStatus').textContent,/Acesso restrito/);
 assert.deepEqual(r.requests,['saas_public_stores']);
 assert.equal(r.browserWindow.__laPublicStoreSettled,true);
});
