# L&A Royal SaaS — Modelos por empresa (Etapa #61)
Data: 11/11/2026.

## Repositórios do proprietário efetivamente consultados

| Modelo do SaaS | Origem GitHub | Componentes confirmados |
|---|---|---|
| Barbearia | https://github.com/equipezero-web/Adriano-Paulo-Barbearia | `index.html`, `LEIA-ME.md`: cliente, atendimento, agendamentos, planos, administração, recepção, identidade visual e 2FA |
| Loja Virtual | https://github.com/equipezero-web/L-A-Advisory | `index.html`, `README_DEPLOY.txt`: catálogo, filtros, carrinho, cadastro de cliente, pedidos, pagamentos, afiliados, PWA |
| Pedidos Instagram | https://github.com/equipezero-web/flowboost-pedidos | `index.html`, `README.md`: seleção de pacotes, validação no servidor, Edge Function, identificador do pedido e WhatsApp |
| Comunicação empresarial | https://github.com/equipezero-web/LA-Advisory-Team | `index.html`, `README.md`: CRM/Kanban, projetos, financeiro, equipe, comunicação privada e PWA |

O usuário também enviou os quatro `index.html` para consulta. A referência dos códigos e fluxos **não importa** a conexão Supabase, credenciais ou contas de um produto no SaaS. Cada tenant usa a infraestrutura de `Sistema-L-A-`.

## Implementado nesta etapa

1. A coluna `public.saas_tenants.template_code` define qual sistema pertence à empresa: `barbershop`, `virtual_store`, `instagram_orders`, `business_communication`, `generic`.
2. `saas_onboard_company_template` guarda o modelo **na mesma transação** da criação do tenant, mantendo o RPC antigo em funcionamento para compatibilidade.
3. O proprietário escolhe o modelo no cadastro ou em **Configurações > Modelo da empresa**; trocar o modelo não apaga clientes, pedidos, funcionários nem dados financeiros.
4. `public.saas_public_stores.template_code` replica apenas o identificador público do modelo enquanto a vitrine está autorizada, via `saas_sync_public_store`. Permanecem a verificação de empresa ativa, onboarding, publicação e assinatura/trial.
5. `store/index.html` renderiza apresentação distinta para barbearia, loja virtual e pacotes Instagram; exibe somente informações públicas e impede que o modelo Comunicação Empresarial exponha qualquer mensagem ou CRM na vitrine.
6. Para uma empresa já cadastrada com `business_type` contendo «barbear», incluindo Lapis Servidor, o tipo é preenchido automaticamente, sem mudar seus cadastros ou assinatura.

## Limites explícitos e próximos módulos

Esta etapa é o **fundamento de modelos e identificação visual**, não uma clonagem total dos quatro sistemas. Recursos que dependem de operações autenticadas e transacionais serão migrados como módulos separados:

- **Barbearia:** calendário por profissional, horários e reservas confirmadas no backend, cliente autenticado, recepção e fechamento de atendimento, planos e faturamento. Não aceitar reserva pública sem proteção contra abuso e concorrência de horários.
- **Loja Virtual:** carrinho, estoque por tenant, checkout Mercado Pago com idempotência, pedidos e webhook assinado. A vitrine atual ainda não processa pedidos nem pagamentos de consumidores.
- **Instagram:** tabela de pacotes configuráveis por loja, API de pedido com preço calculado no servidor, verificação antiabuso e painel de pedidos. Sem integração automática com redes sociais ou solicitação de senha de usuário.
- **Comunicação Empresarial:** CRM/Kanban, papéis da equipe, projetos, conversas e histórico com autorização por tenant e por usuário. Jamais publicar mensagens, receitas privadas ou dados de cliente no catálogo anônimo.
- **Exclusão de empresa com taxa R$15:** é um trabalho separado de segurança/billing: solicitar, alertar sobre perda de dados, confirmar por e-mail, cobrar via checkout, verificar webhook e só então executar expurgo respeitando retenção e liberar a criação de nova empresa com a mesma conta. **Nenhuma exclusão nem cobrança foi implementada aqui.**

## Segurança e testes

- Modelos não conferem permissão, pagamento, papel ou acesso a outras empresas.
- Dados do repositório FlowBoost (e-mail, WhatsApp, banco de origem) NÃO são copiados como configuração compartilhada.
- Campos e origens do usuário não são injetados em HTML sem escaping.
- Testes em `tests/saas-business-templates.test.mjs`, `tests/saas-settings-public-store.test.mjs`, `tests/saas-public-store-loading.test.mjs`; workflow dedicado.
- Migração aplicada e testada em transação de banco; confirmar que `anon` acessa somente a vitrine publicada e que um proprietário não altera `template_code` de outro tenant.

## URLs

- Cadastro: `https://equipezero-web.github.io/Sistema-L-A-/onboarding/`
- Configurações: `https://equipezero-web.github.io/Sistema-L-A-/app/configuracoes.html`
- Loja de exemplo: `https://equipezero-web.github.io/Sistema-L-A-/store/?slug=lapis-servidor`

Revisões adicionais de desempenho, responsividade e os fluxos de negócio reais ocorrerão nas próximas etapas.
