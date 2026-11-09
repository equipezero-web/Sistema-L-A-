# L&A Royal SaaS — Etapa #50: validação de identidade e plano de homologação HTTP
Data: 2026-11-09.

## Mudanças
- `assets/js/auth.js` disponibiliza `getVerifiedUser()`, que executa `supabase.auth.getUser()` — valida a sessão junto ao Supabase Auth, e não apenas confia no armazenamento local.
- `getMyProfile()` usa o usuário validado. O login, ao resolver perfil e destino, utiliza essa função.
- `assets/js/app.js` e `assets/js/super-admin.js` validam o usuário antes das consultas de módulo, membership e dados de plataforma.
- Permanecem os controles de MFA: sessões com fator obrigatório em AAL1 são interrompidas e Super Admin só prossegue com AAL2. O banco ainda é o limite autoritativo via RLS e RPC.

## Testes e limites
Os testes automatizados offline verificam o comportamento de `getVerifiedUser`, erros e ausência de usuário, uso antes do acesso aos dados e gate AAL2 do Super Admin.

Foi criado `scripts/verify-tenant-http.mjs` para homologação via **requisições reais** à Data API e Auth, com duas contas de teste distintas. O script é de leitura: usa `GET /auth/v1/user` para validar o usuário autenticado, `GET /rest/v1/saas_members` e consultas às tabelas de clientes, produtos, pedidos e financeiro, além de chamadas de leitura às RPCs `saas_manager_product_costs` e `saas_platform_tenants`. Ele confirma acesso à própria membership e negação ao tenant alheio, incluindo as RPCs.

O script **não é executado automaticamente no CI**, pois duas identidades de homologação com tokens reais não estão configuradas. Exige variáveis `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SAAS_TEST_A_TOKEN`, `SAAS_TEST_A_TENANT_ID`, `SAAS_TEST_B_TOKEN`, `SAAS_TEST_B_TENANT_ID`. Use exclusivamente contas fictícias; não exponha valores dos tokens em logs, issues ou commits. Não usar `service_role`.

Exemplo local:
```sh
node scripts/verify-tenant-http.mjs
```
Execute o comando somente **depois** de configurar as seis variáveis de ambiente localmente num ambiente autorizado. O script não cria contas nem configura tenants.

## Ainda não homologado
- HTTP com duas sessões reais emitidas pelo GoTrue (depende de identidades de teste);
- fluxos de MFA enrolment e elevação AAL2 em sessão de Super Admin real;
- testes de INSERT/UPDATE/DELETE com contas reais (a ferramenta fornecida faz apenas leitura);
- navegação completa por navegador/móvel e Storage com token de login.

Não houve migração SQL nesta etapa e não foram alterados pagamentos. Checkout Mercado Pago permanece desabilitado.
