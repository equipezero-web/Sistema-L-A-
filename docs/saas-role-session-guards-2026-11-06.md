# L&A Royal SaaS — Etapa #43: acesso e sessões por perfil

Data: 2026-11-06

## Problema e correção
O dashboard já exigia validação de MFA na entrada, mas páginas de módulos internos utilizavam `getBusinessContext()`, que apenas verificava identidade e vínculo com uma empresa, sem revalidar o nível AAL e a natureza de Super Admin. Com o endereço direto de um módulo, era possível contornar a etapa **visual** de desafio MFA; as políticas RLS no backend continuam sendo a fronteira autorizativa e não devem depender de redirecionamentos.

Agora `getBusinessContext()`:
1. Exige `supabase.auth.getUser()` e redireciona ao login se não houver sessão válida.
2. Exige o nível de garantia via `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`; quando `currentLevel=aal1` e `nextLevel=aal2`, redireciona ao login para desafio TOTP sem consultar tabelas do tenant.
3. Consulta `saas_my_access_summary`, sem usar metadados controlados pelo usuário, e falha fechado quando não consegue verificar o perfil.
4. Encaminha Super Admin ao painel próprio mesmo se tiver vínculo empresarial; `app.js` agora faz a mesma validação na existência de membros ativos.
5. Mantém os controles de vínculo ativo, papel, tenant habilitado e RLS. Não altera política de dados nem credenciais.

## Testes
`tests/auth-role-session-guards.test.mjs` adiciona cenários offline de conta sem sessão, empregado com MFA pendente, Super Admin com membership, empregado AAL2, erro de verificação e desvio de Super Admin na dashboard. O workflow de autenticação passou a executar o novo arquivo e observar `assets/js/business.js`.

## Limitações
São testes de contrato e simulações locais, não provas de login real. AAL2 obrigatório no Super Admin permanece guardado também pelas RPCs privilegiadas, já revisadas na etapa #41. Testes com contas reais de proprietário/funcionário/Super Admin, confirmação de e-mail e TOTP continuam necessários. O checkout permanece desabilitado.

Recomenda-se evitar que um usuário tenha permissões de Super Admin e membro de tenant simultaneamente, para reduzir ambiguidade de experiência; a regra de prioridade atual direciona o usuário ao painel de plataforma.
