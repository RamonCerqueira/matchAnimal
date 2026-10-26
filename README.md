# MatchAnimal

Plataforma brasileira para aproximar tutores e seus animais, com foco em conexões responsáveis.

## Stack

- Web: Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui e Lucide.
- API: NestJS, TypeScript, JWT de acesso com refresh token opaco rotativo, e Socket.IO.
- Dados: PostgreSQL e Prisma ORM.
- Formulários e validação: React Hook Form e Zod.

## Estrutura

```text
apps/
  web/  # aplicação Next.js e componentes de interface
  api/  # API NestJS, módulos e schema Prisma
```

## Começar

Requer Node.js 22.13+, pnpm e PostgreSQL. Copie `apps/api/.env.example` para `apps/api/.env` e substitua usuário, senha, host e banco pelos dados da sua instância PostgreSQL. Configure também `JWT_ACCESS_SECRET` e `WEB_ORIGIN`; instale as dependências na raiz com `pnpm install`, gere o Prisma Client com `pnpm run db:generate` e inicie os apps com `pnpm dev`.

A aplicação já inclui uma base web e API para cadastro, perfis, descoberta por cidade, interesses, matches, candidaturas e conversas. Para executar em um banco vazio, aplique as migrations na ordem com `pnpm run db:migrate`; configure `DATABASE_URL`, `JWT_ACCESS_SECRET`, `WEB_ORIGIN` e, opcionalmente, `SUPER_MATCH_DAILY_LIMIT` na API. Para compartilhar sockets entre instâncias, configure também `REDIS_URL`.

## Etapas 1 e 2

- `apps/web`: páginas de cadastro e login, área do tutor, cadastro/visualização de animais, Explorar, estados de matches/mensagens/comunidade e documentos provisórios de privacidade/segurança.
- `apps/api`: cadastro/login com cookies HttpOnly, renovação de sessão, perfis de animais, candidatura de adoção, interesse mútuo e serviço de compatibilidade explicável.
- `apps/api/prisma/schema.prisma`: contas/tutores, pets/fotos, sessões, curtidas, matches/conversas, adoção, bloqueios, denúncias e publicações moderadas.

Os perfis de demonstração da tela Explorar são identificados como exemplos e não gravam interações reais. Defina `NEXT_PUBLIC_API_URL` em `apps/web/.env`. Os textos de privacidade e termos continuam como rascunhos e precisam de revisão antes do lançamento.

## Etapa 3 — Interações e comunicação

- MatchScore determinístico e explicável, sem pontuação de reprodução; revisão humana e verificações de saúde continuam obrigatórias.
- Explorar exclui perfis já avaliados; passar e curtir persistem no banco. Super Match tem limite diário configurável (padrão: 3).
- Match recíproco e criação do chat ocorrem em transação serializável; animais do mesmo tutor, perfis bloqueados, indisponíveis e adoção são rejeitados como match.
- Matches podem ser desfeitos, o que revoga acesso ao chat sem apagar mensagens. Bloqueio e denúncia são persistidos.
- Chat possui histórico REST paginado e Socket.IO autenticado, com comandos de join/send/typing/read/delivered, acknowledgements com `requestId`, mensagens persistidas antes da confirmação, deduplicação por ID do cliente, recibos e expiração da digitação.
- Notificações internas persistidas têm contagem, leitura individual e leitura em lote, respeitando a preferência de notificação para interesses e matches.

### API adicionada nesta etapa

