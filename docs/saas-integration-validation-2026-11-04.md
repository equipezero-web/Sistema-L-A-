# L&A Royal SaaS — Validação transacional de perfis e operações

Data: 04/11/2026 | Supabase: `lthiztvnaxwrfyziypxd` | Escopo: banco e RPCs reais, com identidades **fictícias**.

## Resultado
**APROVADO nos testes transacionais de banco após correções.** A publicação web, o login real com e-mail e o fluxo real de MFA não foram exercitados por navegador. Não atribuir status de homologação integral ao produto apenas com estes testes.

| Verificação | Resultado |
|---|---|
| Onboarding: criação de empresa por usuário autenticado | PASS |
| Proprietário: criação de produto, estoque inicial e custos via RPC | PASS |
| Funcionário: consulta do catálogo sem `cost` e criação de pedido pendente | PASS |
| Funcionário: impedido de ajustar estoque e concluir pedido/agendamento | PASS |
| Admin: acesso a custos pela RPC protegida, reposição e finalização de venda | PASS |
| Admin: estoque debitado e lançamentos financeiros de venda e serviço | PASS |
| Funcionário: receita e custos ocultos na Royal AI mesmo após venda concluída | PASS |
| Funcionário: lançamentos financeiros indisponíveis por RLS | PASS |
| Proprietário: não consegue alterar status `active` ou criar outro `owner` | PASS |
| Usuário de outra empresa: catálogo e RPCs da empresa alheia inacessíveis | PASS |
| Super Admin simulado AAL1: acesso administrativo negado | PASS |
| Super Admin simulado AAL2: painel, suspensão, reativação, expulsão e recuperação | PASS |
| Após recuperação: proprietário ativo e demais membros ainda suspensos | PASS |
| Auditoria e comunicado ao proprietário | PASS |

## Falhas reais encontradas e corrigidas

1. **Permissão insuficiente em wrappers:** `saas_create_product` falhava com `permission denied for function saas_create_product_impl`. Concedido EXECUTE a `authenticated`, e não a `anon`, somente aos auxiliares `private.saas_create_product_impl`, `private.saas_adjust_inventory_impl` e `private.saas_create_tenant`. Cada auxiliar verifica identidade e autorização interna. Os wrappers públicos permanecem `SECURITY INVOKER`.
2. **Gatilho multi-tabela:** `saas_enforce_same_tenant` consultava `NEW.customer_id` em tabelas sem essa coluna. Separadas as verificações em ramos condicionais específicos por tabela.
3. **Criação de pedido por funcionário:** a busca de produtos com `FOR UPDATE`/`FOR SHARE` exigia permissões de escrita negadas a `employee`. A criação de pedido pendente agora faz leitura comum de preço e estoque. A conclusão realiza verificação e bloqueio de estoque no momento do fechamento, mantendo consistência.
4. **Conclusão de venda:** `saas_complete_order` alterava estoque diretamente e inseria movimentação sem privilégios para essa tabela; foi substituído por chamada à implementação protegida `private.saas_adjust_inventory_impl`, que registra débito de estoque e movimento de forma autorizada.
5. **Ordenação de comunicados:** ações sucessivas na mesma transação recebiam mesmo horário `now()`; os registros administrativos de ações e comunicados agora usam `clock_timestamp()`, e a consulta do aviso usa desempate por ID.

## Como os testes foram realizados

Os testes usaram `BEGIN` + fixtures em `auth.users`, empresas e membros fictícios, contexto PostgreSQL `authenticated` e claims simuladas de AAL1/AAL2. As chamadas de produção foram feitas pelas RPCs efetivas. Nenhum pedido real foi processado; o teste termina com **ROLLBACK**.

No cenário sintético de Super Admin, uma configuração local de replicação foi usada apenas durante a preparação de um perfil falso privilegiado; foi imediatamente restaurada antes dos testes e não foi persistida.

Arquivos:
- `tests/sql/saas_four_roles_transactional.sql`
- `tests/sql/saas_super_admin_transactional.sql`

As duas baterias foram executadas novamente com sucesso após os ajustes. Uma verificação posterior confirmou **0 usuários Auth, 0 empresas, 0 membros, 0 produtos, 0 pedidos, 0 ações administrativas e 0 lançamentos financeiros persistidos**.

## Implantação versionada
- `supabase/sql/saas_operational_role_test_fixes.sql` — funções auxiliares, gatilho e criação de pedido.
- `supabase/sql/saas_complete_order_atomic_inventory.sql` — baixa de estoque protegida ao finalizar venda.
- `supabase/sql/saas_platform_notice_ordering.sql` — auditoria e comunicados ordenados cronologicamente.

As funções e permissões já foram aplicadas no Supabase; os scripts foram adicionados ao GitHub para permitir revisão e implantação em outros ambientes.

## Alertas ainda existentes
Os Advisors do Supabase continuam reportando:
- `rls_enabled_no_policy`: 2 ocorrências **INFO**, tabelas sem política de acesso direto.
- `authenticated_security_definer_function_executable`: 9 ocorrências **WARN**, exigem revisão de autorização interna; não conceder acesso indiscriminado para silenciar o aviso.

Documentação: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Limitações e próximos testes
- A base atualmente não possui empresas nem usuários reais para exercitar autenticação, sessão e UI.
- Não foi possível confirmar o acesso à publicação do GitHub Pages pelo navegador de consulta nesta revisão.
- Faltam testes de interface com login real, ativação real de MFA e confirmação visual de comportamento nos módulos mobile e desktop.
- Testes transacionais não substituem carga, concorrência, pagamentos com provedor real e testes de rede.

**Conclusão:** operações centrais e autorizações no PostgreSQL validadas com fixtures reversíveis, mas a homologação integral da aplicação ainda depende dos testes externos acima.
