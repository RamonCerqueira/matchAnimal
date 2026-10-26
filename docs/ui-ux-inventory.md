# MatchAnimal — inventário e diagnóstico inicial de UI/UX

Data: 17/10/2026. Levantamento anterior à refatoração. Inspeção do código e HTTP, sem alterar dados, contas, contratos ou banco.

## Ambiente e limites desta inspeção

- Repositório: monorepo com `apps/web`, `apps/api`, `packages/shared`, Android e iOS Capacitor.
- `apps/web/AGENTS.md` exige consultar a documentação instalada de Next antes de editar código. Não foi encontrada outra instrução AGENTS no inventário.
- Frontend: Next 16, React 19, TypeScript, Tailwind 4, Lucide, Radix Slot/CVA, React Hook Form/Zod, Leaflet, Socket.IO client.
- Backend: Nest 11, Prisma/PostgreSQL, autenticação por cookies/JWT e refresh, validação DTO, throttling, Socket.IO e adaptador Redis opcional.
- Build web usa `output: "export"` e `trailingSlash: true`, relevante para hospedagem estática e Capacitor. Parâmetros de perfil/publicação/grupo são consultados no cliente.
- `http://localhost:3000/`: HTTP 200. `http://localhost:4000/api/health`: HTTP 200. Health não comprova acesso ao banco nem funcionamento dos fluxos autenticados.
- Não foram lidos arquivos `.env` ou expostas credenciais. Não foram feitos login, cadastros, uploads, mensagens ou mutações.
- Inspeção visual real fica a cargo do agente principal, evitando concorrência pela mesma sessão do navegador.

## Mapa completo de rotas (24 páginas)

| Rota | Componente principal | Acesso e dados |
| --- | --- | --- |
| `/` | `LandingPage`, `SiteHeader` | Pública, apresentação e pets editoriais/demonstrativos |
| `/entrar` | `AuthForm` login | Pública; POST de autenticação real |
| `/cadastro` | `AuthForm` signup, `LocationPicker` | Pública; cadastro real, consentimento, cidade/GPS/mapa |
| `/recuperar-senha?token=` | `PasswordRecoveryForm` | Pública; solicitação/conclusão reais pela API |
| `/dashboard` | `AppShell`, `SocialHome`, recomendações | Sessão; conta, animais, matches, conversas, avisos, eventos e sugestões reais |
| `/explorar?pet=` | `AppShell`, `ExploreFeed` | Sessão; animais reais após selecionar animal próprio; prévia explícita demonstrativa antes disso |
| `/pet/perfil?petId=` | `PublicPetProfile` | Sessão; pet, fotos e resumo social reais |
| `/animais` | `MyPetsView`, `PetPhotosManager` | Sessão; galeria/visibilidade reais |
| `/animais/novo` | `PetForm` | Sessão; cadastro em etapas, upload real e rascunho local |
| `/matches` | `MatchesView` | Sessão; matches reais, desfazer e conversa |
| `/mensagens?conversa=` | `ChatInbox` | Sessão; histórico real, Socket.IO e segurança |
| `/comunidade` | `CommunityFeed` | Sessão; feed, stories, composer, mídias e ações reais |
| `/comunidade/explorar` | `CommunityFeed` | Sessão; renderiza o mesmo componente/default do feed atual |
| `/comunidade/publicacao?postId=` | `SharedPost` | Sessão; detalhe real; sem parâmetro não compõe publicação |
| `/grupos` | `CommunityDirectory(kind=groups)` | Sessão; listagem, criação e participação reais |
| `/grupos/detalhe?id=` | `GroupTimeline` | Sessão; publicações reais do grupo |
| `/eventos` | `CommunityDirectory(kind=events)`, `EventMap` | Sessão; criar/editar/cancelar evento, presença e mapa reais |
| `/adocoes` | `AdoptionCenter` | Sessão; candidaturas enviadas/recebidas e decisões reais |
| `/notificacoes` | `NotificationsCenter` | Sessão; listagem e leitura reais |
| `/configuracoes` | `SettingsView`, `LocationPicker` | Sessão; perfil, região, privacidade e avisos reais |
| `/administracao` | `AdminPanel`, `ModerationPanel` | Sessão + autorização de moderação no servidor; métricas e moderação reais; cobrança é preparação |
| `/termos` | `TrustDocument` | Pública; documento estático |
| `/privacidade` | `TrustDocument` | Pública; documento estático |
| `/seguranca` | Página institucional de segurança | Pública; texto estático com trechos desatualizados sobre controles já presentes |

## Fundação e componentes compartilhados

