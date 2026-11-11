# Etapa #64 — Estruturas originais por empresa

Solicitação do proprietário: quando uma empresa do L&A Royal SaaS é publicada, o link principal deve abrir a **experiência do modelo original fornecido**, e não uma vitrine genérica com um único card.

## Barbearia — entregue nesta etapa

Fonte: arquivo `index (1)(1).html` fornecido pelo proprietário, equivalente ao `index.html` do repositório [Adriano-Paulo-Barbearia](https://github.com/equipezero-web/Adriano-Paulo-Barbearia), SHA `3520d808a2566239faf5597d338cbd3bd5865e5e`.

O arquivo `store/barbearia.html` reutiliza as **regras visuais originais e a estrutura da área do cliente**, incluindo sidebar, hero, Início, Agendamentos, Barbearia, Planos e Perfil, e a sequência visual de quatro etapas para agendar. A estrutura foi adaptada ao SaaS: as referências fixas à Adriano Paulo foram substituídas por dados de `saas_public_stores`; a cor da barbearia vem do tema público; os serviços, duração, preços e profissionais são consultados pelo tenant correto.

`store/?slug=<empresa>` redireciona automaticamente para `store/barbearia.html?slug=<empresa>` **somente** se a empresa estiver publicada, acessível e tiver `template_code='barbershop'`. A visualização antiga de catálogo genérico continua disponível apenas como opção `&view=catalogo`. Uma empresa não publicada nunca é roteada para um serviço operacional.

### Seguranças preservadas

- Não executamos `config.js`, scripts de `Adriano-Paulo-Barbearia`, bancos locais, Supabase externo, `localStorage`, logins ou credenciais da origem.
- O client usa somente os RPCs públicos já verificados no SaaS: `saas_barber_public_setup`, `saas_barber_available_slots`, `saas_barber_request_booking`. O backend recalcula preço e duração, verifica o tenant, bloqueia sobreposição e só grava solicitação pendente.
- Login, 2FA, dados de CPF, CRM, painel administrativo e recepção originais **não** são expostos na loja pública; a operação administrativa permanece em `app/agenda.html`. Isso evita associar visitantes a contas de proprietários por engano.
- O visitante só vê um código de solicitação nesta sessão; não há endpoint público de histórico ou consulta de clientes sem verificação.
- O botão de solicitação exige nome, telefone e consentimento; não afirma confirmação automática.

### Limites de funcionalidade

A nova página preserva o **layout do cliente**, mas **não substitui** a implementação de autenticação de clientes, histórico persistente, planos de barbearia e fotos do ambiente: estas funções ainda requerem modelos de dados e verificação próprios no SaaS. Seus espaços de navegação exibem o estado real, sem números, planos ou sessões inventadas. A futura área de recepção ficará em página separada com papel `reception` restrito.

### Aplicação do mesmo padrão aos outros três tipos

| Modelo | Fonte do proprietário | Página de cliente futura | Estado atual |
|---|---|---|---|
| `barbershop` | `index (1)(1).html` / Adriano Paulo | `store/barbearia.html` | Layout original da área pública integrado a agendamentos reais |
| `virtual_store` | `index (2).html` / L&A Royal Advisory | Página completa de e-commerce por tenant | Catálogo público atual; migrar carrinho, estoque, contas e checkout seguro |
| `instagram_orders` | `index (3).html` / FlowBoost | Página completa de pacotes e pedidos por tenant | Catálogo atual; migrar pacotes, pedidos e validações pelo servidor |
| `business_communication` | `index (4).html` / L&A Advisory Team | Portal protegido por identidade e tenant | Acesso público restrito; migrar CRM, mensagens, projetos e finanças para painel privado |

Não se devem copiar `index.html` integrais desses repositórios e publicar scripts com URLs, contas, chaves ou cobranças do projeto original. A estratégia é **reutilizar o visual e componentes**, substituindo as operações por interfaces seguras do SaaS. Novos modelos só devem ser redirecionados para experiências completas quando seus fluxos estiverem conectados e testados.

## Teste manual

1. Vá à loja da Lapis Servidor: `https://equipezero-web.github.io/Sistema-L-A-/store/?slug=lapis-servidor`.
2. Após a publicação do GitHub Pages, veja o layout com sidebar e hero do índice original, incluindo as cinco seções da área do cliente.
3. Clique `Corte`, escolha dia e um horário disponível, e clique `Solicitar horário`. Preencha o próprio nome/telefone apenas se desejar criar um pedido real de homologação.
4. Em `app/agenda.html`, o gestor aprova ou recusa o pedido. Não clique em **Concluir** sem um atendimento real, pois a operação gera entrada financeira quando aplicável.
5. Compare em `store/?slug=lapis-servidor&view=catalogo` a antiga grade genérica que deixou de ser a experiência principal.

Nenhum cadastro, pagamento ou assinatura é alterado pelo PR #64.
