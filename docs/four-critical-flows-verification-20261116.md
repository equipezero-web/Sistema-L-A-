# Validação conjunta — quatro fluxos críticos (16/11/2026)

## Escopo
A implementação nesta PR adiciona guardas e observabilidade aos quatro fluxos. **Não constitui lançamento comercial completo**; não simula pagamento real ou entrega, nem libera novos recursos de cobrança.

### Loja Virtual — compra até entrega
- Estruturas existentes: cotação, intenções, tentativas idempotentes, Payment Brick bloqueado, vínculo de pagamento, reconciliação e webhook de lojista.
- Adicionado: verificação de vínculos órfãos, tentativas inconsistentes e múltiplos pagamentos por intenção.
- **Bloqueadores:** Payments API com idempotência/recuperação de timeout, registro atômico de pedido + itens + baixa de estoque, rastreamento de preparação/envio/entrega, estornos e homologação. Checkout real permanece desligado.

### Agendamentos
- Existentes: escolha de horários, cadastro com e-mail confirmado, fila de solicitações e decisão de proprietário.
- Adicionado: trigger de banco com lock por empresa+profissional; impede colisão entre agendamentos pendentes/confirmados em diferentes rotas e concorrência.
- Monitorado: registros sobrepostos e horários inválidos.
- **Ainda requer** testes de ponta a ponta com profissionais e agendas reais, fusos horários, reprogramação, fluxo de confirmação e telas móveis.

### Clientes
- Existentes: vínculos compostos `(tenant_id, customer_id)` em pedidos e agendamentos; autenticação do cliente da barbearia exige conta vinculada à empresa.
- Adicionado: verificação de pedidos/agendamentos ligados a clientes de outra empresa.
- **Ainda requer** testes completos com contas reais distintas, recuperação de acesso, interfaces de cadastro/login em todos os modelos e isolamento de sessões.

### Assinaturas
- Existentes: tabela com um registro por empresa e índice único de assinatura por provedor; webhook de billing separado do webhook dos lojistas.
- Adicionado: auditoria de assinaturas ativas vencidas e duplicidade de identificadores de assinatura do provedor.
- **Ainda requer** testes autenticados de pagamento, renovação, inadimplência, cancelamento, reativação e sincronização de publicação com evento real de provedor.

## Regras de liberação
1. Nenhum pagamento real ou redução de estoque sem reconciliador transacional homologado.
2. Não ativar `SAAS_TRANSPARENT_CHECKOUT_ENABLED` ou `private.saas_online_order_activation.enabled` nesta PR.
3. Não criar vendas/clientes artificiais em produção.
4. Dashboard segue ilustrativo.
5. Executar verificações de banco e testes E2E antes de declarar cada fluxo concluído.
