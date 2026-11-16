# L&A Royal SaaS

Plataforma de gestão empresarial multitenant com painel privado, publicação por empresa e módulos específicos para cada segmento.

## Estrutura do projeto

| Diretório | Responsabilidade |
| --- | --- |
| `auth/`, `onboarding/`, `security/` | Login, cadastro empresarial e segurança da sessão |
| `app/` | Painel empresarial: agenda, vendas, clientes, funcionários, finanças, Minha Loja e configurações |
| `assets/js/` | Regras do painel, autenticação, integração Supabase e editor visual |
| `assets/css/` | Estilos compartilhados do painel |
| `store/` | Páginas públicas e experiência de clientes; acesso canônico em `store/?slug=<empresa>` |
| `super-admin/` | Administração da plataforma, separada da gestão de empresas |
| `supabase/sql/` | Migrações e funções SQL; aplicar somente com revisão do ambiente |
| `supabase/functions/` | Funções server-side para billing e inteligência |
| `tests/`, `.github/workflows/` | Testes automatizados e CI |
| `docs/` | Histórico de decisões técnicas, limitações e validações |

## Modelos de empresa

O modelo (`template_code`) é escolhido na criação da empresa. **Não há seletor de troca de modelo em Configurações nem seletor de layout sem implementação real no editor.** O link público usa o `slug` da empresa e a rota `store/index.html` identifica a experiência apropriada:

| Modelo | Situação do site público |
| --- | --- |
| `barbershop` | Redireciona para `store/barbearia.html`, com a interface de cliente e agendamento integrada |
| `virtual_store` | Página dedicada `store/loja-virtual.html`, catálogo por empresa, carrinho temporário e conferência de valores via função pública de cotação sem reservas ou cobrança; checkout e pedidos transacionais ainda pendentes |
| `instagram_orders` | Apresentação pública de pacotes; pedido transacional integrado ainda requer implementação |
| `business_communication` | Acesso público restrito; dados de CRM e mensagens não são expostos |
| `generic` | Catálogo geral público de produtos/serviços |

**Não copiar credenciais, logins, dados ou configurações de pagamento dos repositórios de referência.** Cada empresa deve ter dados e permissões isolados.

## Aparência e publicação

- `app/aparencia.html` reúne logo, fontes, cores sólidas, paletas e gradientes.
- `assets/js/appearance.js` salva tema por empresa em `saas_store_themes`.
- `assets/js/appearance-designer.js` gerencia opções específicas da barbearia sem apagar gradientes globais.
- `saas_public_stores` é a fonte da configuração **publicada**, distinta das configurações privadas.
- No modelo de barbearia, “Nossa assinatura.” pode ter cor ou gradiente próprio.
- Proprietários e administradores gerenciam o visual; clientes não têm acesso ao editor.

## Rotas de cliente e administração

- Site da empresa: `store/?slug=<slug>`
- Barbearia pública moderna: `store/barbearia.html?slug=<slug>`
- Loja virtual pública: `store/loja-virtual.html?slug=<slug>` (acessada pela entrada canônica)
- Edição da loja: `app/aparencia.html`
- Administração: `app/index.html`
- Configurações: `app/configuracoes.html`

A antiga `store/reservar.html` redireciona barbearias para o agendamento integrado; links públicos da empresa devem preferir a entrada canônica. Ocultar um controle não substitui a verificação de autorização pelo servidor.

## Preparação transacional de pedidos online (desativada por padrão)

A migração `supabase/sql/saas_online_order_intents_20261116.sql` cria uma fila **privada** de intenções de pedido com isolamento por empresa, prevenção de repetição via `(tenant_id, request_key)`, verificação de produtos publicados, disponibilidade, quantidades, preços calculados no banco e expiração curta. A função `saas_online_order_prepare` é **exclusiva de `service_role`**. O acesso de clientes (`anon`/`authenticated`) a essas tabelas e função é explicitamente revogado.

**A ativação comercial exige uma configuração privada habilitada por empresa**, ausente por padrão. Isso é infraestrutura para futura confirmação de pagamentos; não cria `saas_orders`, não gera cobranças, não reserva/baixa estoque, não recolhe dados pessoais e não liga o checkout da loja pública. A futura integração só poderá converter uma intenção em pedido real quando houver webhook de pagamento autenticado, conta recebedora validada, antifraude/idempotência e regras de estoque transacionais.

## Cotação segura de produtos na Loja Virtual

A função `supabase/functions/saas-store-quote/index.ts` aceita apenas um slug válido de empresa publicada do modelo `virtual_store` e uma lista curta de identificadores UUID e quantidades. O servidor consulta novamente preços e disponibilidade em `saas_public_catalog_items`, calcula os subtotais em centavos e informa validade de até dois minutos. A operação é somente leitura, roda com privilégios anônimos sujeitos à publicação/RLS e não recebe preços enviados pelo navegador.

