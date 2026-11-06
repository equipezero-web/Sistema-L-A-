# L&A Royal SaaS — Etapa #40 — Recuperação da publicação após pagamento

Data: 2026-11-06

## Diagnóstico

A função privada `private.saas_apply_provider_subscription` colocava `saas_store_themes.published=false` quando o estado da assinatura não era ativo. Esse comportamento apagava a **intenção de publicação definida pelo proprietário**. Quando chegava um novo pagamento aprovado, o sincronizador reabria a loja somente se `published=true`, deixando a reativação incompleta.

Outra condição de risco: o estado `active` podia ser gravado sem período final válido quando o provedor informava `authorized` e pagamento `approved`, já que a função pública de acesso trata `current_period_end IS NULL` como potencialmente válido.

## Correções

1. Removida a alteração automática de `saas_store_themes.published` durante inadimplência ou cancelamento. **A preferência do usuário permanece armazenada**.
2. `public.saas_sync_public_store(p_tenant_id)` continua sendo invocada para retirar a cópia da loja da leitura pública quando a assinatura não está válida e reinseri-la quando um pagamento válido restabelece acesso.
3. O estado `active` exige simultaneamente `provider_status='authorized'`, `payment_status='approved'`, `p_period_end IS NOT NULL` e `p_period_end > now()`. Sem vigência confirmada, acesso não é ativado.
4. Mantido contrato existente da função: argumentos e defaults, `SECURITY DEFINER`, esquema privado, `search_path` vazio, plano Royal 30 e trilha de auditoria. Nenhuma credencial foi alterada.
5. A política RLS pública da etapa #38 continua filtrando acesso a cada leitura: a intenção de publicar **não** significa autorização sem assinatura.

## Aplicação e checagens

- Migration `saas_subscription_preserve_publication` aplicada, após corrigir defaults da função preexistente.
- Migration `saas_subscription_require_future_period` aplicada.
- Verificação de metadados confirmou `SECURITY DEFINER` e `search_path` vazio.
- Um tenant inexistente continua invisível no teste de leitura pública.
- Teste estático `tests/billing-publication-recovery.test.mjs` entrou no workflow `billing-lifecycle.yml`.

## Limitações conhecidas

Não há tenants e assinaturas de clientes em produção para testes de renovação reais. Os testes do CI são offline e verificam o contrato SQL; não executam o cenário completo com webhook aprovado e banco populado. Os estados no Mercado Pago, a conciliação de cobranças atrasadas e eventual período de tolerância dependem de homologação sandbox. Uma loja que o proprietário havia despublicado propositalmente não será publicada automaticamente.

**Checkout continua desligado**. Nenhuma cobrança foi iniciada nesta etapa.
