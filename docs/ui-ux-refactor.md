# MatchAnimal — refatoração de UI/UX e validação

Inspeção inicial em 17/10/2026. Correção da identificação administrativa e validação complementar em 19/10/2026.

## Resultado e diagnóstico

O inventário de rotas e contratos foi registrado antes da implementação em [ui-ux-inventory.md](./ui-ux-inventory.md). A base continha controles com fontes de 7–11 px, áreas de toque pequenas, estilos sucessivos conflitantes, ações sem destino correto e falhas de API exibidas como vazio ou carregamento permanente.

As correções centralizam a escala visual e os componentes compartilhados, melhoram leitura e toque, preservam Next/React/Tailwind/Nest/Prisma/Socket.IO/Capacitor e corrigem fluxos reais. Não houve migração de banco, mudança de senha, publicação ou transação financeira.

## Fundação visual

- Tokens em `apps/web/app/styles/product-system.css`: coral acessível, verde petróleo, creme e sálvia; contraste, bordas, tipografia, espaçamento, estados, transições e camadas.
- Removidas as camadas repetidas de overrides sociais de `globals.css`; regras da experiência ficam nos três estilos de produto, formulários e áreas sociais.
- `ui/button.tsx` passa a renderizar classes semânticas reais; variantes têm cores e contraste definidos.
- `ui/dialog.tsx` e `lib/use-dialog-accessibility.ts`: portal, Escape, contenção e restauração do foco, bloqueio de rolagem e nomes acessíveis.
- Navegação com ícones pet, estados ativos, busca da comunidade, mensagens, notificações e link para pular ao conteúdo.
- Fontes com fallback do sistema sem dependência obrigatória de requisição ao Google Fonts.
- Exportação estática permanece ativa para o fluxo Capacitor.

## Arquivos e correções

| Arquivos | Alteração |
| --- | --- |
| `app/globals.css`, `app/layout.tsx`, `app/styles/product-system.css` | Fundação visual, responsividade, importação de estilos e remoção de overrides conflitantes. |
| `app/styles/forms-refinement.css`, `app/styles/social-refinement.css` | Formulários e demais telas com escala legível, estados, grids, tabelas e controles de toque. |
| `components/ui/button.tsx`, `components/ui/dialog.tsx`, `lib/use-dialog-accessibility.ts` | Primitivas reutilizáveis, cores reais do CTA e diálogos acessíveis. |
| `components/app-shell.tsx` | Sessão com erro e tentativa novamente, contexto compartilhado, consultas independentes, busca e mensagens, navegação responsiva e falha de logout visível. |
| `components/social-home.tsx` | Dados reais, consulta duplicada reduzida, erro distinto de vazio, pet ativo, sugestões, feed e agenda; criação de publicação envia ao editor existente. |
| `components/explore-feed.tsx` | Topo simplificado, preferências por ícone, quatro direções por arraste e teclado, feedback visual, acesso a perfis, compatibilidade mantida, estados de API e de foto indisponível. Ações foram aproximadas da foto no mobile. |
| `components/landing-page.tsx`, `components/site-header.tsx` | CTA funcional no card ilustrativo, transparência sobre exemplos, ícones Lucide, links e menu com Escape. |
| `components/auth-form.tsx`, `components/password-recovery-form.tsx`, `app/recuperar-senha/page.tsx` | Tipagem, limites dos DTOs, erros associados, consentimento, senha e recuperação com parâmetros compatíveis com exportação estática. |
| `components/pet-form.tsx` | Etapas com foco e validação, rascunho, Enter sem criação antecipada, limite e preparação de fotos, progresso e confirmação. |
| `components/pet-photos-manager.tsx`, `components/pet-photo-editor.tsx`, `lib/pet-media.ts` | Seleção, câmera, substituição, ordenação, remoção, recorte real, zoom e posição, otimização e progresso. |
| `components/location-picker.tsx`, `components/location-picker-map.tsx` | IDs únicos, busca/GPS com feedback, mapa sob demanda sem remontagem e localização aproximada. |
| `components/community-feed.tsx`, `components/shared-post.tsx`, `app/comunidade/page.tsx`, `app/comunidade/explorar/page.tsx` | Busca e editor por deep link, limites de mídia, feedback de ações, previews com limpeza, histórias por chave, erro e tentativa novamente. |
| `components/chat-inbox.tsx` | Conversas com carregamento próprio, rascunhos e tentativas isoladas, proteção contra resposta de outra conversa e falhas visíveis. |
| `components/matches-view.tsx`, `components/notifications-center.tsx` | Erro distinto de vazio, destinos de conversa/perfil, notificações FOLLOW e fallback para tipos futuros. |
| `components/settings-view.tsx`, `components/public-pet-profile.tsx`, `components/product-views.tsx` | Erros de carregamento, controles reais, identificação administrativa e remoção do dashboard antigo sem consumidores. |
| `components/community-directory.tsx`, `components/adoption-center.tsx`, `components/admin-panel.tsx`, `components/moderation-panel.tsx` | Layouts, carregamento, feedback, formulários, ações concorrentes e leitura de tabelas/listas. |
| `app/pet/perfil/page.tsx`, `app/grupos/detalhe/page.tsx`, `app/comunidade/publicacao/page.tsx` | Parâmetros com Suspense e retorno útil quando não há entidade informada. |
| `components/trust-document.tsx`, `app/seguranca/page.tsx` | Conteúdo de privacidade alinhado ao upload e à moderação reativa existente, além de escala legível. |
| `next.config.ts`, `eslint.config.mjs` | Indicador de desenvolvimento não obstrui a navbar; configuração de lint sem aviso de export anônimo. |
| `apps/api/src/pets/pets.controller.ts` | Rota estática de candidaturas registrada antes de `:petId`, preservando o contrato. |
| `apps/api/src/auth/admin-access.ts`, `auth.controller.ts`, `safety/safety.service.ts` | Regra única da allowlist administrativa. Overview informa `isAdministrator` sem expor e-mail; `isModerator` permanece compatível. |
| `scripts/*integrity.test.mjs`, `scripts/admin-access.test.mjs`, `scripts/browser-smoke.mjs`, `scripts/ui-interactions.mjs` | Verificações de regressão e evidências locais, sem gravar credenciais. |

