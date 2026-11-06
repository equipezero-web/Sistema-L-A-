# Etapa #46 — Homologação controlada do isolamento multiempresa

Data: 2026-11-06. Projeto Supabase: `lthiztvnaxwrfyziypxd`.

## Defeito encontrado e correção

Ao executar um cenário controlado usando `SET LOCAL ROLE authenticated` com duas empresas e dois usuários fictícios, o PostgreSQL apresentou `54001: stack depth limit exceeded` por recursão de `public.saas_is_platform_super_admin()`. A função consultava `public.saas_profiles` como `SECURITY INVOKER` enquanto a política `saas_profiles_select` chamava a mesma função, iniciando um ciclo.

A migration `saas_platform_admin_rls_recursion_fix` moveu a leitura do privilégio para `private.saas_is_platform_super_admin()`, `SECURITY DEFINER` com `search_path=''`, que usa `auth.uid()`, `is_platform_super_admin` e JWT `aal='aal2'`. A API pública `public.saas_is_platform_super_admin()` continua `SECURITY INVOKER` e encaminha a chamada à função privada. `EXECUTE` foi removido de `PUBLIC` e `anon` e concedido apenas a `authenticated` nas duas funções. Não foram ampliadas permissões de tabelas, removidas RLS nem alterados privilégios de usuário.

## Testes reais no PostgreSQL (transações revertidas)

Foram gerados dois IDs de usuário, duas empresas fictícias e registros independentes em `saas_customers`, `saas_products`, `saas_orders` e `saas_financial_entries`. Dados e identidades ficaram numa transação SQL envolvendo `BEGIN` e `ROLLBACK`, sem confirmação permanente. Durante a transação, o papel foi alternado para `authenticated` e `request.jwt.claim.sub` recebeu alternadamente cada usuário de teste.

| Observação | Proprietário A | Proprietário B |
|---|---:|---:|
| Clientes próprios visíveis | 1 | 1 |
| Clientes da outra empresa visíveis | 0 | 0 |
| Produtos próprios visíveis | 1 | 1 |
| Produtos da outra empresa visíveis | 0 | 0 |
| Pedidos próprios visíveis | 1 | 1 |
| Pedidos da outra empresa visíveis | 0 | 0 |
| Lançamentos financeiros próprios visíveis | 1 | 1 |
| Lançamentos da outra empresa visíveis | 0 | 0 |
| UPDATE de cliente da outra empresa | 0 linhas | 0 linhas |

Segundo cenário com novos registros fictícios e rollback:
- `saas_report_summary` retornou relatório próprio e `NULL` para empresa diferente;
- `saas_manager_product_costs` retornou um produto próprio e rejeitou a empresa diferente com exceção;
- função `saas_is_platform_super_admin()` retornou `false` para sessão sem identidade;
- consulta após os primeiros testes encontrou zero empresas com slug `isotest-a-*` ou `isotest-b-*` e zero clientes com os nomes de fixture.

A migration foi aplicada no Supabase e os privilégios das funções foram conferidos por catálogo PostgreSQL. O verificador foi exercitado com `authenticated`, não apenas com a conta privilegiada SQL.

## Limites da homologação

Os testes acima ocorreram na camada PostgreSQL, **não** fizeram requisições REST à Data API com tokens reais emitidos pelo GoTrue. Ainda requerem homologação HTTP com duas contas reais, tentativas cruzadas de INSERT e UPDATE em todas as tabelas e testes completos de Supabase Storage. O cenário transacional testa principalmente leitura de dados, atualização cruzada de clientes e duas RPCs gerenciais; não assegura cobertura de todos os endpoints.

A migration preserva `MP_CHECKOUT_ENABLED=false`, não altera pagamentos, clientes reais ou produtos reais.
