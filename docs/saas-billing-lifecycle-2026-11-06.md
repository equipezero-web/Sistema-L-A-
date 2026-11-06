# L&A Royal SaaS — Etapa #39: conciliação do Royal 30

Data: 06/11/2026

## Correções de segurança e experiência

1. O webhook `mercado-pago-webhook` valida que a fatura de `subscription_authorized_payment` contém `preapproval_id` e que a assinatura consultada possui o mesmo identificador antes de chamar a RPC de conciliação.
2. Para notificações `subscription_preapproval`, os resultados de `/authorized_payments/search` são filtrados por `preapproval_id`, descartando faturas de outra assinatura antes de ordenar por data. Na ausência de fatura correspondente, nenhum pagamento é enviado como aprovado.
3. A página `app/plano.html` só apresenta o botão de nova contratação quando o checkout for habilitado **e** não houver contrato ou a assinatura local estiver explicitamente cancelada. Status pendente, ativo ainda registrado ou vencido sem cancelamento orientam aguardar atualização/contatar suporte, evitando nova assinatura automática.
4. Autoridade para publicação continua sendo `saas_subscription_access` e RLS; um retorno de checkout não libera acesso.
5. `MP_CHECKOUT_ENABLED` não foi habilitado.

## Testes de regressão

`tests/billing-contract.test.mjs` cobre vinculação de cobrança correta ou incorreta, webhook assinado, assinatura já registrada e checkout desligado usando apenas mocks. `tests/billing-lifecycle-ui.test.mjs` verifica sintaxe e guarda de contratação. GitHub Actions: `billing-lifecycle.yml`.

## Limites de homologação

Não é uma implementação de auto-reconciliação de todos os estados do Mercado Pago. O estado efetivo de renovação, cancelamento e inadimplência depende da função privada de conciliação existente no banco e do status retornado pelo provedor. O código aqui não altera automaticamente o contrato no Mercado Pago, não libera checkout e não cria pagamentos. Testes reais com uma assinatura sandbox aprovada, inadimplente, pausada, cancelada e renovada ainda são necessários. O funcionamento da função privada não foi alterado nesta etapa.

O webhook implantado só deve ser substituído depois de CI aprovada. A publicação deve preservar `verify_jwt=false` porque a autenticação é a assinatura HMAC da notificação, sem JWT de usuário.
