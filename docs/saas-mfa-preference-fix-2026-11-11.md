# L&A Royal SaaS — #55 Corrigir confirmação do 2FA (11/11/2026)

## Relato reproduzido

Na rota `security/setup-2fa.html` ambos os caminhos (ativar o 2FA ou escolher "Agora não") terminavam em `permission denied for function saas_set_mfa_preference`.

A inspeção ao vivo no PostgreSQL confirmou:
- `public.saas_set_mfa_preference(text)` existia, mas `authenticated` e `anon` não possuíam `EXECUTE`;
- a função anterior era `SECURITY INVOKER` e atualizava campos `mfa_preference` e `mfa_prompted_at`, os quais **não** podem ser alterados diretamente por `authenticated`;
- conceder `UPDATE` diretamente nesses campos para solucionar a mensagem abriria um caminho para forjar a confirmação de MFA sem verificar AAL2. **Não conceder esse UPDATE.**

## Solução

1. Nova função `private.saas_set_mfa_preference(text)` `SECURITY DEFINER`, com `search_path=''`, validação obrigatória de `auth.uid()`, whitelist `enabled/declined` para compatibilidade, requisito `auth.jwt()->>'aal'='aal2'` ao marcar `enabled` e `UPDATE` restrito à linha com `user_id=auth.uid()`.
2. `public.saas_set_mfa_preference(text)` vira wrapper `SECURITY INVOKER`, com apenas `EXECUTE` para `authenticated`. A implementação privada não é exposta pela Data API; `anon` e `PUBLIC` ficam sem EXECUTE.
3. Na tela de configuração foi retirado o botão "Agora não". O processo de 2FA é o caminho visível de configuração.
4. Quando já existe fator confirmado **e** sessão AAL2, a tela grava a preferência pendente e encaminha para o plano/painel, sem forçar novo QR. Ao falhar depois da verificação, mostra mensagem específica em vez de indicar código inválido.
5. O teste de regressão verifica grants, guarda do usuário, exigência AAL2 e ausência do botão de pular.

## Homologação e segurança

Testar no Supabase, dentro de `BEGIN/ROLLBACK`, ao menos:
- `authenticated` AAL1 não grava `enabled`;
- `authenticated` AAL2 grava `enabled` somente em seu próprio perfil;
- `anon` não invoca a RPC;
- `authenticated` continua sem `UPDATE` direto nos campos de segurança;
- usuário não autenticado não pode marcar MFA como habilitado.

**O fluxo real de confirmação TOTP depende da sessão Auth do usuário; testes SQL simulam apenas claims do PostgreSQL.**

**Incidente de chave TOTP:** se alguém expôs a chave manual/QR, o fator afetado deve ser revogado e um fator novo deve ser cadastrado por fluxo autenticado. Não cole novos segredos nem códigos de seis dígitos em conversas, tickets ou logs. Não reter chaves nos scripts.

A correção não ativa o checkout Mercado Pago e não altera dados comerciais ou permissões do Super Admin.
