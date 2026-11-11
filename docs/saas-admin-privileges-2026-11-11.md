# L&A Royal SaaS — Etapa #53 (11/11/2026)

## Situação da homologação administrativa

A etapa #52 integrou os testes **simulados** HTTP para Super Admin AAL1/AAL2. A verificação real do Auth com duas sessões dedicadas permanece pendente. Não utilizar tokens de usuários/clientes reais ou criar privilégios fora do processo administrativo autorizado.

## Causa da falha da primeira tentativa

O fluxo de criação de `auth.users` gera um perfil em `public.saas_profiles` com `is_platform_super_admin=false`. A tentativa anterior de executar um `INSERT ... ON CONFLICT DO UPDATE SET is_platform_super_admin=true` tentou **promover** essa conta fictícia já existente e recebeu a exceção `platform privilege cannot be changed by this user`.

A análise confirmou:
- `saas_profiles_protect_privileges` e `saas_profiles_protect_security_fields` estão ativos para **UPDATE**;
- `public.saas_protect_profile_security_fields()` sempre impede mudança direta de `is_platform_super_admin` por UPDATE;
- `authenticated` **não** tem grant UPDATE na coluna `is_platform_super_admin`, mas pode atualizar `full_name`, `phone` e `avatar_url`;
- A autorização no banco exige perfil administrativo **e** claim JWT `aal2`, verificada por `private.saas_is_platform_super_admin()`;
- A RPC `public.saas_platform_tenants()` nega AAL1 ou AAL2 de usuários comuns;
- `anon` não tem privilégio EXECUTE dessa RPC.

**Decisão:** nenhuma mudança no gatilho, grant administrativo, perfil de produção ou RLS. Não contornar o bloqueio via exclusão/reinserção do perfil.

## Homologação SQL executada

Rodei o arquivo `supabase/tests/saas_admin_privileges_rollback.sql` em uma única transação PostgreSQL com `ROLLBACK`, conta fictícia recém-criada, claims simuladas por configuração de sessão (não são tokens emitidos pelo GoTrue) e role `authenticated`.

| Cenário | Identificado como Super Admin | RPC administrativa | Tentativa de promover conta | Editar nome próprio |
|---|---:|---|---|---:|
| Conta comum AAL1 | false | DENIED | DENIED_BY_GRANT | 1 registro |
| Conta comum AAL2 | false | DENIED | DENIED_BY_GRANT | 1 registro |

O teste validou que **2FA não concede direitos administrativos** e que um UPDATE de campo normal do perfil permanece disponível. Nenhuma identidade fictícia ou alteração de dados foi persistida.

O teste `tests/saas-admin-privilege-rollback.test.mjs` verifica propriedades estáticas do script (uso de transação/rollback, papel autenticado, bloqueios esperados) no CI, mas não executa PostgreSQL no GitHub Actions.

## Ainda não homologado

- Caminho positivo **Super Admin autorizado + 2FA AAL2** com dois JWTs de teste reais e expiração válida;
- Isolamento multi-tenant real via Data API HTTP com as duas empresas de homologação devidamente preenchidas;
- Pagamentos Mercado Pago em sandbox, webhook real e ações de escrita seguras com dados descartáveis;
- Revisão final de fluxos ponta a ponta.

As duas informações de `rls_enabled_no_policy` do Security Advisor, de `saas_platform_actions` e `saas_usage_minutes`, correspondem a tabelas internas com acesso direto fechado. Consulte https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .

Checkout Mercado Pago segue **desabilitado**; nenhuma migration foi aplicada.
