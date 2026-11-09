# L&A Royal SaaS — Etapa #51: validação de papéis e dados reais nas fixtures HTTP

Data: 2026-11-09. Projeto Supabase: lthiztvnaxwrfyziypxd.

## Evidência SQL transacional (sem persistir dados)

Criei temporariamente três usuários de teste (proprietário A, proprietário B e funcionário A), duas empresas, um cliente, um produto e um lançamento financeiro em cada empresa. No papel PostgreSQL `authenticated`, com `request.jwt.claim.sub` apontando para as identidades fictícias, validei:

| Operação | Proprietário A | Funcionário A |
|---|---:|---:|
| Clientes próprios visíveis | 1 | 1 |
| Clientes de B visíveis | 0 | 0 |
| Produtos próprios visíveis | 1 | 1 |
| Produtos de B visíveis | 0 | 0 |
| Lançamentos financeiros próprios visíveis | 1 | 0 |
| Lançamentos financeiros de B visíveis | 0 | 0 |
| UPDATE de cliente de B | 0 linhas | 0 linhas |
| RPC saas_manager_product_costs da empresa A | permitido | negado |

Toda a transação terminou em `ROLLBACK`. Não foram alteradas contas, dados ou empresas de clientes reais.

## Correção do harness de homologação HTTP

O script `scripts/verify-tenant-http.mjs` da etapa #50 verificava registros de outra empresa, mas podia passar quando nenhuma das empresas de teste tinha registros. Isso não demonstrava isolamento de linhas existentes.

Agora ele:
1. Exige duas identidades **owner/admin** ativas e distintas, associadas a empresas diferentes;
2. Consulta e **exige pelo menos um registro próprio** em cada uma das tabelas `saas_customers`, `saas_products`, `saas_orders` e `saas_financial_entries` para **cada** empresa;
3. Extrai o ID de cada registro realmente visível e tenta ler exatamente aquele registro pelo token da empresa adversária;
4. Verifica ausência de membros da outra empresa, bloqueio de RPC de custos alheios e negação da RPC de listagem da plataforma;
5. Interrompe a homologação se faltarem dados ou a sessão tiver papel `employee`, evitando aprovação enganosa.

O script continua **somente de leitura** (POST apenas em RPCs de consulta), com chave `sb_publishable_` e tokens de duas contas de teste fornecidos por variáveis de ambiente locais. Não roda automaticamente na CI sem as credenciais e não as grava nos logs.

## Testes automatizados de simulação HTTP

`tests/tenant-http-fixtures.test.mjs` executa o harness com `fetch` simulado para os cenários: (1) dois conjuntos completos sem vazamento, (2) empresas sem dados, (3) vazamento de registro existente, (4) sessão employee inadequada. CI testa também autenticação, permissões do dashboard, invocação privada de RPCs e sintaxe do script.

## Limites

Nenhuma sessão GoTrue de teste foi fornecida para testar REST real; portanto, **a homologação HTTP real permanece pendente**. Não foram efetuados logins reais, consultas com tokens reais, testes positivos de Super Admin AAL2 nem modificações via REST. Os testes em PostgreSQL por role verificam a RLS real, mas não exercitam a cadeia HTTP/GoTrue/PostgREST completa.

Checkout Mercado Pago continua desligado; não houve migration ou mudança em pagamentos.