- `app/layout.tsx`: idioma pt-BR, metadados e folha global. Não há provider central de sessão/dados no estado inicial.
- `AppShell`: verifica `/auth/me`, tenta refresh em 401 e só então monta filhos; topo, navegação desktop e inferior móvel; logout e acesso administrativo condicionado a `isModerator`.
- Navegação principal: Início, Explorar, Conexões, Comunidade, Perfil. Rotas filhas de chat/perfil/comunidade/animais recebem equivalência no estado ativo. Eventos, grupos, adoções e notificações dependem de atalhos contextuais.
- `Button`: Radix Slot/CVA, variantes utilitárias com cores literais; maioria das demais ações usa botão HTML próprio.
- `PetFriends`: SVG local animado de animais, usado em boas-vindas e vazios; não depende de rede.
- `LocationPicker`/`LocationPickerMap`: busca/reverse na API, GPS web ou Capacitor, arredondamento de coordenadas; mapa importado dinamicamente sem SSR.
- `preparePetPhoto`/`uploadPetPhotos`: WebP até 1800px no cliente, limite de 20 MB por origem, envio multipart e progresso XHR; galeria até seis fotos.
- `native-feedback`: integração haptic com Capacitor.
- `TrustDocument`, `SiteHeader`, `EventMap`, `SharedPost`: serviços visuais e páginas de apoio.
- `DashboardView` e `SimpleEmptyView` continuam exportados em `product-views.tsx`, mas páginas atuais usam `SocialHome` e telas reais próprias. Evitar tomar componentes antigos como fonte atual.

## Contratos de API que a refatoração deve preservar

Base de chamadas pública configurável: `NEXT_PUBLIC_API_URL`, fallback local `http://localhost:4000`; rotas REST sob `/api`; fetch autenticado usa `credentials: "include"`. Contratos levantados por controllers e consumidores, sem executar mutações.

| Domínio | Contratos usados / disponíveis |
| --- | --- |
| Auth | POST register/login/refresh/logout; GET/PATCH `auth/me`; POST password-reset/request e password-reset/complete |
| Tutor | `auth/me` retorna id/email/type/isModerator e tutor com displayName/city/state/latitude/longitude/isPublic/notificationOptIn. PATCH retorna tutor atualizado e propaga região aos pets ativos no backend |
| Animais | POST pets; GET pets/mine, pets/explore, pets/:id; PATCH :id/photos e :id/visibility |
| Descoberta | GET explore com viewerPetId/radiusKm/limit; resposta inclui região aproximada, coverPhotoUrl e compatibilidade; POST :id/pass, :id/interest, :id/super-match com fromPetId |
| Matches | GET pets/matches; POST pets/matches/:id/unmatch; retorno inclui pets e thread |
| Adoção | POST pets/:id/adoption-applications; GET pets/adoption-applications; PATCH :applicationId e POST :applicationId/withdraw |
| Chat | GET chat/conversations e :threadId/messages (before/limit), POST mensagens e leitura |
| Notificações | GET notifications e unread-count; PATCH :id/read e read-all |
| Feed | GET community/feed (mode/cursor/limit/q); GET/POST/PATCH/DELETE posts; like/save; comentários e curtidas de comentários |
| Social | follow de pets; following/follow-requests/followers/social; decisão de pedidos; stories, criação, view e remoção |
| Comunidade | grupos, participação, posts; eventos, presença, edição e cancelamento |
| Mídia | POST community/media multipart e GET community/media/:ownerId/:fileName, atualmente autenticados |
| Localização | GET location/search e location/reverse; ponte para geocodificação OpenStreetMap |
| Segurança | POST reports e bloqueio de user/pet; GET admin/overview/reports; PATCH decisão de denúncia e moderação de conteúdo |

Socket.IO sob namespace `/realtime`, cookies e transporte websocket. Eventos de entrada incluem `chat:join`, `chat:leave`, `chat:send`, `chat:typing`, `chat:read`, `chat:delivered`, `notification:read`. Frontend consome `chat:message`, receipts, typing, `match:created` e eventos `feed:post:*`. Preservar requestId, conversationId, acknowledgements, reconexão e autorização dos canais. Tipos de eventos compartilhados em `packages/shared`.

## Estados e comportamento observados

