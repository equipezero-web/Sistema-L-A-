# L&A Royal SaaS — revisão de permissões (2026-11-04)

## Escopo
Revisão dos perfis `Super Admin`, `owner`, `admin` e `employee`, com foco em alterações diretas ao Supabase e em sessões abertas em módulos internos.

## Invariantes corrigidas
1. **Ativação da empresa é exclusiva da plataforma.** Antes, a política de UPDATE de `saas_tenants` permitia ao proprietário editar campos da empresa e o gatilho não protegia `active`. Agora `saas_protect_tenant_identity` impede alterar `active` sem `saas_is_platform_super_admin()` (que exige AAL2).
2. **Proprietário canônico.** Antes, um owner podia alterar outra associação para `role='owner'` mesmo sem alterar `saas_tenants.owner_user_id`. Agora `saas_protect_member_role` rejeita papéis de proprietário cujo `user_id` diverge do proprietário canônico.
3. **Módulos internos verificam empresa ativa.** `getBusinessContext` consulta `saas_tenants.active` e redireciona ao painel quando a empresa está suspensa. Se a RPC de minutos de uso recusar acesso durante uma sessão já aberta, o módulo redireciona ao painel para exibir o estado atual.

## Matriz confirmada nas políticas existentes
| Recurso | Super Admin (AAL2) | Proprietário | Administrador | Funcionário |
|---|---|---|---|---|
| Desativar / expulsar / recuperar empresa | RPCs da plataforma | Não | Não | Não |
| Gerenciar membros (ALTERAR papel) | Conforme regras de banco | Sim, exceto criar outro proprietário | Não | Não |
| Produtos e serviços (gravação) | Sim | Sim | Sim | Não |
| Pedidos / agendamentos | Sim | Criar e concluir | Criar e concluir | Criar pendentes |
| Financeiro / relatórios gerenciais | Conforme regras de banco | Sim | Sim | Acesso gerencial negado no painel |
| Configurações / cobrança | Administração excepcional | Proprietário | Restrito | Restrito |

A tabela resume a política atual e a navegação do painel; **não equivale a um teste ponta a ponta**.

## Verificações executadas
- Os gatilhos `saas_tenants_protect_identity` e `saas_members_protect_role` permanecem anexados às tabelas relevantes.
- Testes transacionais usando apenas tabelas temporárias verificaram que uma atualização de `active` sem autorização e uma promoção ilegítima a `owner` recebem erros e não modificam os dados de teste.
- Consulta agregada encontrou **0** associações existentes com papel `owner` divergente de `owner_user_id`.
- O módulo JS atualizado foi verificado sintaticamente após remover as palavras-chave específicas de módulo para o teste.

## Pendências
- Exercitar o fluxo completo com usuários de teste de cada papel (elevado AAL2, owner, admin, employee) e mudança do estado da empresa com os módulos já abertos.
- Rever a exposição de campos sensíveis de produtos, especialmente `cost`: o acesso a linhas de produtos por membros da empresa não impõe distinção por coluna, e ocultar valores na interface não substitui uma política de dados específica.
- Auditar RPCs financeiras e endpoints de IA para confirmar que o escopo de dados expostos aos funcionários segue as mesmas regras do painel.

**Princípio:** todo bloqueio de segurança precisa existir no banco ou servidor, não apenas em links e botões do navegador.
