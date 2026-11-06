# L&A Royal SaaS — Etapa #44 | Permissões dos módulos por perfil
Data: 2026-11-06

## Revisão de permissões do banco (RLS)
Consultadas as políticas efetivas de produtos, serviços, pedidos, clientes, funcionários, financeiro, agendamentos, inventário, aparência e configurações. As políticas por `tenant_id` e papel permitem leitura operacional dos módulos correspondentes e reservam alterações gerenciais ao proprietário/administrador. Para `saas_financial_entries` a leitura e escrita exigem papéis owner/admin, além das políticas de empresa ativa. Produtos e serviços permitem ao empregado leitura, não escrita. A coluna `saas_products.cost` não possui SELECT direto para `authenticated`; o custo é fornecido pelo RPC `saas_manager_product_costs`, que confere proprietário/administrador ou Super Admin.

Inspecionada também a implementação `private.saas_adjust_inventory_impl`, que exige papel owner/admin (ou Super Admin), valida alteração, estoque não negativo e faz registro de movimentação.

## Inconsistência corrigida
A interface de Estoque ocultava o botão Ajustar para empregados, mas os eventos `rows.onclick` e `form.onsubmit` não faziam a mesma checagem: a tentativa de chamada ao banco falharia para empregados, gerando UX confusa. Corrigidos os dois handlers com `ctx.canManage` e verificação da existência do item.

Aplicado reforço adicional a Produtos e Serviços: antes de abrir o formulário, tratar clique de publicação/arquivamento ou salvar alterações, os handlers também exigem `ctx.canManage`. A ocultação de botão não é uma autorização e o banco continua sendo a fronteira principal.

## Validação e limites
Adicionados testes automatizados offline em `tests/module-role-permissions.test.mjs` e novo workflow `module-role-permissions.yml`, que também roda os testes existentes de autenticação e indicadores por perfil.

Nenhuma policy SQL ou registro de clientes foi modificado. Não foram criados usuários de teste reais: é necessário homologar em sessão real com proprietário, administrador e funcionário e conferir acesso por Data API, inclusive solicitações manipuladas e entre tenants. O checkout Mercado Pago permanece desligado.
