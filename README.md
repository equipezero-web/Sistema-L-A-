# L&A Royal SaaS

Plataforma de gestão empresarial multitenant com painel privado, publicação por empresa e módulos específicos para cada segmento.

## Estrutura do projeto

| Diretório | Responsabilidade |
| --- | --- |
| `auth/`, `onboarding/`, `security/` | Login, cadastro empresarial e segurança da sessão |
| `app/` | Painel empresarial: agenda, vendas, clientes, funcionários, finanças, Minha Loja e configurações |
| `assets/js/` | Regras do painel, autenticação, integração Supabase e editor visual |
| `assets/css/` | Estilos compartilhados do painel |
| `store/` | Páginas públicas e experiência de clientes; acesso canônico em `store/?slug=<empresa>` |
| `super-admin/` | Administração da plataforma, separada da gestão de empresas |
| `supabase/sql/` | Migrações e funções SQL; aplicar somente com revisão do ambiente |
| `supabase/functions/` | Funções server-side para billing e inteligência |
| `tests/`, `.github/workflows/` | Testes automatizados e CI |
| `docs/` | Histórico de decisões técnicas, limitações e validações |

## Modelos de empresa

O modelo (`template_code`) é escolhido na criação da empresa. **Não há seletor de troca de modelo em Configurações nem seletor de layout sem implementação real no editor.** O link público usa o `slug` da empresa e a rota `store/index.html` identifica a experiência apropriada:

| Modelo | Situação do site público |
| --- | --- |
| `barbershop` | Redireciona para `store/barbearia.html`, com a interface de cliente e agendamento integrada |
| `virtual_store` | Catálogo público disponível; carrinho, checkout e pedidos de cliente ainda requerem integração específica |
| `instagram_orders` | Apresentação pública de pacotes; pedido transacional integrado ainda requer implementação |
| `business_communication` | Acesso público restrito; dados de CRM e mensagens não são expostos |
| `generic` | Catálogo geral público de produtos/serviços |

**Não copiar credenciais, logins, dados ou configurações de pagamento dos repositórios de referência.** Cada empresa deve ter dados e permissões isolados.

## Aparência e publicação

- `app/aparencia.html` reúne logo, fontes, cores sólidas, paletas e gradientes.
- `assets/js/appearance.js` salva tema por empresa em `saas_store_themes`.
- `assets/js/appearance-designer.js` gerencia opções específicas da barbearia sem apagar gradientes globais.
- `saas_public_stores` é a fonte da configuração **publicada**, distinta das configurações privadas.
- No modelo de barbearia, “Nossa assinatura.” pode ter cor ou gradiente próprio.
- Proprietários e administradores gerenciam o visual; clientes não têm acesso ao editor.

## Rotas de cliente e administração

- Site da empresa: `store/?slug=<slug>`
- Barbearia pública moderna: `store/barbearia.html?slug=<slug>`
- Edição da loja: `app/aparencia.html`
- Administração: `app/index.html`
- Configurações: `app/configuracoes.html`

A antiga `store/reservar.html` redireciona barbearias para o agendamento integrado; links públicos da empresa devem preferir a entrada canônica. Ocultar um controle não substitui a verificação de autorização pelo servidor.

## Validação

O projeto usa testes Node.js sem dependências npm obrigatórias para grande parte da suíte. A partir da raiz:

```sh
node --test tests/saas-ui-consistency.test.mjs
node --test tests/saas-settings-public-store.test.mjs tests/saas-business-templates.test.mjs tests/saas-original-barber-template.test.mjs tests/saas-barber-designer.test.mjs tests/saas-public-store-loading.test.mjs
```

As rotinas em `.github/workflows/` executam verificações em pull requests e alterações na `main`. Validar separadamente em produção a publicação, controle de acesso, agendamentos, pagamentos, responsividade e efeitos das migrações; testes de texto e sintaxe não substituem testes reais do navegador e do banco.

Para a revisão de 12/11/2026, consulte `docs/saas-revisao-organizacao-2026-11-12.md`.