- `POST /api/pets/:petId/pass`, `POST /api/pets/:petId/interest`, `POST /api/pets/:petId/super-match`
- `GET /api/pets/explore`, `GET /api/pets/matches`, `POST /api/pets/matches/:matchId/unmatch`
- `GET /api/chat/conversations`, `GET|POST /api/chat/conversations/:threadId/messages`, `POST /api/chat/conversations/:threadId/read`
- Socket.IO namespace `/realtime` (WebSocket): comandos `chat:join`, `chat:leave`, `chat:send`, `chat:typing`, `chat:read`, `chat:delivered` e `notification:read`. Todos recebem `requestId` e respondem `SocketAck`. Os contratos estão em `packages/shared`.
- O Redis Adapter é ativado quando `REDIS_URL` está configurado. Sem Redis, o adaptador padrão funciona em uma instância; a presença também é local por processo.
- `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`
- `POST /api/safety/users/:userId/block`, `POST /api/safety/pets/:petId/block`, `POST /api/safety/reports`

### Pendências desta etapa

- Upload/validação de imagens no chat ainda não está conectado a um serviço de armazenamento.
- A descoberta usa cidade/região ampla (searchCell); Leaflet, raio em quilômetros e posição geográfica aproximada ainda não estão conectados ao backend.
- A migration inicial é para um banco PostgreSQL vazio. Bancos existentes sem histórico Prisma precisam ser baselineados antes de aplicar migrations, sem recriar tabelas.

## Etapa 4 — MatchAnimal Social

A comunidade agora tem feed conectado ao banco, publicações com fotos/vídeos, filtros de feed, hashtags, curtidas, salvamentos, comentários/respostas, denúncias, seguidores com solicitação para perfis privados, Momentos com expiração lógica em 24 horas, grupos públicos/privados e eventos com mapa Leaflet/OpenStreetMap. Os eventos Socket.IO compactos são emitidos depois das alterações REST persistirem e são direcionados a salas individuais; publicações de grupos privados são enviadas somente aos membros aprovados.

### API social

- `GET /api/community/feed?mode=for-you|following|nearby&cursor=&q=` e `GET /api/community/posts/:postId`
- `POST /api/community/media`, `GET /api/community/media/:ownerId/:fileName`
- `POST|PATCH|DELETE /api/community/posts`, `POST /api/community/posts/:postId/like|save`, `GET|POST /api/community/posts/:postId/comments`
- `PATCH|DELETE /api/community/comments/:commentId`, `POST /api/community/comments/:commentId/like`
- `POST /api/community/pets/:petId/follow`, `GET /api/community/following`, `GET /api/community/follow-requests`, `PATCH /api/community/follow-requests/:id`, `GET /api/community/pets/:petId/followers|social`
- `GET|POST /api/community/stories`, `POST /api/community/stories/:id/view`
- `GET|POST /api/community/groups`, `POST /api/community/groups/:id/join`, `DELETE /api/community/groups/:id/membership`, `GET|POST /api/community/groups/:id/posts`
- `GET|POST /api/community/events`, `POST /api/community/events/:id/attend`, `DELETE /api/community/events/:id/attendance`
- Socket.IO `/realtime`: `feed:post:created`, `feed:post:updated`, `feed:post:deleted`, `feed:reaction:updated`, `feed:comment:created`, `feed:comment:deleted`, `social:follow:updated`, `story:created`, `event:updated`, `group:post:created`.

### Limites da entrega

- A migração `20261014200000_social_community` é aditiva e deve ser aplicada depois das migrations existentes; não foi executada contra um banco neste ambiente.
- Uploads atualmente usam disco local (`MEDIA_STORAGE_DIR`, padrão `storage` relativo ao diretório de execução da API). Ainda faltam armazenamento de objetos, otimização/redimensionamento, miniaturas e job de remoção física de arquivos/stories expirados.
- A aba “Para você” ainda usa ordenação recente com filtros de visibilidade; recomendações com diversidade, popularidade contextual e cache precisam de uma fase própria. Busca e proximidade usam texto/cidade, não coordenadas de distância.
- Grupos têm criação, entrada, saída e publicação; ferramentas de administração/moderação de membros e conteúdo, conversas nos comentários, compartilhamento interno e painel administrativo social ainda não foram implementados. Eventos não incluem fluxo de convite privado ou edição/cancelamento do organizador.
- Stories expiram e deixam de aparecer após 24 horas; a retenção física ainda depende de limpeza agendada. O visualizador não tem autoplay, barra de progresso nem pausa por pressão.
- Os endpoints seguem concentrados no `CommunityModule`; a separação em módulos menores, documentação Swagger e testes automatizados dedicados continua pendente.
- Typecheck e build da API e export/build estático do frontend passaram após a integração Capacitor. Testes automatizados dedicados continuam pendentes.

