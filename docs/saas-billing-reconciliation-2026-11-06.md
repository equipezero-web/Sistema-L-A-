# L&A Royal SaaS — homologação técnica de cobrança (etapa #32)

Data: 06/11/2026 | Supabase: `lthiztvnaxwrfyziypxd`

## Situação da cobrança

**CHECKOUT DESABILITADO POR PADRÃO.** O plano `royal-30` está cadastrado por R$ 30/mês, mas **não houve pagamento real, teste de cobrança com credenciais Mercado Pago nem homologação ponta a ponta**. O usuário não deve receber uma cobrança até a liberação deliberada do checkout.

O endpoint `saas-billing` foi implantado na versão **3**, exigindo JWT Supabase (`verify_jwt=true`). O endpoint `mercado-pago-webhook` foi implantado na versão **2**, recebendo eventos sem JWT (`verify_jwt=false`) mas exigindo **assinatura HMAC válida** com `MP_WEBHOOK_SECRET`. Ambos foram comparados com o conteúdo versionado no GitHub e corresponderam.

## Erros localizados antes da correção

1. A tela `app/plano.html` enviava `tenant_id`, mas a função de cobrança anteriormente publicada exigia também `plan_id`, levando a rejeição.
2. A cobrança publicada enviava `external_reference=tenantId:planId:userId`, porém o webhook tratava `external_reference` como UUID exclusivo da empresa. Isso impedia o processamento correto.
3. O código `saas-billing` versionado era um placeholder (503), diferente da função já implantada.
4. O cliente com login não possui permissão `INSERT/UPDATE` em `saas_subscriptions` (proteção intencional por RLS); a cobrança publicada tentava gravar nessa tabela com o cliente do usuário e falharia após criar a assinatura no provedor.
5. O webhook antes confiava no `external_reference` sem conferir se o `provider_subscription_id` recebido realmente correspondia ao registro já associado à empresa.
6. O diretório `saas-billing-webhook` no repositório era um placeholder não implantado. Foi substituído pela fonte real `mercado-pago-webhook`.
7. A tela do plano usava propriedades globais implícitas para alguns elementos, inclusive `status`, que pode conflitar com propriedades do navegador.

## Correções aplicadas

- Frontend consulta o status de disponibilidade da cobrança por `saas-billing` (`action=status`). Se bloqueado, desativa o botão e informa que nenhuma cobrança foi iniciada.
- A cobrança aceita o contrato `{tenant_id}` da interface e só permite contratação ao **proprietário autenticado**, com empresa ativa e e-mail confirmado.
- A verificação do plano Royal 30 e valor de R$ 30 ocorre **no servidor**; campos do cliente não determinam preço.
- `MP_CHECKOUT_ENABLED=true` deve ser explicitamente configurado **depois** da homologação para liberar o checkout. Ausente ou diferente de `true`, a função retorna `CHECKOUT_DISABLED` (503) sem contatar o Mercado Pago.
- O contrato com o Mercado Pago usa `external_reference=tenant UUID`. O link de checkout precisa ser HTTPS e de um domínio Mercado Pago permitido.
- Após obter a assinatura no provedor, a gravação local pendente é feita com credenciais **server-only**, respeitando a RLS para usuários comuns.
- Uma assinatura já registrada bloqueia tentativas duplicadas durante estados ainda pendentes ou ativos, em vez de iniciar várias cobranças.
- O webhook mantém validação de assinatura HMAC e exige associação **exata** com assinatura local (`tenant_id`, `provider_subscription_id`, `plan_id` e provedor) antes de aplicar alterações.
- Configuração de `verify_jwt` está declarada em `supabase/config.toml`. Nenhuma credencial real está no repositório.

## Testes realizados

- Simulações isoladas (sem internet, tokens ou cobranças): acesso não autenticado (401), administrador tentando contratar (403), checkout desligado (503 e zero chamadas externas), consulta do estado (200), pagamento simulado habilitado com contrato de referência correto e gravação pendente simulada.
- Webhook simulado com HMAC válido e vínculo correto permitiu chamada interna; HMAC ausente devolveu 401; assinatura divergente foi rejeitada **sem ativar a empresa**.
- Os testes foram versionados em `tests/billing-contract.test.mjs` e o workflow `.github/workflows/billing-contract.yml` roda sem credenciais nem API real.
- As fontes da versão implantada foram conferidas diretamente com as fontes da branch.
- O banco tinha **zero usuários e zero empresas** na data da revisão. Nenhum pagamento real foi criado.

## Antes de liberar clientes para pagamentos

1. Revisar as credenciais do Mercado Pago em **Edge Function Secrets**: `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`. Nunca colar valores em GitHub, arquivos públicos ou no chat.
2. Na aplicação Mercado Pago correta, configurar e validar o webhook assinado na URL:

   `https://lthiztvnaxwrfyziypxd.supabase.co/functions/v1/mercado-pago-webhook`

   Ativar os tópicos `subscription_preapproval` e `subscription_authorized_payment` conforme exigidos pelo provedor.
3. Confirmar a URL pública oficial para retorno (`SAAS_PUBLIC_APP_URL`). O valor padrão no código é `https://equipezero-web.github.io/Sistema-L-A-`, mas **não foi possível atestar sua acessibilidade** pela ferramenta de navegação.
4. Homologar com usuário de teste, autenticação real e ambiente de **teste/sandbox** do Mercado Pago: criação de assinatura, redirecionamento, webhook genuinamente assinado, transição de status para pago, falha e cancelamento, repetição de webhooks e reativação da loja.
5. Verificar que nenhuma loja é liberada sem fatura aprovada e assinatura válida, inclusive em eventos fora de ordem.
6. **Somente depois desses testes**, habilitar conscientemente `MP_CHECKOUT_ENABLED=true` nas variáveis seguras do Supabase.

## Limitações

A publicação do GitHub Pages não pôde ser aberta por esta interface de navegação; portanto, HTML e login não estão visualmente homologados. As verificações de cobrança são mocks e validação estática/implantação, não transações reais. Não houve teste de cartão, criação de cobrança real, confirmação de email ou cadastro/MFA via navegador.

Referências:
- Mercado Pago — assinaturas pendentes: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- Mercado Pago — validação de webhooks: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- Supabase — Edge Functions Secrets: https://supabase.com/docs/guides/functions/secrets
