# L&A Royal SaaS — Etapa #52: homologação HTTP de 2FA e permissões administrativas

Data: 2026-11-09.

## O que mudou

A etapa #51 criou um teste HTTP de isolamento entre dois proprietários fictícios, mas ainda não havia verificação HTTP da transição de **AAL1 para AAL2** de uma conta Super Admin. O script `scripts/verify-super-admin-mfa-http.mjs` preenche essa lacuna de validação, sem criar contas, alterar dados ou disparar operações administrativas de escrita.

## Procedimento seguro de homologação

Prepare uma identidade **exclusivamente de teste**, previamente autorizada a atuar como Super Admin, no ambiente de homologação. Configure o 2FA TOTP normalmente pelo fluxo de produto.

1. Faça login na conta de teste sem concluir o segundo fator e capture **localmente, de maneira segura**, o access token emitido em `aal1`.
2. Complete o desafio TOTP e capture o novo access token em `aal2` para **a mesma identidade**. Nenhum segredo TOTP, senha ou token deve ser colado no chat, inserido em issues ou versionado.
3. Configure localmente as variáveis `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SAAS_TEST_ADMIN_AAL1_TOKEN` e `SAAS_TEST_ADMIN_AAL2_TOKEN`.
4. Execute `node scripts/verify-super-admin-mfa-http.mjs` no ambiente autorizado, **antes do vencimento dos tokens**.
5. Registre somente o resultado de sucesso/falha e os códigos HTTP, jamais os tokens.

O script exige URLs HTTPS do Supabase e uma chave publicável, e rejeita tokens distintos para o mesmo nível, JWTs expirados, `issuer` de outro projeto, `role` ou `aud` inesperados, usuários diferentes, tokens com `aal` fora do esperado e falhas na validação de identidade pelo serviço `GET /auth/v1/user`.

O JWT é **somente decodificado para checar claims**; sua legitimidade é atestada pela resposta do servidor Supabase Auth. Depois disso, a única RPC exercitada é `POST /rest/v1/rpc/saas_platform_tenants`, **somente leitura**. AAL1 deve ser negado e AAL2 deve ser permitido com resultado `jsonb` representando lista.

## CI e verificações

O teste `tests/super-admin-mfa-http.test.mjs` emula o Auth e a RPC e cobre:
- Sucesso com AAL1 negado e AAL2 autorizado, mesma identidade;
- Vazamento de privilégios em AAL1;
- Recusa inesperada a AAL2;
- Troca de identidade entre tokens;
- Token vencido;
- Ausência de credenciais, que termina sem alegar sucesso.

Este teste simulado roda no GitHub Actions; **as chamadas HTTP reais não são executadas no CI**, pois não existem duas sessões de homologação vinculadas a este fluxo.

## Limites e riscos

Esta etapa **não configura nem eleva usuários de produção a Super Admin**, não manipula fatores MFA e não cria credenciais. Homologação HTTP real continua pendente das sessões específicas de teste. As verificações SQL/RLS e os controles atuais de AAL2 do PostgreSQL permanecem intactos. Ainda falta uma campanha separada de testes de mutação/Storage com tokens reais, com dados descartáveis.

O checkout Mercado Pago permanece desabilitado.


## Diagnóstico do GitHub Actions — 9 de novembro de 2026

As execuções PR #52 [42671766503](https://github.com/equipezero-web/Sistema-L-A-/actions/runs/42671766503), [42672247263](https://github.com/equipezero-web/Sistema-L-A-/actions/runs/42672247263) e [42672647537](https://github.com/equipezero-web/Sistema-L-A-/actions/runs/42672647537) concluíram com falha **sem gerar qualquer job** (a API de jobs retorna lista vazia), portanto não há log de checkout, Node ou testes. Esse comportamento também ocorreu depois que os testes foram associados ao workflow de autenticação anteriormente funcional. A sintaxe YAML foi analisada localmente; inclui os gatilhos `pull_request`, `push`, `workflow_dispatch` e o job `auth`.

Isso aponta para um problema de inicialização/planejamento de workflow ou restrição da conta/plataforma, **não prova erro no JavaScript**. A API de execução disponível pelo conector não expôs a anotação/código de startup que permitiria distinguir restrição de cobrança, política de Actions ou erro interno. A pessoa responsável pelo repositório deve abrir as execuções acima e conferir os banners/annotations; em seguida, revisar **Settings → Billing and licensing → Actions**, **Settings → Actions → General** e, se houver `startup_failure` sem explicação, encaminhar os três IDs ao suporte GitHub. Não altere faturamento sem autorização.

Verificação independente: o conteúdo exato de `scripts/verify-super-admin-mfa-http.mjs` foi executado em ambiente JavaScript isolado com HTTP simulado. Os cinco cenários retornaram os códigos esperados: sucesso=0; acesso AAL1 indevido=1; recusa AAL2=1; usuários diferentes=1; token AAL2 vencido=1. Isso **não substitui** a suíte GitHub Actions nem os testes reais via Supabase Auth.

**Status:** PR #52 permanece sem merge enquanto GitHub Actions continuar falhando antes de iniciar os jobs. Nenhuma alteração foi aplicada ao banco de dados nessa correção de diagnóstico.
