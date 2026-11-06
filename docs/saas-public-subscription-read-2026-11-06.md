# L&A Royal SaaS — Etapa #38: assinatura e acesso público

Data: 06/11/2026

## Falha identificada

A publicação cria uma cópia das lojas e dos itens nas tabelas `saas_public_stores` e `saas_public_catalog_items`. As regras de criação e publicação verificam assinatura ativa, mas a expiração do plano pelo relógio não dispara um evento de alteração no cadastro da loja. Assim, uma cópia já publicada poderia continuar sendo lida após o vencimento, mesmo sem haver assinatura vigente.

## Correção implantada

Uma função **privada** `private.saas_public_store_visible(uuid)` retorna apenas verdadeiro/falso considerando, na hora da leitura:

- Empresa ativa;
- Onboarding concluído;
- Tema/loja marcado como publicado;
- Assinatura com status `active` e vigência válida.

Duas políticas **RESTRICTIVE SELECT** na loja pública e no catálogo exigem a função para `anon` e `authenticated`, combinando-as com as políticas permissivas preexistentes por AND. A função não fica disponível no esquema `public` da Data API, usa `search_path` vazio e concede apenas EXECUTE aos papéis de leitura.

A sincronização preexistente e os bloqueios de gravação permanecem intactos. Quando a assinatura expira, as linhas podem ainda existir internamente para reconciliação, mas não aparecem na leitura pública com as permissões normais.

## Verificação

- Migration `saas_public_subscription_read_guard` aplicada ao Supabase (projeto `lthiztvnaxwrfyziypxd`).
- Inspeção em `pg_policies`: duas políticas `RESTRICTIVE` com predicado privado instaladas.
- Verificação com papel `anon` e identificador sem assinatura: a função retorna falso; tabelas públicas sem linhas retornam zero.
- Testes offline em `tests/public-subscription-read.test.mjs` validam os predicados de assinatura e o uso de políticas restritivas.

**Limite**: a instância não possui empresas reais; não foram criadas contas nem pagamentos para um teste completo de assinatura expirada com dados reais. A leitura direta de URLs de arquivos de mídia em Storage e caches externos não é revogada por esta mudança.

## Segurança e faturamento

Checkout Mercado Pago permanece desabilitado; nenhuma cobrança foi ativada ou simulada contra o provedor. Os avisos existentes do Security Advisor sobre funções `SECURITY DEFINER` públicas e tabelas administrativas sem políticas não foram alterados nesta etapa e exigem revisão específica.