**A cotação não reserva estoque, cria pedidos, realiza pagamentos nem dá garantia de disponibilidade futura.** O checkout continua propositalmente desabilitado. A credencial Mercado Pago usada para a assinatura do SaaS não deve ser usada para vendas das empresas. Uma fase comercial posterior precisará de contas recebedoras próprias, pagamentos verificados por webhook, idempotência, antifraude e redução de estoque em transação após confirmação.

A Edge Function usa acesso público apenas para **consulta do catálogo já publicado**, portanto seu endpoint de cotação precisa ser implantado com `verify_jwt=false`, com o conteúdo de solicitação limitado e sem credenciais privadas.

## Recebimentos por loja (integração em preparação)

- `app/pagamentos-loja.html`: painel de prontidão visível somente ao proprietário de uma empresa do modelo `virtual_store`, com conexão desativada até a autorização de vendedor estar homologada.
- `supabase/sql/saas_merchant_payment_readiness_68.sql`: estado por tenant e provedor. **Não armazena Access Token, Refresh Token, segredo OAuth nem chave de pagamentos**.
- Consulta do estado protegida por RLS de proprietário; inserções/alterações não são permitidas a `anon` ou `authenticated`.
- A função `saas-merchant-oauth` implementa início autenticado com checagem de proprietário, `state` de uso único e PKCE S256, troca de código no servidor e identificação do vendedor em `/users/me`.
- O fluxo utiliza `private.saas_merchant_oauth_attempts` (10 minutos, consumo único), `private.saas_merchant_oauth_credentials` (referências opacas) e `vault.secrets` para Access Token e Refresh Token criptografados.
- Pré-requisitos **obrigatórios e não presumidos**: registrar um aplicativo *Marketplace* Mercado Pago, habilitar o fluxo de código de autorização com PKCE e registrar exatamente a URL `https://lthiztvnaxwrfyziypxd.supabase.co/functions/v1/saas-merchant-oauth`. Configurar nos segredos da Edge Function `MP_MERCHANT_CLIENT_ID`, `MP_MERCHANT_CLIENT_SECRET`, `MP_MERCHANT_REDIRECT_URI` e somente após a homologação `MP_MERCHANT_OAUTH_ENABLED=true`. Não reutilizar os segredos `MP_ACCESS_TOKEN` ou `MP_WEBHOOK_SECRET` da assinatura do SaaS.
- A função `saas-merchant-oauth` precisa receber callback GET sem JWT de navegador; configurá-la com `verify_jwt=false`. Ela autentica manualmente o POST de início e não permite conexão enquanto a configuração estiver ausente.
- A conta da loja pode ser **desvinculada localmente** pelo proprietário, com confirmação; a função restrita ao serviço remove os tokens do Vault e cancela tentativas de autorização pendentes. Isso **não representa revogação automática** da autorização no Mercado Pago; o vendedor deve revogar no próprio provedor, se necessário.
- A autorização agora solicita o escopo `offline_access`, exigido pela documentação do Mercado Pago para futura renovação do Access Token. **A renovação pode ser acionada pelo proprietário a partir da Central de Pagamentos quando faltar até 7 dias para o vencimento**, com bloqueio de concorrência, recálculo no provedor e rotação dos dois tokens no Vault. A Edge Function `saas-merchant-refresh` roda com `verify_jwt=false` para permitir chaves publicáveis modernas no gateway, **mas exige e valida manualmente o JWT Supabase do proprietário** com `auth.getUser()`, MFA e associação ao tenant antes de qualquer acesso à função privilegiada. **Agendamento automático de renovações ainda não foi ativado**, e nenhuma conta real foi homologada.
- **Status `connected` não habilita checkout sozinho.** Renovação/revogação de tokens e recebimento real de clientes ainda exigem uma implementação separada.
- Status `connected` não habilita checkout sozinho. Para pagamentos reais ainda são obrigatórios: aplicativo OAuth registrado no Mercado Pago, callback seguro com `state`, armazenamento protegido dos tokens em backend, validação de recebedor e escopos, renovação e revogação, criação de pedidos com idempotência, notificação autenticada por webhook, controle transacional de estoque e homologação.
- O fluxo de mensalidade do `saas-billing` continua exclusivamente para assinaturas da plataforma; **nunca reutilizar essa credencial para vendas das empresas**.
- O Dashboard continua ilustrativo.

## Validação

O projeto usa testes Node.js sem dependências npm obrigatórias para grande parte da suíte. A partir da raiz:

```sh
node --test tests/saas-ui-consistency.test.mjs tests/saas-virtual-store.test.mjs
node --test tests/saas-settings-public-store.test.mjs tests/saas-business-templates.test.mjs tests/saas-original-barber-template.test.mjs tests/saas-barber-designer.test.mjs tests/saas-public-store-loading.test.mjs
```

As rotinas em `.github/workflows/` executam verificações em pull requests e alterações na `main`. Validar separadamente em produção a publicação, controle de acesso, agendamentos, pagamentos, responsividade e efeitos das migrações; testes de texto e sintaxe não substituem testes reais do navegador e do banco.

Para a revisão de 12/11/2026, consulte `docs/saas-revisao-organizacao-2026-11-12.md`.
