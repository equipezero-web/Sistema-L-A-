# Seis frentes operacionais — 17/11/2026

## Implementações desta rodada
- **Loja Virtual:** painel para acompanhar expedição de pedidos existentes confirmados, com estado, transportadora e código de rastreio. Módulo de transporte de requisição Mercado Pago usa access token OAuth do vendedor, valores já autorizados pelo servidor e `X-Idempotency-Key` estável. Não está ligado ao checkout público; o executor de cobrança continua bloqueado por segurança.
- **Instagram/Meta:** verificação HMAC SHA-256 para eventos webhook e extração mínima de IDs. Não existe OAuth por tenant, armazenamento de mensagens, envio de mensagens ou webhooks publicados: o módulo sozinho NÃO constitui integração oficial habilitada.
- **Comunicação Empresarial:** CRM interno com tópicos e mensagens armazenados sob tenant, sem expor conteúdo em vitrine pública; mensagens não são enviadas externamente.
- **Funcionários:** RPC `saas_link_employee_login` e tela de vínculos entre o funcionário cadastrado e uma conta Auth já ativa com papel `employee` na mesma empresa. Exige MFA (AAL2); não cria contas nem promove papéis.
- **Minha Loja:** título, descrição, banner, espaçamento e arredondamento de cards da loja virtual dedicada passam a respeitar o tema publicado do tenant; a barbearia possui designer próprio.
- **Segurança:** novas tabelas com RLS, acesso anônimo revogado, colunas de atualização restritas, chaves estrangeiras compostas por tenant e MFA na vinculação de contas.

## Bloqueadores para lançamento
1. Processamento comercial real: precisam ser concluídos criação da transação e associação atômica, reconciliação de webhook, geração de pedido, descontos e cálculo de frete, estoque transacional e estornos. **Não ativar checkout** antes de homologar tudo.
2. Meta: registrar app, obter aprovação/permissões, autorizar cada empresa via OAuth, validar conta recebedora, webhooks assinados e política de janela de mensagens. Não capturar senha do Instagram.
3. Funcionários: fluxo de criação/invite/recuperação de conta de colaboradores ainda precisa de implementação separada; este RPC só vincula contas existentes.
4. Minha Loja: o designer da barbearia e os modelos Instagram/Comunicação têm editores específicos/parciais; percorrer e testar todas as seções de cada modelo.
5. Supabase Auth: leaked password protection precisa ser habilitado em configurações da plataforma: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
6. Todas as áreas precisam de E2E em dois tenants, MFA, sessão expirada, mobile e pagamentos de homologação.

## Invariantes
- `PAYMENT_PROCESSING_IMPLEMENTED=false` mantém cobranças comerciais reais desabilitadas.
- Dashboard permanece ilustrativo.
- O suporte e os registros comerciais do SaaS não se misturam com os do vendedor.
