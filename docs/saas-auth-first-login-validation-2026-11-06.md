# L&A Royal SaaS — Homologação de cadastro e primeiro acesso (etapa #33)

Data: 06/11/2026 | Projeto: `lthiztvnaxwrfyziypxd`

## Falha confirmada

`public.saas_onboard_company` declarava uma variável como registro `saas_tenants`, porém atribuía a ela o valor UUID retornado por `saas_create_tenant`. O cadastro de empresas realmente falhava com `22P02: malformed record literal`, reproduzido em transação com usuário fictício.

## Solução aplicada

- A RPC `saas_onboard_company` agora recebe o ID de `saas_create_tenant` em uma variável `uuid` e retorna o registro `saas_tenants` produzido por `saas_complete_onboarding`.
- Nova RPC `saas_my_access_summary()` revela apenas três valores booleanos referentes à **própria conta autenticada**: se já teve vínculo com empresa, se é proprietária de alguma empresa e se seu perfil é Super Admin. Ela não expõe nomes, IDs ou dados de outras contas. EXECUTE indisponível para `anon`.
- Se o dashboard não encontra um vínculo ativo e a conta é realmente nova, direciona para `onboarding/index.html`. Contas suspensas não são confundidas com novos cadastros; comunicados administrativos continuam sendo mostrados.
- Se um Super Admin acessa diretamente o dashboard sem vínculo com empresa, é encaminhado para o painel Super Admin (que continua exigindo AAL2).
- Telas de Login, Cadastro, Onboarding e 2FA usam referências DOM explícitas, em vez de depender de propriedades globais implícitas. Isso resolve especificamente o conflito do botão `confirm` de 2FA com a função nativa do navegador.
- Após verificação TOTP, o cliente exige `currentLevel === 'aal2'` antes de seguir, preservando a validação AAL2 também no servidor.

## Testes executados

- Um teste SQL transacional usando `auth.users` fictícios reproduziu a falha antes da correção; repetido depois, aprovou a criação de empresa com tipo, tema, proprietário e `onboarding_completed=true`.
- Teste em `tests/sql/saas_onboarding_transactional.sql` aprovado para: conta nova, conta já proprietária, funcionário suspenso e bloqueio de publicação prematura. Encerra em `ROLLBACK`.
- Após a transação, o banco manteve zero contas Auth e zero empresas; nenhum dado fictício ficou persistido.
- Permissão da RPC `saas_my_access_summary`: `authenticated` permitido, `anon` negado.
- Sete testes isolados de roteamento da conta, incluindo falhas na RPC, suspensão e Super Admin, passaram.
- Sintaxe JavaScript verificada para os quatro formulários e `assets/js/app.js`; testes CI de sintaxe/DOM adicionados ao GitHub Actions.
- A publicação do GitHub Pages não foi alcançável pelas ferramentas de consulta nesta revisão, portanto **nenhuma validação visual de tela ou login real foi afirmada**.

## Homologação pendente

- Confirmação real de e-mail, sessão Supabase no navegador e ciclo completo de acesso com uma conta de teste real.
- TOTP com aplicativo autenticador real e login Super Admin com AAL2.
- Página publicada, mobile e desktop, incluindo redirecionamento e estados de erro.
- Pagamentos reais continuam desabilitados por `MP_CHECKOUT_ENABLED` até homologação do Mercado Pago.

## Arquivos
- `supabase/sql/saas_first_login_onboarding_access.sql`
- `tests/sql/saas_onboarding_transactional.sql`
- `tests/auth-first-login.test.mjs`
- `tests/auth-inline-syntax.test.mjs`
- `.github/workflows/auth-onboarding.yml`
