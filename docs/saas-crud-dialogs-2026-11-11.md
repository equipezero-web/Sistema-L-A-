# Etapa #59 — corrigir botões + Novo de Serviços, Clientes, Funcionários e Produtos

Data: 11/11/2026. Referência: empresa de homologação **Lapis Servidor**.

## Causa

Os scripts inline das páginas `app/servicos.html`, `app/clientes.html`, `app/funcionarios.html` e `app/produtos.html` referenciavam elementos via variáveis globais implícitas do navegador, por exemplo `name.value`, `status.textContent`, `close.onclick` e `form.reset()`. Variáveis como `window.name`, `window.status` e `window.close` são propriedades já existentes do browser; portanto o clique no botão **+ Novo** podia lançar exceções antes de abrir o `<dialog>`.

## Correção

- Referências a cada controle resolvidas por `document.getElementById` e usadas através de `ui`.
- Abertura, fechamento, campos, filtros, status, edição e salvamento agora não dependem de variáveis globais implícitas.
- Botões de salvar com `type=submit`; scripts de Produto e Serviço também têm fallback seguro caso `event.submitter` esteja ausente.
- Controles de clientes mantidos exclusivos para `ctx.canManage`; formulário de Funcionários não registra o botão de criação em um contexto sem função autorizada.
- Nenhuma migração ou alteração no esquema/RLS/assinatura/checkout.

## Testes automatizados

`tests/saas-crud-dialogs.test.mjs` executa os quatro scripts reais em `vm`, com browser globals simulados, e testa o botão **Novo**, os botões **Cancelar/X**, a submissão de cada formulário, recarga de listagem e feedback de erros. Testes de permissão anteriores também foram atualizados e preservados.

## Testes no banco (somente transacionais)

No Supabase `lthiztvnaxwrfyziypxd`, os scripts SQL em `BEGIN; ... SET LOCAL ROLE authenticated; ... ROLLBACK;` usaram as claims simuladas da identidade proprietária da Lapis Servidor para comprovar a autorização de inserção das quatro entidades.

| Entidade | Inserção validada na transação | Dados de teste persistidos |
|---|---|---|
| Cliente | Sim | Não |
| Funcionário | Sim | Não |
| Serviço | Sim | Não |
| Produto (RPC saas_create_product) | Sim | Não |

Esse teste comprova **permissões do Postgres** e fluxo estrutural dos formulários. Não substitui um teste HTTP real com o usuário autenticado no navegador.

## Verificação humana após a publicação GitHub Pages

1. Fazer login como proprietário na Lapis Servidor.
2. Acessar Serviços, Clientes, Funcionários e Produtos.
3. Clicar **+ Novo**, verificar a abertura do modal e o botão Cancelar.
4. Criar um único registro de exemplo em cada módulo, confirmar mensagem de sucesso e listagem.
5. Se for um item de catálogo, deixar **Publicar** desmarcado até estar pronto para liberar a vitrine.

Não foram adicionados registros reais ao banco por esta etapa.
