# Revisão de organização — L&A Royal SaaS
Data: 12/11/2026

## Escopo examinado
- Árvore do repositório (207 entradas), organização de `app/`, `assets/`, `store/`, `supabase/`, `tests/` e workflows.
- Roteamento público da loja e experiência específica de barbearia.
- Painéis `Configurações` e `Minha Loja`; persistência do tema, paletas e gradientes.
- Testes de onboarding, lojas públicas, editor de barbearia e configurações.
- Documentos das etapas anteriores, inclusive modelos que ainda não possuem experiência pública completa.

## Correções desta revisão
1. Atualizados testes que ainda exigiam a troca do modelo pelo painel (recurso removido após constatar que não alterava a experiência completa).
2. Atualizado teste que exigia `&view=catalogo` para barbearia, contrariando a decisão de uma única interface pública.
3. Corrigido salvamento do editor de barbearia para ler o `design_settings` mais recente e preservar `themeGradients` e quaisquer configurações não gerenciadas pelo editor de barbearia.
4. Removido o título fixo “L&A Royal Store” da vitrine genérica: o cabeçalho agora usa o tipo da própria empresa e o nome do tenant.
5. Adicionados teste `saas-ui-consistency.test.mjs` e workflow dedicado de CI.
6. Expandido o `README.md` com arquitetura, contratos de rotas, modelos e comandos de teste.

## Situação funcional verificada no código
| Área | Observação |
| --- | --- |
| Modelo da empresa | Definido no onboarding; painel de troca de modelo removido |
| Layout padrão no editor | Seletor ineficaz removido |
| Link público | `store/?slug=<slug>` resolve o modelo pela loja publicada |
| Barbearia | Experiência em `store/barbearia.html`, sem botão do catálogo legado para o cliente |
| Gradientes | Opções globais por tenant no tema; “Nossa assinatura.” possui controle independente |
| Editor específico | Salva sem descartar configurações globais do tema |
| Vitrine genérica | Exibe nome/tipo da empresa; catálogo público |
| Loja virtual | Ainda não é cópia funcional completa do `index.html` original; checkout pendente |
| Pedidos Instagram | Layout completo e integração transacional de pedidos ainda pendentes |
| Comunicação empresarial | Portal privado completo inspirado no modelo de origem ainda pendente |

## Riscos e limitações remanescentes
- **Sem teste de produção neste relatório:** confirmar deploy e fazer testes reais em desktop, notebook e celular.
- **Fluxos de negócio:** finalizar por modelo as APIs, permissões, UX e testes de cada `index.html` de referência; não copiar configurações privadas/credenciais.
- **Concorrência de edição:** o editor relê as configurações antes do update, mas duas sessões salvando simultaneamente ainda exigiriam estratégia transacional/versionada para impedir perda de atualização.
- **Pagamentos e agendamentos:** precisam de testes end-to-end reais e validação no servidor; a aparência não garante a segurança operacional.
- **Documentação histórica:** arquivos anteriores descrevem opções já retiradas; consultar este documento e o README para o comportamento atual. Os relatórios históricos permanecem para rastreabilidade.
- **Migrações SQL:** não modificadas por esta revisão.

## Sequência recomendada
1. Confirmar que as verificações CI do pull request estão verdes.
2. Conferir a página publicada usando um tenant de testes, sem simular pagamentos reais.
3. Finalizar separadamente o modelo de loja virtual, depois pedidos Instagram e comunicação empresarial; cada interface deve reutilizar a estrutura de referência com backend por tenant.
4. Validar controle de acesso e RLS, agendamento, publicação e restauração dos dados para cada modelo antes de anunciar conclusão de produção.
