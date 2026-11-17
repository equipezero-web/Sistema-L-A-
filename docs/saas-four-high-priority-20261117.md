# Quatro prioridades altas — 17/11/2026

## Entregue nesta rodada
- **Recepção:** reaproveita provisionamento real no serviço `saas-reception-admin` (cadastro por administrador, login por usuário e senha, desativação e troca de senha). Ações sensíveis passam a exigir JWT validado pelo Supabase Auth com `aal2`. A conta de recepção continua limitada ao tenant de barbearia e à sua página própria.
- **Minha Loja:** campos de título, descrição, banner, aviso e espaçamento no editor existente, persistidos em `saas_store_themes.design_settings.modelContent`. Renderização no catálogo genérico de Instagram e no portal público de comunicação. Sem troca de template e sem dados privados na página pública.
- **Modelos Empresariais:** painel privado de atividades para solicitações Instagram e tarefas de Comunicação Empresarial, protegidas por RLS e validação do modelo no banco; não conecta a Meta/Instagram e não realiza compras.
- **Segurança:** página para conferir MFA e encerrar outras/todas as sessões; recuperação de senha por email e evento `PASSWORD_RECOVERY`; exigir 2FA para administração de credenciais da recepção.

## Pendências importantes
- **Credenciais e 2FA:** a exigência de AAL2 para criar/resetar/desativar recepção significa que administradores devem ativar TOTP. Confirme fluxo de cadastro de fator e recuperação de segundo fator.
- **Proteção contra senhas vazadas:** o Supabase Auth continua exigindo habilitação pelo painel do projeto; não é configurada pela migração SQL. Documentação: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- **Recuperação:** inclua a URL pública `/auth/recuperar.html` na lista permitida de Redirect URLs no Supabase Auth para todos os domínios oficiais.
- **Sessões:** signout global/others revoga refresh tokens, mas access tokens existentes podem permanecer ativos até expirar. Verifique sessões no backend para operações financeiras ou administrativas críticas.
- **Editor por modelo:** o editor global cobre campos compartilhados; personalização específica de cada seção e a vitrine dedicada da barbearia/loja virtual permanecem sob seus editores existentes.
- **Instagram/Comunicação:** filas internas não substituem integração oficial da Meta, CRM completo, mensageria e webhooks. Não capturar credenciais de redes sociais.
- **Produção:** executar teste de regressão do navegador, separar usuários de duas empresas e testar MFA/recovery em dispositivos diferentes antes da homologação.

## Invariantes
- Dashboard permanece ilustrativo.
- Checkout Mercado Pago real permanece bloqueado.
- Não executar cobranças, alteração de estoque, nem automações externas de IA nesta etapa.
