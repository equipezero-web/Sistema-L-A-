# Revisão de segurança do Super Admin — 2026-11-04

## Escopo
Funções `saas_platform_*`, auditoria, avisos ao proprietário e telemetria de minutos de uso do L&A Royal SaaS.

## Evidências e alterações
- As tabelas `saas_platform_actions` e `saas_usage_minutes` têm RLS habilitado, sem políticas de acesso direto; as funções autorizadas fazem as operações. A ausência de políticas, neste caso, implementa *deny by default*.
- As funções privilegiadas expostas a usuários autenticados exigem validação de autorização interna (por exemplo, `saas_is_platform_super_admin`, que também exige AAL2), ou limitam registros ao usuário/tenant. Uma sinalização do Advisor para `SECURITY DEFINER` não significa por si só um acesso indevido; os pontos de entrada continuam exigindo revisão periódica.
- Foi identificado que `saas_record_usage` validava o vínculo ativo do usuário, mas não `saas_tenants.active`. A nova versão bloqueia o registro quando a loja está inativa e mantém a autenticação/vínculo como requisitos.
- No painel, a confirmação de perda de acesso durante a sessão desencadeia recarregamento para reavaliar o estado e as permissões.

## Verificações executadas
- Supabase: ACL da RPC `saas_record_usage`: `anon=false`, `authenticated=true`.
- Supabase: função atualizada contém teste de `t.active is true`.
- Supabase: chamada sem sessão de usuário foi rejeitada com a mensagem esperada; não houve gravação de minutos.
- Código: verificação sintática da versão alterada do JavaScript.
- Pendência: fluxo integrado com contas reais de proprietário, funcionário e Super Admin; especialmente mudança de status com o dashboard aberto.

## Advertências do Database Advisor
- `rls_enabled_no_policy` em `saas_platform_actions` e `saas_usage_minutes`: acesso direto intencionalmente negado. Não criar políticas amplas para silenciar o aviso.
- `authenticated_security_definer_function_executable`: exige reavaliar controles internos de cada função antes de modificar concessões; as RPCs da interface precisam permanecer executáveis por contas autenticadas, mas cada uma deve aplicar sua autorização.

Documentação: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
