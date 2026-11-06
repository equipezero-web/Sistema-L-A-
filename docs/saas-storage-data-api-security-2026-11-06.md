# L&A Royal SaaS — Etapa #47: Data API e Supabase Storage

Data: 2026-11-06. Projeto: `lthiztvnaxwrfyziypxd`.

## Inventário verificado
- Bucket único `saas-public-assets`: `public=true`, 5 MiB, inicialmente MIME PNG/JPEG/WEBP/SVG. `storage.objects` continha **zero objetos**.
- Quatro policies de `storage.objects`, previamente separadas por SELECT/INSERT/UPDATE/DELETE, exigiam `authenticated`, pasta `tenants/<tenant_id>/...` e `saas_has_tenant_role` com `owner/admin`.
- Dados empresariais: políticas de SELECT/INSERT/UPDATE/DELETE usam RLS por `tenant_id` e papel; tabelas `saas_public_catalog_items` e `saas_public_stores` intencionalmente permitem SELECT anônimo, com política restritiva de visibilidade da assinatura.

## Hardening implantado
Migration `saas_public_assets_hardening`, aplicada no Supabase:
1. Remove `image/svg+xml` do bucket público para reduzir risco de SVG ativo/armazenado.
2. Mantém limite de 5 MiB e apenas PNG, JPEG e WEBP.
3. Cria função `public.saas_can_manage_public_asset(text)`, `SECURITY INVOKER` com `search_path=''`, `EXECUTE` apenas para `authenticated`, sem `PUBLIC/anon`.
4. A função exige caminho exato `tenants/<UUID empresa>/<branding|products|services|catalog>/<UUID arquivo>.<png|jpg|jpeg|webp>`, vínculo ativo `owner/admin` e empresa ativa.
5. Quatro policies do Storage foram recompostas para usar a mesma validação na leitura administrativa, inserção, atualização (USING e WITH CHECK) e exclusão, todas limitadas ao bucket público e usuários autenticados.
6. Frontend `assets/js/business.js` não confia mais na extensão do nome do arquivo; escolhe a extensão a partir de MIME permitido, exige UUID do tenant, pasta prevista, tamanho positivo até 5 MiB. Formulário de aparência deixa de oferecer SVG.

## Validação
- `apply_migration`: sucesso.
- Metadados confirmaram bucket ainda público, lista PNG/JPEG/WEBP, 5 MiB, quatro policies autenticadas e zero objetos existentes.
- Invocação da função de validação com caminhos malformados, pasta inesperada e arquivo SVG retornou `false`.
- Sessões de teste na camada SQL, com dois usuários e duas empresas fictícias em transação `BEGIN`/`ROLLBACK`: arquivo da própria empresa permitido, caminho de outra empresa negado. As identidades e tenants fictícios não são persistidos.
- Verificação de privilégios: função é `SECURITY INVOKER`, anônimos não podem executá-la diretamente.

## Limitações importantes
**O bucket é intencionalmente público.** O controle de `storage.objects` não garante segredo de arquivos servidos pela URL pública, inclusive depois que uma empresa é suspensa. Nunca armazenar documentos, dados pessoais, comprovantes ou outras mídias privadas nesse bucket. Arquivos privados exigem bucket privado e URLs assinadas de curta duração, com autorização separada.

Os testes SQL não equivalem a requisições HTTP reais ao Storage e à Data API com dois tokens GoTrue independentes. Também não fazem inspeção de magic bytes das imagens; o MIME de cliente não é garantia de conteúdo seguro. Tests HTTP, upload com MIME forjado e fluxo de links assinados (quando houver bucket privado) ficam para homologação dedicada.

Nenhum objeto existente precisou ser migrado. Não foram habilitados pagamentos.