- Estado por componente com `useState`, `useEffect` e callbacks; sem biblioteca de cache/deduplicação. Fetches diretos e tipos locais repetidos.
- Sessão: loading antes de montar filhos e refresh inicial. Indisponibilidade de API redireciona ao login; não há recuperação inline da sessão no estado inicial.
- Home: loading, sem pet, com pet, recomendações carregando/vazias; falhas de carga são normalizadas para null/vazio, sem aviso de erro.
- Explorar: demonstração explicitamente rotulada, filtros, vazio, avisos, ações ocupadas, candidatura e celebração de match. Falha ao buscar pode manter prévia. Swipe esquerdo/direito/cima/baixo já existe e deve ser preservado.
- Formulários auth/pet: React Hook Form/Zod, erros e submit; demais formulários usam validação HTML e DTO. Rascunho do pet no localStorage.
- Chat: listagem, seleção, histórico paginado, envio com chave de retry, typing, recebimento/leitura, bloqueio/denúncia. Ainda exige validação visual móvel e de teclado.
- Community: feed paginado, upload/preview, stories, comentários, ações otimistas; alguns erros de follow/comentário são capturados silenciosamente. Denúncias usam prompt nativo.
- Configurações: inicialização e sucesso/erro no submit; erro inicial fica invisível por retorno prematuro de loading.
- Matches: erro inicial fica invisível quando lista está vazia porque retorno de vazio precede renderização de erro.
- Fotos: preview, preparação, upload/progresso, remover/reordenar e erros/sucesso presentes.
- Admin: loading/erro e filtros; Stripe é informação de configuração e checklist, sem checkout/webhook implementado. Não aparentar pagamento ativo.

## Responsividade e acessibilidade inicial

- CSS global concentra landing, auth, shell, produto e admin, com muitas sobreposições acumuladas e valores literais. Alterações visuais locais podem ser anuladas pela especificidade/ordem.
- Breakpoints encontrados: 1160, 1100, 900, 760, 700, 560 e 390px; 700/760 coexistem para shell/nav e telas. Consolidar intencionalmente e conferir transições intermediárias.
- Suporte a `prefers-reduced-motion` existe em diferentes blocos; verificar novas animações e rolagens JS.
- Há `aria-label`, `aria-current`, roles de status/alert e dialogs sem biblioteca dedicada. Inspeção de código não demonstra trap de foco, retorno de foco ou Escape em diálogos; tratar como pendência de acesso por teclado.
- Elementos pequenos como fechar avisos, ícones no card e controles de foto exigem medição de área de toque.
- Imagens CSS background e imagens HTML coexistem; as galerias reais possuem alt. Backgrounds de foto podem manter ícone de patinha sobreposto por padrão.
- AppShell envolve inclusive administração com estilo social; preservar permissão administrativa enquanto delimita o escopo visual.

## Diagnóstico priorizado antes da implementação

| Severidade | Evidência / causa | Impacto e ação proposta |
| --- | --- | --- |
| P1 | `SocialHome` aponta "Compartilhar momento" para `/comunidade/publicacao` sem postId; essa página apenas renderiza detalhe | CTA termina em "Publicação não informada". Direcionar ao composer existente com fragmento/query e foco adequado |
| P1 | `SettingsView` retorna loading quando !account, mesmo após erro de GET | Falha de rede prende tela de configurações e esconde mensagem. Diferenciar loading/error e oferecer retry |
| P1 | `MatchesView` retorna vazio antes do bloco error | Falha real de carregamento é apresentada como ausência de matches. Expor erro e retry sem afirmar lista vazia |
| P1 | Home faz catch/null em todos os endpoints | Indisponibilidade pode parecer usuário sem animais e sugerir novo cadastro. Separar falha de dados e vazio confirmado |
| P1 | Explorar mantém prévia e captura falha de pets/explore silenciosamente | Usuário com conta pode interagir com demonstração após falha de dados; preservar rótulo e apresentar erro/retry, sem fallback silencioso sobre dados reais |
| P2 | AppShell + SocialHome repetem auth/me, matches, unread-count; chat/settings também repetem auth/me | Mais requisições, spinners e chance de resultados divergentes. Fonte compartilhada de sessão/contadores; preservar refresh e permissões |
| P2 | Cada página monta seu AppShell em vez de layout compartilhado | Navegação pode repetir bootstrap e loading. Avaliar provider/cache conservador compatível com export e Capacitor |
| P2 | Botão "Como calculamos" em ExploreAside não tem handler; corações da landing não têm handler | Controles aparentam ação sem resposta. Dar destino informativo real e CTA para cadastro/descoberta |
| P2 | Mini matches do ExploreAside são divs sem acesso ao perfil/conversa | Falta aprofundamento do perfil de interessado e acesso claro à conexão. Ligar a perfil real ou matches; manter distinção dos demos |
| P2 | Círculos de progresso de foto em explorar são três spans estáticos | Sugerem galeria interativa sem comportamento. Validar fotos reais ou converter em indicador honesto |
| P2 | `PublicPetProfile` e explorar mostram BadgeCheck incondicional | Pode sugerir verificação de saúde/identidade inexistente. Exibir somente verificação sustentada por dado ou trocar semântica |
| P2 | Navbar no móvel, muitos overrides e tokens fora de componentes | Histórico de baixo contraste e estilo inconsistente. Tokens semânticos, seletor confiável do Button e sistema único de superfícies |
| P2 | Modais de explorar/stories sem Escape/foco gerenciado no código inspecionado | Teclado/leitor de tela podem sair do contexto. Trap/retorno de foco, rolagem e fechamento acessível |
| P2 | Denúncia usa prompt/confirm em diferentes telas | Fluxo inconsistente e pobre em mobile; evoluir dialog sem alterar payload ou regras |
| P2 | Falhas de follow/comentários e clipboard são silenciosas | Ação pode não completar sem feedback; exibir erro e preservar rascunho |
| P2 | `/comunidade/explorar` usa mesmo componente e modo default | Rota não entrega distinção aparente. Alinhar destino/aba e estado ativo com finalidade |
| P3 | `DashboardView`/`SimpleEmptyView` legados e tipos duplicados | Manutenção confusa; não confundir com telas ativas, organizar quando seguro |
| P3 | `/seguranca` diz que controles de denúncia/bloqueio serão conectados | Conteúdo contradiz implementações atuais. Atualizar apenas para capacidade comprovada |
| P3 | Datas máximas/date-time e localização usam formatação local em vários lugares | Revisar timezone e estados por navegador antes de declarar fluxo verificado |

