# L&A Royal SaaS — confirmação de e-mail e retomada do 2FA

Data: 06/11/2026 | Etapa #34

## Mudanças implementadas

- O `signUpOwner` agora envia `emailRedirectTo` calculado da URL real do módulo `assets/js/auth.js`, apontando para `auth/login.html` **do mesmo site**, preservando o prefixo `/Sistema-L-A-/` do GitHub Pages.
- A página de Login consulta a sessão ao ser carregada. Se o usuário já confirmou o e-mail e o SDK processou a URL de autenticação, continua automaticamente o fluxo autorizado de Dashboard ou Super Admin, exigindo desafio TOTP se necessário.
- Na página de 2FA, contas que **já têm um fator TOTP verificado** são encaminhadas para o desafio do fator existente em vez de cadastrar outro autenticador.
- Se a sessão já tem `aal2`, o usuário pode prosseguir sem cadastrar novamente um fator.
- A obrigação de MFA depende do perfil Super Admin retornado pelo banco, **não** apenas de `?required=1` na URL; o servidor permanece responsável por confirmar o nível AAL2.
- Usuários sem sessão são redirecionados para Login antes de inicializar a configuração 2FA.

## Testes

- Testes offline de URL de confirmação, retomada de sessão, cadastro inicial de TOTP, desafio com fator verificado, Super Admin, sessão já AAL2, query string não confiável e ausência de sessão.
- `tests/auth-email-totp.test.mjs` executado pelo workflow `auth-onboarding.yml`, além da suíte da etapa #33.
- Nenhuma conta real foi criada; testes não enviam e-mail nem confirmam tokens Supabase verdadeiros.

## Pré-requisitos de publicação

O repositório GitHub indica `has_pages=true`, mas o host `equipezero-web.github.io` não foi acessível por este ambiente de verificação. Não foi possível confirmar HTTP 200, carregamento JavaScript, layout mobile ou fluxo com usuário real.

Na URL Configuration do Supabase Auth (projeto `lthiztvnaxwrfyziypxd`), verificar:

- **Site URL:** `https://equipezero-web.github.io/Sistema-L-A-/`
- **Redirect URL explícita:** `https://equipezero-web.github.io/Sistema-L-A-/auth/login.html`
- Caso exista domínio personalizado, incluir *separadamente* os endereços exatos desse domínio; evitar wildcards amplos de produção.

Dashboard Auth URL Configuration:
https://supabase.com/dashboard/project/lthiztvnaxwrfyziypxd/auth/url-configuration

A configuração atual de redirecionamentos do Supabase não pôde ser lida pelo conector; **não afirmar que esses endereços já estão liberados**.

## Homologação externa restante

1. No navegador, abrir a URL pública e confirmar que os arquivos JS carregam.
2. Cadastrar e-mail de teste real, clicar no link de confirmação e validar retorno para Login e depois para Onboarding.
3. Criar empresa de teste, entrar em configurar 2FA, confirmar código TOTP no aplicativo.
4. Sair e entrar novamente, confirmar que um fator já verificado exige apenas desafio, não novo QR Code.
5. Repetir com Super Admin de teste e conferir AAL2 real.
6. Testar estados de sessão expirada e usuário suspenso em mobile e desktop.

**Pagamento:** `MP_CHECKOUT_ENABLED` continua desabilitado até a homologação do Mercado Pago.

Referências:
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-mfa
