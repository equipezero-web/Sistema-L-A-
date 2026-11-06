# L&A Royal SaaS — Etapa #37: permissão de painel e métricas

Data: 06/11/2026

## Correções

- No painel empresarial, antes da autorização, links laterais, atalhos rápidos e blocos de métricas ficam ocultos. A classe `access-ready` só é adicionada após validação de sessão, membro ativo, tenant ativo e configurações de módulos.
- Para funcionário, o dashboard consulta **somente a contagem** de pedidos; não solicita o campo monetário `total` nem consulta `saas_financial_entries`.
- Os componentes financeiros são escondidos antes que a tela seja liberada para funcionários.
- Para owner e admin, o faturamento reflete somente entradas financeiras confirmadas da tabela de lançamentos. Removido fallback para pedidos concluídos quando receitas são zero.
- Se a consulta financeira falhar, a interface informa indisponibilidade, evitando exibir zero como um resultado confirmado.
- Mantidas as verificações RLS e RPC de backend. O estado visual de `access-ready` não é autorização de segurança.

## Testes

`tests/auth-dashboard-permissions.test.mjs` cobre: funcionários sem acesso monetário, receita zero para owner, administração, falha financeira e bloqueio visual inicial. Incluído na CI de autenticação.

## Pendências

Não há contas reais nem empresas no banco para testes autenticados. Verificação do DOM e de SQL é offline; publicação em GitHub Pages e cenários com usuário real precisam ser homologados. O checkout do Mercado Pago continua desabilitado.
