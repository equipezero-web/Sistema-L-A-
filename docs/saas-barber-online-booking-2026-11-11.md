# Etapa #62 — Agenda e solicitações de barbearias no L&A Royal SaaS
Data: 11/11/2026

## Referência de produto
O fluxo de escolha de serviço, data, horários e painel de recepção veio do projeto
[Adriano Paulo Barbearia](https://github.com/equipezero-web/Adriano-Paulo-Barbearia).
As rotinas locais e a função específica `ap-create-booking` **não foram copiadas**:
a integração usa exclusivamente o projeto Supabase do SaaS
`lthiztvnaxwrfyziypxd`, com `tenant_id` e controles RLS.

## Entregue

- **Vitrine pública:** ao entrar em uma barbearia publicada, o cliente vê
  **Solicitar horário online**, que abre
  `/store/reservar.html?slug=<slug-da-empresa>`.
- **Cliente:** serviço publicado, profissional ativo ou atendimento geral quando
  não existir funcionário, dia, horário livre, nome, telefone e autorização de
  contato. O servidor calcula duração e preço com base no serviço verdadeiro.
- **Fila protegida:** a solicitação fica `pending` em
  `public.saas_barber_requests`, expira após **24 horas** se não for atendida
  e retorna apenas um código de referência. O cliente vê
  **Solicitação recebida / aguardando confirmação**, não um falso agendamento.
- **Gestor:** na página `app/agenda.html`, o proprietário ou administrador
  vê nome, contato, serviço, profissional e horário e escolhe
  **Confirmar** ou **Recusar**. Somente ao confirmar nasce um
  `saas_appointments` de status `confirmed`.
- **Funcionamento:** horário inicial e final, fuso, dias abertos, passo dos
  horários (15, 30 ou 60 min) e ativação/desativação de pedidos online.
- **Agenda:** lista reservas confirmadas e solicitações aprovadas;
  conclusão usa o RPC financeiro existente; cancelamento libera o intervalo.

## Garantias

1. Todas as tabelas guardam e filtram `tenant_id`.
2. Apenas empresa ativa, concluída, publicada e com acesso comercial válido
   pode receber pedidos. A Lapis Servidor usa seu trial temporário existente.
3. Tabela de solicitações com RLS, acesso SELECT apenas a owner/admin,
   **sem acesso direto para `anon`**.
4. RPC público não aceita preço ou duração do cliente, valida serviço e
   profissional ativos e publicados, horário e limites básicos por telefone.
5. Lock transacional por empresa, verificação de sobreposição de períodos e
   proteção também de inclusões manuais de agendamento **somente em barbearias**.
6. O projeto original, outras empresas, Mercado Pago e assinaturas não são alterados.
7. Nomes/telefones não aparecem na vitrine pública nem na resposta da RPC.
8. As solicitações não são cadastradas automaticamente como clientes permanentes.

## Escopo e limitações honestas

- O pedido **não é automaticamente confirmado**: precisa da aprovação de
  proprietário/admin na Agenda. O cliente não recebe mensagem automática.
- Para produção em escala, faltam **Turnstile/captcha verificado no servidor**,
  rate limiting no gateway baseado em IP, confirmação de telefone/contato,
  notificações confiáveis, política de retenção/remoção de dados pessoais e
  fluxos completos de cancelamento pelo cliente. Os limites SQL atuais são
  mitigação básica, não proteção suficiente contra tráfego hostil.
- As janelas são de até 30 dias, com 30 minutos de antecedência mínima.
- O pedido pendente reserva temporariamente o slot por até 24 horas.
- A recepção com papéis próprios e os planos de barbearia ainda exigem etapas
  específicas; este PR disponibiliza a fila para proprietário/admin.

## Testes de integração

- `tests/saas-barber-booking.test.mjs` — DOM simulado, confirmação pendente,
  consentimento, mensagens de conflito, SQL e apresentação de barbearia.
- `tests/saas-public-store-loading.test.mjs` — regressão da vitrine.
- GitHub Actions: `SaaS Barber Online Booking`.
- No banco, uma transação `BEGIN/ROLLBACK` validou:
  - visita pública (`role anon`), consulta de horários e criação pendente;
  - segunda solicitação recusada no mesmo horário;
  - inserção administrativa conflitante bloqueada;
  - aprovação apenas por proprietário e transformação em agendamento;
  - cancelamento liberando o horário;
  - anônimo sem permissão SELECT nas solicitações;
  - nenhum registro fictício persistiu após o rollback.

## Teste manual após publicação

1. Abra `https://equipezero-web.github.io/Sistema-L-A-/store/?slug=lapis-servidor`.
2. Clique **Solicitar horário online** e selecione **Corte** e uma data de
   funcionamento, depois um horário. Como não havia funcionários cadastrados,
   deverá mostrar **Atendimento geral**.
3. Faça uma solicitação de teste **com seu próprio nome/telefone de teste**
   somente se aceitar criar esse registro no ambiente de homologação.
4. Faça login de proprietário e abra
   `https://equipezero-web.github.io/Sistema-L-A-/app/agenda.html`.
5. Confira a fila, clique **Confirmar** e depois veja o atendimento em Agenda.
6. Registre **Concluir** apenas para um atendimento realmente realizado, pois
   essa ação atualiza os indicadores financeiros da empresa.
7. Se ainda estiver vendo versão antiga, atualize com `Ctrl + F5`.
