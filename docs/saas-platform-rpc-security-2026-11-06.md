# Etapa #41 — Proteção de RPCs do Super Admin

Data: 2026-11-06

## Diagnóstico confirmado
As seis RPCs administrativas já verificavam `saas_is_platform_super_admin()`, que exige privilégio de plataforma no perfil do usuário e nível AAL2 no JWT. Somente a função autenticada pode passar dessa autorização. Os gatilhos de perfil impedem alteração direta de `is_platform_super_admin` e usuários autenticados só têm UPDATE em colunas de perfil não privilegiadas. As tabelas internas `saas_platform_actions` e `saas_usage_minutes` usam RLS sem políticas públicas, por projeto; não são destinadas à Data API.

## Fortalecimento aplicado
Migration `saas_platform_rpc_explicit_grants` estabelece REVOKE EXECUTE para PUBLIC, anon e authenticated e, depois, GRANT EXECUTE **somente** para authenticated nas seis funções:
- `saas_platform_audit` / `saas_platform_audit_filtered`
- `saas_platform_expel_tenant` / `saas_platform_restore_owner`
- `saas_platform_set_tenant_active` / `saas_platform_tenants`

Isso não dá permissão de Super Admin a qualquer sessão autenticada: cada rotina continua conferindo `saas_is_platform_super_admin()` internamente, incluindo AAL2. As tabelas internas também tiveram privilégios diretos de PUBLIC/anon/authenticated explicitamente revogados.

## Verificação
A migration foi aplicada ao Supabase e `pg_proc` confirma que anon não executa nenhuma das seis funções, enquanto authenticated mantém o acesso necessário para que o guard individual funcione. `has_table_privilege` confirmou que anon/authenticated não têm SELECT nem INSERT direto nas duas tabelas internas. Novos testes offline no arquivo `tests/platform-rpc-grants.test.mjs` e workflow `platform-rpc-security.yml`.

## Alertas restantes
O Security Advisor pode continuar mostrando alerta para funções `SECURITY DEFINER` executáveis por `authenticated`, porque o cliente Super Admin também usa esse papel. O alerta precisa ser analisado por função, não corrigido com remoção indiscriminada das permissões, o que quebraria o painel. Não se testou autenticação real AAL2 como Super Admin porque não há conta de teste fornecida.

Nenhuma alteração no checkout, pagamentos, cadastros de clientes ou registros administrativos.
