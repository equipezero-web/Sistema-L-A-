# L&A Royal SaaS — Regressão de permissões de vendas, estoque e Royal AI

Data: 2026-11-04 | Escopo: etapa #30

## Diagnóstico
- A etapa #29 já restringiu o `SELECT` de `saas_products.cost` a consultas gerenciais autorizadas.
- `saas_ai_role_snapshot` remove informações de faturamento e receitas do retorno para `employee`.
- **Brecha identificada:** `saas_ai_business_snapshot` ainda podia retornar `order_revenue_30d` e as receitas de rankings de produtos/serviços a um membro `employee`, caso invocasse diretamente a RPC. Os custos unitários de produtos já não apareciam desde a etapa #29.

## Correção
- `saas_ai_business_snapshot` agora faz sanitização por perfil no próprio ponto de entrada.
- Quando o usuário **não** é proprietário, administrador ou Super Admin AAL2, a função elimina `financial_30d`, `financial_previous_30d`, `order_revenue_30d` e as propriedades `revenue` dos rankings.
- Os indicadores operacionais (quantidade de pedidos, clientes, agendamentos e estoque) permanecem disponíveis.
- `saas_ai_role_snapshot` continua aplicando suas regras como segunda camada de proteção.
- Não houve alteração de registros de clientes, vendas ou contratos.

## Testes executados
1. Função aplicada ao Supabase. Consulta à definição confirmou os filtros e a autorização por perfil.
2. Script `tests/sql/saas_permission_negative_smoke.sql` executado: com role `authenticated`, sem sessão real, leitura de campos públicos do catálogo e planejamento de UPDATE gerencial tiveram sucesso; `SELECT cost` foi negado; RPCs de IA não retornaram dados de tenant inexistente; RPC de custo e criação de pedido recusaram chamada sem identidade válida. O script encerra com ROLLBACK.
3. Script `tests/sql/saas_ai_redaction_unit.sql` executado: com amostra artificial de JSON, os campos gerenciais foram retirados e os indicadores operacionais preservados.
4. ACL confirmada: `authenticated` não pode ler `saas_products.cost` diretamente, mas pode ler o preço de venda. A RPC de custos não permite execução anônima.

## Limitações
**Não houve teste positivo com uma conta real de cada papel.** O projeto Supabase consultado retornou zero empresas em `public.saas_tenants`, portanto não foi possível executar compra/conclusão de pedidos, movimentação de estoque ou resposta Royal AI com contexto de uma empresa real.

## Advisors
O Supabase continua sinalizando `rls_enabled_no_policy` (duas tabelas intencionalmente fechadas ao acesso direto) e `authenticated_security_definer_function_executable` (nove funções expostas a usuários autenticados). São avisos que exigem revisão das autorizações internas; não devem ser silenciados abrindo acesso indiscriminado.

Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Checklist de validação futura
- Super Admin AAL2: painel administrativo, auditoria e operações reservadas, sem necessidade de pertencer ao tenant.
- Proprietário: acesso gerencial a `cost`, gestão de equipe, pedidos, faturamento e Royal AI.
- Administrador da empresa: consulta gerencial dos custos e conclusão de pedidos, sem privilégios do Super Admin.
- Funcionário: criação de pedidos e agendamentos pendentes, estoque e preços de venda; sem custo de aquisição ou receitas agregadas na resposta direta da Royal AI.
- Usuário sem vínculo: rejeição de funções gerenciais e isolamento entre empresas.

**SQL versionado**: `supabase/sql/saas_ai_base_snapshot_role_guards.sql`.
