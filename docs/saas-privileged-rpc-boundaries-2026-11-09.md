# L&A Royal SaaS — Etapa #49: revisão de todas as RPCs privilegiadas restantes
Data: 2026-11-09. Projeto Supabase: lthiztvnaxwrfyziypxd.

## Escopo
A etapa anterior deixou sete funções públicas `SECURITY DEFINER` executáveis por `authenticated`:
- `saas_platform_audit(integer,integer)`
- `saas_platform_audit_filtered(integer,integer,uuid,text,date,date)`
- `saas_platform_expel_tenant(uuid,text)`
- `saas_platform_restore_owner(uuid,text)`
- `saas_platform_set_tenant_active(uuid,boolean,text)`
- `saas_platform_tenants()`
- `saas_record_usage(uuid)`

As seis funções de plataforma verificam `saas_is_platform_super_admin()`, que exige flag administrativa no banco e AAL2. A função de uso verifica identidade, tenant ativo e associação ativa por owner/admin/employee.

## Migração
`saas_privileged_rpc_private_wrappers` foi aplicada. A migration valida assinatura, propriedade `SECURITY DEFINER`, `search_path=''` e ausência de nome homônimo privado para cada função. Reproduz o corpo **vigente e auditado** com `pg_get_functiondef` em `private` (sem transcrever manualmente operações críticas) e substitui a função pública por proxy `SECURITY INVOKER`, com mesmos argumentos/defaults e resultado (`jsonb` ou `void`).

Todas as 14 funções (7 públicas, 7 privadas) têm `EXECUTE` explicitamente revogado de `PUBLIC` e `anon`, com concessão a `authenticated`. A camada `private` não é uma API pública configurada; a pública executa sem privilégios de definer.

## Verificações concretas
A consulta `pg_proc` após a implantação confirmou sete funções públicas `prosecdef=false` e sete privadas `prosecdef=true`, todas com `search_path=''`, sem `EXECUTE` para `anon`, mantendo acesso autenticado.
Testes transacionais usando proprietário fictício autenticado com AAL1 e duas empresas geradas em `BEGIN`/`ROLLBACK`: chamadas a `saas_platform_tenants`, `saas_platform_audit`, `saas_platform_audit_filtered`, `saas_platform_set_tenant_active`, `saas_platform_expel_tenant` e `saas_platform_restore_owner` foram **todas negadas**; `saas_record_usage` foi permitido para empresa própria e negado para outra. Nenhuma empresa ou conta real foi alterada no teste.

O Security Advisor passou a reportar **zero avisos** de função `SECURITY DEFINER` pública executável por `authenticated`. Permanecem dois avisos informativos de tabelas internas com RLS habilitado e sem policies (`saas_platform_actions`, `saas_usage_minutes`), bloqueadas para acesso direto.

## Limites e próximos passos
Não houve teste positivo de funções de Super Admin com token AAL2 real e não se executaram suspensões ou expulsões reais. Ainda falta homologação HTTP da Data API com tokens GoTrue e validação E2E da interface. Os testes de uso e de negação foram feitos no PostgreSQL com rollback. Nenhum pagamento foi ativado; checkout Mercado Pago permanece desligado.
