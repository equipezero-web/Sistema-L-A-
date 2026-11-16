# L&A Royal SaaS — revisão integrada de 14 áreas

Esta rodada reaproveita a arquitetura multitenant e adiciona central operacional, suporte, notificações e PWA básico do painel. **Não representa homologação completa de todos os 14 módulos.**

| Área | Implementação existente ou adicionada | Limites ainda pendentes |
| --- | --- | --- |
| Painel Administrativo | Dashboard + nova Central Operacional com busca e atalhos por função | Revisão interativa de todos os botões e filtros de cada página |
| Minha Loja | Editor de cores/gradientes/logo/fonte e designer de barbearia existentes, agora acessíveis pela Central | Todos os módulos e seções de cada modelo precisam de editor e validação próprios |
| Modelos Empresariais | Links para o modelo fixado no cadastro e storefront ativo por slug | Testar quatro templates, integração real Instagram e comunicação empresarial |
| Responsividade | Central responsiva com grids e campos adequados a mobile | Testes visuais de todas as páginas em diferentes aparelhos |
| Segurança | getBusinessContext exige sessão, permissões e MFA conforme elegibilidade; novo suporte/avisos protegidos por RLS | Teste de penetração, políticas de sessão e leaked-password protection |
| Funcionários e Recepção | Cadastro de funcionários existente e link por função | Provisionamento de contas de recepção pelo admin sem compartilhar credenciais |
| Super Admin | Gestão de empresas, auditoria existente e nova fila de suporte com atualização de status | Completar respostas/conversas, validar suspensões, plano e auditoria em produção |
| Notificações | Caixa por destinatário e triggers de pedidos, agendamentos e assinaturas | Push/email/WhatsApp e ações granulares de aviso |
| Financeiro | Página financeira e relatórios existentes | Validação de exportações e conciliações; não inventar dados |
| Suporte | Abertura de tickets por owner/admin, fila no Super Admin, atualização de status | Respostas e anexos ainda não implementados |
| Publicação | Link canônico da empresa ativa e configuração de aparência | Domínios personalizados e validação de DNS/TLS |
| PWA | Manifesto, ícone SVG, SW network-only (não armazena dados privados) e botão se navegador oferecer install | PNGs multi-resolução, testes de instalação e cobertura completa das páginas |
| Auditoria | Histórico de ações de plataforma existente | Estender auditoria para mudanças de tickets e demais módulos |
| Royal AI | Chat de análises existente com autenticação do tenant | Automações com permissões explícitas, telemetria, testes e limites |

## Regras preservadas
- Dashboard continua ilustrativo onde identificado.
- Checkout de lojistas continua bloqueado (`PAYMENT_PROCESSING_IMPLEMENTED=false`).
- Não se reutiliza credencial de assinatura SaaS para cobranças de lojas.
- Não se habilita domínio, rede de notificações externa ou automações financeiras sem configurações, consentimento e testes.

## Verificação pós-migração
- Conferir que `anon` não consulta tickets nem notificações.
- Conferir que `authenticated` só acessa tickets da sua empresa e avisos do próprio usuário.
- Confirmar permissões de atualização de status ao Super Admin.
- Confirmar que triggers não incluem dados pessoais de clientes no texto dos alertas.
- Executar CI e testes de navegador antes de anunciar produção.
