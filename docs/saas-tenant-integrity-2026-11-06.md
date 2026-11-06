# L&A Royal SaaS — Etapa #45: isolamento relacional multiempresa
Data: 2026-11-06

## Escopo e achados
O banco já exigia RLS nas 24 tabelas `saas_*` inspecionadas. As políticas de produtos, serviços, pedidos, clientes, funcionários e financeiro conferem o tenant com as funções `saas_is_tenant_member(tenant_id)` ou `saas_has_tenant_role(tenant_id,...)`; as implementações privadas confirmam `auth.uid()` e vínculo `saas_members.status='active'`. Super Admin é exceção deliberada e exige privilégio da plataforma com AAL2.

Já existiam gatilhos `saas_enforce_same_tenant()` nas tabelas de pedidos, itens, agendamentos e movimentações de estoque, além de `saas_protect_row_tenant_id()` para impedir alteração arbitrária de `tenant_id`. Essas proteções foram identificadas antes da alteração e **não** foram removidas.

A auditoria de chaves estrangeiras revelou que essas relações só referenciavam IDs simples, sem codificar a empresa no relacionamento. Isso não prova exploração real devido aos gatilhos pré-existentes; foi adotado reforço estrutural, como defesa em profundidade, para impedir vínculos entre empresas mesmo se um gatilho for removido ou modificado futuramente.

## Alterações implantadas
Migration `saas_tenant_relational_integrity` aplicada no Supabase PostgreSQL 17. Foram criados cinco índices únicos compostos `(tenant_id,id)`, com sete FKs compostas:

| Origem | Referência protegida |
| --- | --- |
| saas_orders | tenant_id + customer_id → saas_customers |
| saas_order_items | tenant_id + order_id → saas_orders |
| saas_order_items | tenant_id + product_id → saas_products |
| saas_appointments | tenant_id + customer_id → saas_customers |
| saas_appointments | tenant_id + employee_id → saas_employees |
| saas_appointments | tenant_id + service_id → saas_services |
| saas_inventory_movements | tenant_id + product_id → saas_products |

Foram preservados `ON DELETE CASCADE` para itens relacionados ao pedido e movimentações de um produto; nos cinco relacionamentos opcionais `ON DELETE SET NULL (coluna_relacionada)` preserva `tenant_id` (que é `NOT NULL`).

## Verificações realizadas
- Consulta antes da migration: **zero associações com tenant_id divergente** nos sete relacionamentos.
- `apply_migration`: sucesso.
- Leitura de `pg_constraint`: **sete FKs compostas com `convalidated=true`**, todos os comportamentos de exclusão confirmados.
- Confirmação de RLS ativo em todas as 24 tabelas `saas_*` consultadas e dos gatilhos preexistentes de validação e proteção do tenant.
- Testes estáticos em `tests/tenant-relational-integrity.test.mjs` e novo workflow `tenant-isolation.yml`.

## Limitações e próximos testes
Os testes estáticos e de metadados do banco **não substituem** um teste funcional com duas empresas e dois usuários reais, inclusive operações `SELECT`, `INSERT`, `UPDATE` e RPCs com IDs manipulados. Não foram criados tenants, usuários ou registros operacionais para a homologação. Relações sem FK tipada (por exemplo referências textuais genéricas) exigem revisão separada. Nenhuma permissão RLS ou segredo foi ampliado; checkout permanece desligado.
