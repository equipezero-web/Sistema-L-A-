# L&A Royal SaaS — Etapa #42: validação do Super Admin

Data: 2026-11-06

## Diagnóstico
- O painel já chamava as RPCs `saas_platform_tenants`, `saas_platform_audit_filtered`, `saas_platform_set_tenant_active`, `saas_platform_expel_tenant` e `saas_platform_restore_owner`.
- As ações exigiam justificativa e confirmação do nome da empresa em expulsão/restauração. Os guards do banco (Super Admin + AAL2) foram revistos na etapa #41.
- O filtro financeiro ignorava vencimento quando `subscription_status='active'` e o contador de assinaturas ativas incluía contratos com período vencido ou ausente.
- Os controles do HTML apareciam antes do retorno da validação de acesso do Super Admin.
- Uma ação aplicada no backend seguida de falha na atualização do painel era mostrada como falha da própria operação, incentivando repetições indevidas.

## Ajustes
1. `paymentAttention` sinaliza contrato com status diferente de active, pagamento rejeitado/estornado ou validade ausente/vencida/inválida.
2. O indicador de assinaturas vigentes filtra por `status='active'` E `current_period_end>agora`, de acordo com a regra de vigência da etapa #40.
3. Seções de métricas, gestão e auditoria ficam ocultas antes de `getSession`, perfil Super Admin, AAL2, lista e auditoria terem sido processados.
4. Após uma mutação confirmada pelo RPC, o diálogo fecha e a mensagem explicita que a ação foi aplicada. Se recarregar o painel falhar, o usuário recebe orientação para recarregar sem repetir automaticamente a ação.
5. Testes offline `tests/super-admin-dashboard.test.mjs` e workflow GitHub Actions `super-admin-dashboard.yml`.

## Limitações
Não foram criados dados, contas ou pagamentos. Os testes offline validam sintaxe, ligação de RPCs e regras de UI; não substituem testes com conta de Super Admin AAL2 real, inclusive suspensão/expulsão/restauração, nem simulam concorrência real com múltiplos administradores. A interface mantém as medidas de autorização de backend; CSS não é barreira de segurança.
Checkout Mercado Pago permanece desabilitado.
