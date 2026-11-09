# L&A Royal SaaS — Etapa #48: proteção das RPCs privilegiadas
Data: 2026-11-09.

## Auditoria
O Supabase Security Advisor anteriormente sinalizava dez funções públicas `SECURITY DEFINER` executáveis pelo papel `authenticated`. A inspeção de `pg_proc`, `pg_namespace`, `prosrc` e privilégios mostrou os controles atuais.

As RPCs de ações sensíveis da plataforma (`saas_platform_audit`, `saas_platform_audit_filtered`, `saas_platform_expel_tenant`, `saas_platform_restore_owner`, `saas_platform_set_tenant_active`, `saas_platform_tenants`) verificam `saas_is_platform_super_admin()`, a qual exige registro de Super Admin e nível AAL2. O trabalho **não alterou** suas assinaturas nem permissões.

## Alteração
A migration `saas_rpc_private_read_boundaries` preserva nomes, argumentos, tipo de retorno e comportamento de três RPCs públicas usadas por login/dashboard:
- `public.saas_manager_product_costs(uuid)` — consulta custos com `owner/admin` do tenant ou Super Admin e empresa ativa
- `public.saas_my_access_summary()` — devolve os indicadores de participação, propriedade e perfil do usuário autenticado
- `public.saas_my_platform_notice()` — devolve o último aviso do proprietário, limitado a sua conta

O acesso privilegiado aos dados foi deslocado para funções correspondentes no esquema `private`, `SECURITY DEFINER` com `search_path=''`. As funções públicas executam como `SECURITY INVOKER` e apenas delegam, sem consultar tabelas com privilégios elevados diretamente.

Em todas as seis funções, `EXECUTE` foi revogado de `PUBLIC` e `anon`, concedido somente a `authenticated`. A camada privada mantém os mesmos filtros de identidade e papel. Não foram introduzidos dados sensíveis no frontend.

## Verificação realizada no Supabase
- `apply_migration` retornou sucesso.
- `pg_proc` confirmou que as três RPCs públicas agora têm `prosecdef=false`; as privadas possuem `prosecdef=true` e `search_path=''`. `anon` não tem `EXECUTE` em nenhuma das seis; `authenticated` tem.
- Num teste transacional com dois usuários e dois tenants fictícios, como `authenticated`: `saas_my_access_summary()` retornou corretamente `has_owned_tenant=true`, `has_any_membership=true`, `is_platform_super_admin=false`; `saas_my_platform_notice()` retornou `null` (sem aviso); consulta de custos da própria empresa retornou um item, e a consulta da empresa diferente levantou exceção SQL `P0001`. Foi aplicado `ROLLBACK` na transação.
- Adicionado teste automatizado offline em `tests/saas-rpc-read-boundaries.test.mjs` e workflow GitHub Actions.

## Limites
A migração reduz funções privilegiadas diretamente expostas na API, mas não elimina todos os alertas do Security Advisor. As funções administrativas seguem sendo `SECURITY DEFINER` públicas, intencionalmente protegidas por Super Admin/AAL2; uma redução adicional delas exige revisão detalhada de SQL, testes de mutação e de auditoria.

Não foram feitas requisições REST reais com tokens emitidos pelo GoTrue. Não foram criadas contas persistentes, não houve mudanças em pagamentos, e o checkout Mercado Pago permanece desabilitado.
