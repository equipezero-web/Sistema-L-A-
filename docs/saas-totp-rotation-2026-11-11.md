# L&A Royal SaaS — etapa #56: substituição segura de TOTP

Data: 2026-11-11.

## Motivação

Quando a chave de configuração TOTP é compartilhada por engano, a conta deve receber um **novo fator** e revogar o anterior. O SaaS não possuía gerenciamento de fatores, e o onboarding redireciona um AAL2 já validado para o plano. Uma tela independente permite a substituição voluntária em sessão autenticada.

## Fluxo seguro

1. Abrir `security/trocar-2fa.html` após entrar e confirmar o autenticador antigo; a tela exige `getVerifiedUser()` e `getAAL().currentLevel === 'aal2'`.
2. Confirmar que existe **exatamente um** fator TOTP verificado. Caso contrário, recusar a ação e orientar suporte para selecionar o fator correto.
3. Clicar **Gerar novo autenticador**. Nenhuma revogação ocorre neste passo; o fator antigo continua funcionando.
4. Escanear o novo QR ou inserir a nova chave em seu aplicativo autenticador, **sem compartilhar a chave ou código**.
5. Confirmar o TOTP novo. O front-end exige o retorno de `verifyTotpEnrollment()`, AAL2 e que o novo fator apareça como `verified` em `listMfaFactors()`.
6. Gravar `setMfaPreference('enabled')` pela RPC corrigida na etapa #55 e **só então** chamar `unenrollTotp(oldFactorId)`.
7. Se a revogação falhar, manter estado `newVerified` e mostrar opção de repetir somente o encerramento da troca, sem revogar o novo fator. A página não armazena chaves.
8. Após sucesso, limpar QR, texto de chave e campo de código. O fator novo é o único ativo.

## Limitações e alertas

- O fluxo precisa de login humano com AAL2. Nenhum fator de usuário real foi modificado por ferramentas administrativas.
- No caso de múltiplos fatores verificados, a tela falha de maneira segura para não revogar o fator errado.
- A verificação automatizada usa mocks da SDK. O fluxo real deve ser testado com a **conta de homologação**; não envie chaves, QR codes nem códigos temporários.
- O checkout Mercado Pago não foi modificado.
- A implementação depende das APIs oficiais `supabase.auth.mfa.enroll/challengeAndVerify/listFactors/unenroll` da SDK JavaScript.

Referência: https://supabase.com/docs/reference/javascript/auth-mfa-unenroll