## Aplicativo móvel — Capacitor

O monorepo inclui Capacitor 8 para empacotar o frontend Next.js como app nativo Android/iOS. O site usa exportação estática em `apps/web/out`, que o Capacitor copia para os projetos nativos. As rotas com IDs dinâmicos usam páginas fixas com parâmetros (`/grupos/detalhe?id=...`, `/pet/perfil?petId=...`, `/comunidade/publicacao?postId=...`) para funcionar em bundle estático; os dados continuam vindo da API NestJS.

- Dependências: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` e `@capacitor/ios` v8.
- Configuração: `capacitor.config.ts`, appId provisório `com.matchanimal.app` e `webDir` `apps/web/out`.
- `pnpm run cap:add:android` / `pnpm run cap:add:ios`: criar a plataforma uma vez.
- `pnpm run cap:sync`: exportar o frontend e sincronizar assets/plugins nativos.
- `pnpm run cap:run:android` / `pnpm run cap:run:ios`: compilar e executar em dispositivo/emulador.
- Para live reload no dispositivo, defina `CAPACITOR_DEV_SERVER_URL` com o endereço LAN do computador. A API também deve estar acessível no dispositivo; `localhost` passa a apontar para o próprio telefone/emulador. Em Android Emulator, normalmente o host usa `10.0.2.2`; em aparelho físico, use o IP LAN do computador. Inclua a origem do servidor web em `WEB_ORIGIN`.
- Para release, remova `CAPACITOR_DEV_SERVER_URL`, configure `NEXT_PUBLIC_API_URL` com a URL HTTPS pública da API e configure `WEB_ORIGIN` com os domínios/origens do app. Cookies nativos usam `SameSite=None; Secure` nas origens Capacitor. No iOS, inclua o domínio real da API em `WKAppBoundDomains` se necessário para cookies do WebView.
- O identificador `com.matchanimal.app` é provisório; confirme o bundle ID de publicação antes de distribuir. Android requer Android Studio/SDK; iOS requer macOS com Xcode.

Capacitor v8 documenta o fluxo de instalar Core/CLI, configurar o `webDir`, adicionar plataformas e executar `cap sync`; o Next.js export estático gera a pasta `out`, mas não inclui recursos que dependem do servidor Next em runtime. Referências: [instalação do Capacitor](https://capacitorjs.com/docs/getting-started), [workflow](https://capacitorjs.com/docs/basics/workflow), [export estático do Next.js](https://nextjs.org/docs/app/guides/single-page-applications#static-export-optional).

## Cadastro e galeria de fotos dos animais

- O cadastro de pet agora é progressivo: informações básicas, fotos, personalidade/objetivo e publicação. Os campos do formulário são salvos como rascunho local no navegador.
- Não há campo para colar URL de foto. O tutor pode selecionar várias imagens, usar a câmera do celular quando disponível, arrastar arquivos no desktop, pré-visualizar, escolher a capa, reordenar e remover antes de publicar.
- As imagens são redimensionadas no dispositivo para WebP antes do envio. O envio mostra progresso real e pode ser repetido após uma falha.
- Em `Meus animais`, cada perfil tem controles para adicionar, reordenar, remover e trocar as fotos. O perfil público apresenta a galeria.
- A API associa as imagens a `PetPhoto`, tabela existente, e valida propriedade, formato, assinatura e tamanho. Não foi necessária migration Prisma.
- O backend ainda grava os arquivos no disco local compartilhado com a comunidade. Isso serve para desenvolvimento; antes de escalar ou publicar múltiplas instâncias, configure armazenamento persistente de objetos, ajuste `API_PUBLIC_URL` e planeje a migração dos arquivos.
- A aprovação atual segue o comportamento já usado pelo feed comunitário: imagens válidas ficam visíveis conforme o tutor controla a visibilidade do perfil. O sistema tem denúncia, mas ainda não possui moderação automática por conteúdo nem uma fila administrativa de revisão de fotos.

## Funcionalidades de conta, adoção, localização e operação

- `/configuracoes` agora carrega os dados da conta, permite alterar nome, região aproximada, visibilidade social do tutor e preferência de notificações. A mudança de região sincroniza cidade, estado e coordenadas aproximadas dos animais ativos.
- Em `Meus animais`, cada perfil pode ser tornado público/privado sem apagar dados; os perfis concluídos em adoção deixam de ser públicos, mas continuam no espaço privado do tutor.
- O cadastro permite buscar uma cidade/endereço explicitamente, escolher um ponto no mapa ou solicitar GPS. O sistema guarda coordenadas arredondadas a duas casas decimais e exibe apenas cidade/UF e faixas de distância arredondadas. A busca é uma ação explícita, não autocomplete. O geocodificador é configurável por `GEOCODER_BASE_URL`; o padrão de desenvolvimento usa Nominatim, com atribuição visível, cache local e no máximo uma consulta por segundo por instância da API. Para produção com tráfego maior, use um provedor próprio/comercial ou instância gerenciada e mantenha a camada configurável.
- A descoberta aceita raio de 10, 25, 50, 100 ou 200 km. Quando não há coordenadas, mantém a compatibilidade antiga por cidade. As distâncias retornadas são aproximadas em blocos de 5 km.
- `/adocoes` lista candidaturas enviadas e recebidas. O tutor pode aprovar ou encerrar candidaturas; ao aprovar, o animal deixa de aparecer como disponível e as demais candidaturas abertas são encerradas. O candidato pode retirar uma candidatura ainda aberta.
- A recuperação de senha usa tokens aleatórios armazenados somente como hash, com expiração de 45 minutos, uso único e revogação das sessões existentes. Em desenvolvimento, o link aparece no log da API. Em produção, configure `PASSWORD_RESET_WEBHOOK_URL` e opcionalmente `PASSWORD_RESET_WEBHOOK_SECRET` para encaminhar `{ to, resetUrl, expiresInMinutes }` ao provedor de e-mail.
- Organizadores podem editar e cancelar eventos. Cancelamentos são registrados sem apagar o histórico.
- `/administracao` oferece triagem de denúncias e remoção de publicações, comentários ou perfis de animais. O acesso à API exige IDs explícitos em `ADMIN_USER_IDS`; a interface não concede privilégios.
- Migrações novas: `20261016100000_approximate_tutor_location`, `20261016110000_password_reset_tokens` e `20261016120000_event_cancellation`.

### Integrações ainda necessárias para lançamento

- Mídia continua armazenada em disco local; configure um serviço de objetos persistente antes de operar múltiplas instâncias ou publicar em produção.
- O fluxo de recuperação está implementado, mas o envio real de e-mail depende do webhook/provedor configurado.
- A moderação administrativa trata denúncias reportadas; não é uma análise automática de mídia, nem substitui a equipe humana. Relatos sobre mensagens e contas podem ser arquivados/analisados, mas a remoção automática desses alvos ainda não existe.
- Stories são removidos do banco após expirar e a rotina de hora em hora apaga arquivos locais órfãos. A limpeza precisa ser adaptada caso a mídia migre para storage de objetos.
- Convites para eventos privados, moderação avançada de grupos/membros, mensagens com anexos e recomendações do feed com diversidade/cache ainda precisam de uma etapa própria.
- A configuração da conta não inclui troca de senha enquanto autenticado, exclusão/portabilidade LGPD nem configurações de perfil individual avançadas. Os documentos legais seguem como rascunhos.
