# L&A Royal SaaS — validação do fator TOTP no login

Data: 06/11/2026 | Etapa #35

## Correção

Na etapa #34, a retomada da sessão com AAL1 e AAL2 pendente escolhia o primeiro fator TOTP disponível como fallback, mesmo quando ainda não verificado. Agora a seleção usa **exclusivamente fatores com status `verified`**.

- Fator verificado: exibe desafio TOTP e permite navegar somente após `aal2`.
- Nenhum fator verificado: encaminha ao fluxo de configuração 2FA, em vez de tentar desafiar um fator incompleto ou avançar ao dashboard.
- Super Admin: mantém configuração obrigatória e checagem AAL2 existente.
- Nenhuma alteração em políticas de banco, pagamento ou credenciais.

## Validação

O arquivo `tests/auth-verified-factor.test.mjs` contém cenários com fator pendente, fator verificado, Super Admin sem fator, sessão AAL2 e ausência de sessão. O workflow `auth-onboarding.yml` inclui esse teste em pull requests e commits na main.

Esses testes são simulações offline, não validação de contas, e-mails ou MFA reais. Manter pendente teste em navegador com fator verificado e não verificado antes da homologação geral.
