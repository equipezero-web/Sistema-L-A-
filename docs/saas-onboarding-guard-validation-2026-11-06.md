# L&A Royal SaaS — etapa #36: proteção do primeiro acesso

Data: 06/11/2026

## Correção implementada

A página `onboarding/index.html` agora inicia com criação desabilitada e consulta `saas_my_access_summary` com sessão válida antes de liberar o formulário.

- Conta nova sem histórico de vínculo/empresa: permite criar a empresa.
- Conta com empresa ou membro vinculado (inclusive suspenso): volta ao painel empresarial, onde a situação de acesso já é tratada.
- Super Admin: redireciona ao painel protegido.
- Falha na checagem: mantém o formulário bloqueado e mostra erro, sem adivinhar autorização.
- Antes da criação, confirma novamente a sessão e o estado de acesso para reduzir risco de abas desatualizadas.
- Durante o envio, impede duplo clique e duas submissões paralelas; após sucesso, mantém o botão inativo e segue ao 2FA.
- Slug editado manualmente não é sobrescrito pela digitação posterior no nome.

## Validação automatizada

`tests/auth-onboarding-guard.test.mjs` testa novo cadastro, owner existente, membro suspenso, Super Admin, sessão ausente, falha de acesso, envios simultâneos e nova checagem antes de gravar. Incluído no workflow `auth-onboarding.yml`.

## Segurança e limites

A checagem do navegador é uma proteção de UX; a autorização definitiva permanece nas funções SQL e RLS do Supabase. Nenhuma estrutura de banco, preferência de MFA, assinatura ou pagamento foi modificada. Checkout Mercado Pago permanece desabilitado.

O teste é offline; não foram criados usuários ou empresas reais. Homologação com e-mail confirmado, TOTP, plano e páginas publicadas permanece pendente.