Severidade P1 = bloqueio/representação incorreta de fluxo ou estado; P2 = usabilidade/acessibilidade/performance relevante; P3 = consistência/manutenção. Não foi confirmado incidente P0 de dados ou segurança nesta inspeção.

## Infraestrutura de validação

- Scripts existentes: raiz `lint`, `typecheck`, `build`; web `eslint .`, `tsc --noEmit`, `next build`; api lint `eslint "src/**/*.ts"`, typecheck `tsc --noEmit`, build `nest build`.
- Raiz build/typecheck geram Prisma antes dos workspaces; gerar cliente não é migração. Não executar db:migrate sem necessidade da tarefa.
- Nenhum script `test`, arquivo de teste de aplicação ou configuração Playwright/Jest foi encontrado pelo inventário de arquivos, excluindo node_modules/dist/.next. A presença de `@nestjs/testing` não equivale a suíte configurada.
- O arquivo `.podspec` encontrado por busca textual é infraestrutura iOS, não teste de aplicação.
- CUA disponível para browser e screenshots; agente principal conduz inspeção visual. Os dois servidores já estão disponíveis, sem precisar iniciar instâncias concorrentes.
- Matriz recomendada de viewport: 390×844, 768×1024, 1440×1000; acrescentar 320px e 700/760px nas transições de nav e formulários. Não marcar como aprovado antes de executar.
- Fluxos a preservar na validação: público → cadastro/login → home; cadastro de pet/fotos; descoberta/filtros/gestos e perfil; match → chat; adoção candidatura; publicação → comentários/compartilhar; eventos/grupos; configurações/privacidade; admin autorizado/não autorizado.
- Falha de rede, API 401/403/500, vazio real e carregamento devem ser exercitados sem alterar produção. Dados demonstrativos devem continuar identificados e nunca substituir registros reais.

## Resultado deste levantamento

Inventário concluído antes da implementação. Não foram executados build, lint, typecheck ou testes nesta fase e não há declaração de aprovação funcional/visual baseada somente em inspeção de código. Resultados posteriores devem ser registrados separadamente com comandos e evidências reais.

## Auditoria complementar e primeira execução automatizada

Após entregar o inventário e antes das correções nos fluxos, foram identificados mais dois problemas P1:

- `NotificationsCenter` acessa `info[item.type].icon` com apenas cinco tipos conhecidos, mas `CommunityService` persiste notificações `FOLLOW`. Uma notificação de novo seguidor pode causar exceção na tela. A apresentação deve tratar FOLLOW e tipos futuros sem derrubar a listagem.
- Em `PetsController`, `@Get(":petId")` antecede `@Get("adoption-applications")`. O roteador Express pode resolver a listagem de candidaturas como um perfil de pet de id `adoption-applications`. A correção preserva o contrato e coloca a rota estática antes da dinâmica.

Foram criados testes de integridade read-only sem dependências adicionais:

- `node --test scripts/ui-integrity.test.mjs`: 5 testes, 4 aprovados e 1 falha inicial real no CTA `/comunidade/publicacao` sem `postId`. Verificam destinos locais, identificadores obrigatórios, fragmentos existentes, imports locais e relações de acessibilidade.
- `node --test scripts/api-route-integrity.test.mjs`: 1 teste, falha inicial real no sombreamento da rota GET de candidaturas por `:petId`.

Esses testes identificam regressões estruturais e não substituem a inspeção visual, os fluxos autenticados ou a avaliação de foco/contraste no navegador. Nenhuma conta/dado foi criado pelos scripts. Reexecutar após as correções e registrar os resultados finais.
