# Checkout Brick + dados de entrega + testes (23/11/2026)

## Implementação
- **Servidor:** `saas-transparent-checkout` possui status e submit, com geração de intenção/attempt pelo banco, cálculo de preço somente no servidor, vinculação da conta do vendedor, header Mercado Pago `X-Idempotency-Key` estável e reconciliação das respostas. Situações desconhecidas não são reapresentadas como cobrança fracassada.
- **Modo TEST:** submetemos pagamentos **somente** se `SAAS_CHECKOUT_SANDBOX_ENABLED=true`, a empresa estiver ativada, a chave pública começar com `TEST-` e o token OAuth do vendedor também começar com `TEST-`. `PAYMENT_PROCESSING_IMPLEMENTED=false` mantém a produção bloqueada.
- **Comprador:** nome, e-mail, telefone, retirada ou endereço completo (CEP, rua, número, complemento, bairro, cidade e UF) e consentimento. Dados privados persistidos na intenção, sem uso como valor de cobrança.
- **Vendedor:** a confirmação de pagamento copia endereço para a tabela `public.saas_order_delivery_details`, protegida por RLS apenas para owner/admin da mesma empresa; tela de entregas consulta o destino por pedido.
- **Teste automatizado:** contrato, chamadas simuladas ao Mercado Pago (Pix aprovado, cartão, recusas, timeout e divergência), revisão estática de RLS, idempotência, vínculo de endereço e bloqueio de produção.

## Limites de homologação
Os testes Node usam um **provedor simulado** e validam o encadeamento/contratos. **Não são testes reais E2E de sandbox do Mercado Pago**. Para homologar de fato, ainda são necessárias credenciais TEST compatíveis com a conta do vendedor, uma empresa de teste, compradores de teste, um pagamento Pix/cartão por método, status/webhook assinado, cancelamento/estorno e inspeção do pedido, estoque, frete e registro de entrega. Exige-se um ambiente separado da operação comercial.

A função de envio precisa ser publicada com `index.ts` e os dois módulos `_shared/merchant-payment-contract.mjs` e `_shared/merchant-payment-transport.mjs` para que a importação compile.

## Ativação segura
Não habilitar `SAAS_CHECKOUT_SANDBOX_ENABLED` no projeto de produção. O modo TEST só será autorizado depois de conferir credenciais de vendedor válidas em projeto de homologação e aplicar os controles de rate limit, antiabuso e testes reais.

O checkout real permanece bloqueado; pedidos e estoque só são modificados por um recibo de pagamento verificado, segundo as rotinas das PRs #95 e #97. O Dashboard permanece ilustrativo.