## Identificação de administrador

O tipo cadastral (tutor/organização/protetor/profissional) estava sendo usado como rótulo de acesso. O backend já concedia acesso administrativo pela configuração do servidor. A lista agora exibe **Administrador** para as contas reconhecidas pela mesma regra, inclui filtro de administradores e mostra a permissão nas configurações. As credenciais e as permissões existentes foram preservadas.

## Verificação executada

| Verificação | Resultado |
| --- | --- |
| Lint completo do frontend | Passou sem erros; avisos de imagens nativas permanecem em previews/fotos dinâmicas. |
| Lint dos componentes administrativos e configurações após a correção de 19/10 | Passou sem erros. |
| Typecheck web e API | Passou. |
| Build completo e builds complementares web/API | Passaram; web exportou as rotas estáticas. |
| `node --test scripts/admin-access.test.mjs scripts/ui-integrity.test.mjs scripts/api-route-integrity.test.mjs` | 10 testes passaram. Inclui allowlist exata, normalização, rejeição de acesso indevido, rotas, imports, detalhes e relações estáticas de acessibilidade. |
| Navegador: 24 rotas × 8 larguras | 192 verificações de layout. Sem rolagem horizontal do documento na rodada final. Relatório em `docs/qa/final/`. |
| Navegador: conta administrativa real | Identificação na API, selo, filtro e configurações passaram. O overview não expõe e-mail. |
| Navegador: outras seis interações | Passaram: contraste AA do CTA, diálogo/foco/Escape, preferências e quatro swipes, etapas e recorte local, foco no editor, erro de rede e notificações FOLLOW/desconhecidas. |
| Mídia com APIs simuladas | Passaram as verificações de formato/tamanho, otimização, coordenadas/clamp, progresso, credenciais e respostas inválidas. |
| Lint da API | Não executou: o comando existente não encontra o executável ESLint no pacote. Typecheck e build da API passaram. |

As larguras usadas foram 320, 375, 430, 768, 1024, 1280, 1440 e 1920 px. Os scripts de navegador bloqueiam gravações e Socket.IO para não publicar, enviar mensagens ou alterar recibos durante a inspeção. Os testes de erro e tipos desconhecidos usam respostas simuladas apenas no contexto isolado de QA.

## Evidências e limites

- [Resultado de interações](./qa/interactions/report.json) e [administrador corrigido](./qa/interactions/admin-role-1440.png).
- [Relatório de layouts](./qa/final/summary.md), com screenshots mobile e desktop.
- [Editor de recorte](./qa/interactions/crop-375.png); o arquivo da imagem é uma fixture sintética local.
- Fotos externas ilustrativas retornaram `ERR_NETWORK_ACCESS_DENIED` neste ambiente. Os relatórios registram o erro; a validação não aprova a disponibilidade desses provedores. A descoberta possui fallback visual.
- Câmera/GPS físicos Android/iOS, push, envio real de fotos, publicação, pagamentos, candidatura e troca real de mensagens não foram executados. Compilação web não substitui teste nativo.
- Não havia entidades suficientes na conta usada para aprovar todos os detalhes de publicações/grupos/perfis reais; navegação e estados sem entidade foram revisados.
- Alguns fluxos de confirmação/denúncia ainda usam diálogos nativos do navegador, funcionais. Carregamentos auxiliares de momentos/pets da comunidade ainda têm oportunidades de feedback mais específico.
- O diretório não está registrado como repositório Git nesta sessão; não houve commit ou deploy.

Não há alegação de certificação WCAG ou aprovação ponta a ponta de fluxos não executados.
