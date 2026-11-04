# L&A Royal SaaS — Restrição de custos de produtos (2026-11-04)

## Objetivo

Evitar que funcionários obtenham custos de aquisição (`saas_products.cost`) pela REST API, por clientes Supabase ou por funções de análise, sem prejudicar preços de venda, estoque e pedidos.

## Arquitetura aplicada

- `authenticated` não possui mais `SELECT` genérico sobre `saas_products`; as colunas não financeiras são concedidas individualmente com `GRANT SELECT(colunas)`.
- `anon` não possui `SELECT` sobre a tabela de produtos. A publicação utiliza o catálogo público separado.
- `service_role` preserva seus privilégios.
- A nova RPC `saas_manager_product_costs(tenant uuid)` exige `auth.uid()`, `owner/admin` ou Super Admin com AAL2, e empresa ativa. Ela devolve apenas pares `id/cost` da empresa autorizada.
- `listProducts(tenantId,role)` busca campos operacionais para todos; solicita o custo à RPC somente para `owner/admin`.
- Os módulos de Vendas, Produtos e Estoque usam a mesma consulta segura. Estoque não exibe o valor de custo aos funcionários.
- `saas_create_order_atomic` e `saas_complete_order` deixam de fazer `SELECT *` sobre produtos, preservando acesso aos campos necessários para a lógica de venda.
- `saas_ai_business_snapshot` não inclui `cost` no retorno bruto nem no subselect.
- A RLS por empresa e os gatilhos existentes permanecem ativos.

## Verificação técnica

- Teste com role `authenticated` e tabela real sem acessar registros: `SELECT id,name,price,stock_quantity` autorizado; `SELECT cost` rejeitado.
- `has_column_privilege('authenticated', ..., 'cost','SELECT') = false`.
- `has_column_privilege('authenticated', ..., 'price','SELECT') = true`.
- `has_column_privilege('anon', ..., 'cost','SELECT') = false`.
- `has_column_privilege('service_role', ..., 'cost','SELECT') = true`.
- Consulta gerencial sem sessão negada pela RPC.
- `saas_ai_business_snapshot`, `saas_create_order_atomic` e `saas_complete_order` conferidos sem leitura `SELECT *` de produtos nem inclusão de custo bruto nos resultados de IA.
- Verificação sintática do JavaScript dos módulos alterados aprovada.
- `saas_products` não está listado entre as tabelas publicadas em `pg_publication_tables`.

## Limitação

Não foram realizados testes ponta a ponta com contas reais de proprietário, administrador e funcionário. Os testes de criação/conclusão de vendas e ajuste de estoque ainda precisam ser executados sob sessões autenticadas dos respectivos perfis. A política de acesso deve ser reavaliada antes de ativar novas funções que retornem a linha inteira de `saas_products`.

**Arquivo de implantação:** `supabase/sql/saas_product_cost_access_control.sql`.
