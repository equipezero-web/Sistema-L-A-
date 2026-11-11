# Etapa #58 — Liberação de homologação de uma única loja

**Data:** 2026-11-11. **Motivo:** proprietário solicitou liberar a sua loja para testes sem realizar cobrança real.

## Loja autorizada

- Nome: Lapis Servidor
- Slug: `lapis-servidor`
- ID: `b26cb679-bbbb-4e62-95f3-4b7f907c090d`
- Duração: **7 dias**, contados do momento da aplicação da migration. Termina automaticamente pelo predicado `expires_at > now()`.
- **Nenhum pagamento ou assinatura foi gerado.** O plano Royal 30 e Mercado Pago permanecem inalterados.

## Mecanismo seguro

A migration `supabase/sql/saas_single_tenant_trial_access_58.sql`:
- guarda o trial na tabela `private.saas_tenant_trial_access`, com RLS e sem acesso de leitura/escrita direta dos papéis `anon` e `authenticated`;
- exige UUID e slug exatos da empresa ativa e já cadastrada, e recusa a liberação se existir qualquer assinatura prévia da empresa;
- mantém `public.saas_has_active_subscription` **estritamente para pagamentos reais**, criando `public.saas_has_commercial_access` que considera pagamento real OU trial válido;
- concede a prova de trial através de função privada de leitura `SECURITY DEFINER` com `search_path=''`;
- adequa as validações de publicação de loja e itens, sincronização da vitrine e leitura anônima, preservando `tenant.active`, `onboarding_completed`, `theme.published` e RLS existentes;
- deixa a API `public.saas_subscription_access` retornar `access_type='trial'` com data de expiração para os membros autorizados, e `subscription` continua representando exclusivamente a assinatura verdadeira;
- exibe no painel `Acesso de homologação ativo` em vez de `Royal 30 ativo`.

## Uso

1. Entre na empresa de teste normalmente.
2. Confira **Plano e assinatura**: deve aparecer **Acesso de homologação ativo**, sem pagamento.
3. Entre em **Minha Loja**, configure aparência e marque **Loja publicada**.
4. Use **Abrir loja pública** para visualizar `https://equipezero-web.github.io/Sistema-L-A-/store/?slug=lapis-servidor` sem acesso ao painel administrativo.
5. Ao expirar, o acesso público é negado automaticamente por RLS/guard do servidor, mesmo se ainda existir cache de um espelho de publicação; nenhum status de pagamento é alterado.

A loja pública hoje é **vitrine de catálogo e preços**, não checkout de compra de produtos. O desbloqueio de teste não ativa cobrança ou venda online.

## Homologação

- CI executa o teste `tests/saas-single-tenant-trial.test.mjs` e a regressão de Configurações.
- Confirmar no banco que somente o UUID autorizado possui trial ativo; `saas_subscriptions` permanece sem linha para esse tenant.
- Em transação `BEGIN/ROLLBACK`, ativar a publicação de teste com a identidade de proprietário simulada, verificar leitura pública da loja, e reverter.
- Confirmar Security Advisor e ausência de novas vulnerabilidades.

Revogação imediata pelo operador do banco: `delete from private.saas_tenant_trial_access where tenant_id='b26cb679-bbbb-4e62-95f3-4b7f907c090d';` e re-sincronização da loja; não dar permissão para usuários finais gerenciarem o trial.
