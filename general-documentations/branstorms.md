# Brainstorm

Backlog de ideias e ajustes do produto, agrupado por tipo.
Legenda de escopo: `[Global]` `[Médico]` `[Chat]` `[Autoavaliação]` `[Admin]` `[Gestor]`

---

## 1. Novas features

### 1.1 Engajamento e retenção

- **`[Chat]` Registrar mensagem digitada mas não enviada**
  Pensar em como salvar a informação de que o usuário começou a escrever algo no chat mas não
  enviou, para que os gestores consigam entender se usuários iniciam uma conversa e desistem.
  - Precisa da mesma extensão dos termos de consentimento feita pro questionário (ver
    **5. Concluído**) — a linha de opt-in agregado ainda só menciona "questionário iniciado e não
    concluído", não rascunho de chat.

### 1.2 Acessibilidade e personalização

- **`[Global]` Customização de fontes e cores pelo usuário** — *parcial*
  O sistema precisa ser configurável a ponto de o usuário conseguir customizar as fontes e cores
  dentro da aplicação.
  - **Já existe** (`AppearanceSettings`): tema claro/escuro/sistema, cor de destaque (4 acentos
    curados) e cantos. **Falta**: controle de tamanho de fonte — nenhum existe hoje.
  - Inicialmente a aplicação foi criada visando a persona de um médico jovem, então isso não era
    um problema.
  - Precisamos expandir e tornar o aplicativo mais acessível para um range maior de usuários.
  - Para isso vamos criar uma persona de um médico com mais idade, na faixa dos 45 a 60 anos.
    Esse usuário pode precisar de fontes maiores e cores mais contrastantes.
  - Num primeiro momento, apenas cores e fontes customizáveis parecem suficientes. A navegação
    atual me parece suficiente.
  - Ver pendências abertas em **4. Pendências e decisões em aberto**.

- **`[Global]` Suporte a múltiplos idiomas (ES / EN / PT)**

### 1.3 Fluxos e funcionalidades

- Tela do Gestor poderia ter ordem dos items de menu customizaveis?

### 1.4 Segurança e identidade

- **`[Global]` Autenticação anônima do médico**
  Pensar se existe uma forma de autenticar o usuário mantendo o anonimato — por exemplo usando o
  device hash (que já temos) somado a uma senha, ou validação por chave. A cada acesso, o médico
  anônimo passaria por login / senha / confirmação de chave enviada para o celular, para confirmar
  a identidade de forma anônima. "Confirmar identidade" aqui significa garantir que o médico está
  acessando o app por um dispositivo autorizado.

---

## 2. Ajustes no que já existe

*Nenhum ajuste pendente no momento — os dois últimos (paginação do histórico de análises e theme
toggle nas telas de login/admin) estão em **5. Concluído**.*

---

## 3. Bugs

*Nenhum bug aberto no momento.*

---

## 4. Pendências e decisões em aberto

- **`[Global]` Onde ficará o botão de customização de fontes/cores** nas páginas "Home" e "Você".
- **`[Global]` Validar a faixa etária da nova persona** (45–60 anos) — confirmar se faz sentido ou
  se precisamos ajustá-la.

---

## 5. Concluído

- [x] **`[Chat]`** Transformar em conteúdo colapsável a seção com botão que redireciona para um chat
  real ou para as páginas de checking.
- [x] **`[Gestor]`** Repensar a localização do botão de acesso à administração do sistema — saiu da
  navegação principal do médico anônimo e passou a viver na tela de Configurações, agrupado com o
  acesso de par voluntário sob "Sou gestor ou par voluntário".
- [x] **`[Global]`** Atualizar os termos de consentimento para cobrir o salvamento de interações.
  A linha 2 (o único item opt-in, controlado por checkbox) passou de "meus sinais" para "meus
  sinais e interações (como um questionário iniciado e não concluído)" — mesma lógica de
  agregado/anônimo de sempre, só ampliando o que ela cobre. Atualizado nos dois lugares onde o
  texto existe: `ConsentPage` (aceite inicial) e `AggregateOptInSection` na página "Você" (onde o
  médico revisa/muda o opt-in depois). Ainda não cobre rascunho de chat não enviado — só a metade
  do item 1.1 sobre o questionário foi construída (ver abaixo); o rascunho de chat é feature
  separada, ainda pendente.
- [x] **`[Médico]` `[Gestor]`** Modal de confirmação ao abandonar o questionário. `useBlocker` do
  React Router bloqueia a navegação dentro do app assim que o médico responde à 1ª pergunta;
  confirmar a saída dispara um registro fire-and-forget (mesmo gate de vínculo de
  instituição/setor + opt-in agregado que o check-in de conclusão já usa), reaproveitando a tabela
  `Signal` existente — nova coluna `abandoned`, com a mesma supressão por k-anonimato de
  `checkIns` (nunca decide visibilidade sozinha). Gestor vê o agregado da instituição num KPI novo
  no dashboard e uma linha nova no export do PGR. Ver
  `docs/superpowers/specs/2026-09-09-assessment-abandonment-design.md` e
  `docs/superpowers/plans/2026-09-09-assessment-abandonment.md`.
  - **Fecha o "IMPORTANTE!!!"** do item original: os relatórios do gestor já mostram quantos
    médicos abandonaram o questionário.
  - **Achado da revisão final, descartado:** a revisão apontou um possível bug — o `useBlocker`
    quebraria sob o `basename` do deploy no GitHub Pages, registrando abandono falso logo após um
    envio bem-sucedido. Investigado contra o código-fonte instalado do react-router: o hook já
    remove o basename antes de chamar o predicado, então o bug não existe. Ficou um teste de
    regressão provando isso pros dois deploys.
  - Não cobre a segunda metade do item 1.1 (rascunho de chat não enviado) — segue pendente, como
    feature separada.

### Feito em 2026-09-08

- [x] **`[Admin]`** Máscara/validação de e-mail. Validador compartilhado
  (`presentation/lib/validate-email.ts`, via `z.string().email()`) aplicado nos 7 campos de e-mail
  do sistema: login do admin/gestor/par, criação de instituição, criação de gestor, criação e
  edição de par. Erro inline no `onBlur` + submit bloqueado enquanto inválido.
- [x] **`[Admin]`** "Sair" redireciona para a Home, não mais para o login do admin.
- [x] **`[Gestor]`** "Sair" redireciona para a Home do usuário comum — corrigido na sidebar
  (desktop) e no menu "Mais" (mobile).
- [x] **`[Gestor]`** Filtro de setor não dispara mais uma requisição por clique: a seleção é
  debounced (300ms) e o painel mantém o último resultado na tela durante o refetch
  (`keepPreviousData`), sem piscar skeleton.
  - **Ressalva registrada:** a ideia original ("o frontend já tem tudo, filtra local") não é
    aplicável como escrita. O backend não devolve uma lista pronta — ele recalcula a agregação
    para o subconjunto pedido (semana de referência, supressão por k-anonimato, somas só dos
    setores visíveis). Filtrar no cliente exigiria duplicar essa lógica no frontend **ou** mandar
    os números brutos por setor — inclusive dos setores abaixo de k=5, que a supressão existe
    justamente para esconder. Por isso a agregação continua no servidor.
- [x] **`[Global]`** PWA: ícone real do Zelo como favicon, ícone de app (manifest/apple-touch) e
  botão "Adicionar à tela inicial" nas Configurações — prompt nativo no Chromium, instruções
  passo a passo no iOS e no Android, e nada exibido onde não há caminho de instalação.
- [x] **`[Chat]`** Opção de reiniciar a conversa com a IA — botão "Nova conversa" no topo (só
  aparece com transcrição não vazia), atrás de confirmação, já que a conversa só existe em
  memória e não tem como desfazer depois de apagada.
- [x] **`[Médico]`** Vincular instituição via leitor de QR Code — escanear com a câmera preenche e
  busca a instituição automaticamente; nada exibido em navegador/aparelho sem câmera.
  - **Bônus**: o admin agora também gera e baixa o QR Code de cada instituição (não estava
    pedido no item original, que só falava do lado do leitor).
- [x] **`[Admin]`** Editar e desativar instituições — nome editável, código de convite permanece
  imutável (já distribuído em QR Codes/links). Desativar bloqueia login de gestores e pares e o
  lookup do médico pelo código, e derruba sessões de gestor já abertas na hora.
  - **Ressalva registrada:** o item pedia "excluir", mas a exclusão de verdade foi trocada por
    desativação reversível — a instituição tem gestores, setores, pares e histórico de check-in
    vinculados, e um `delete` de verdade ou apaga tudo isso ou fica bloqueado assim que a
    instituição estiver em uso de verdade. Decisão tomada em conjunto durante o brainstorm da
    feature, não uma dedução unilateral.
- [x] **`[Gestor]`** Paginar "Histórico de análises" — paginação por keyset (`generatedAt desc, id
  desc`, mesmo padrão do módulo de notificações) no backend, botão "Carregar mais" no frontend
  (tabela desktop e lista de cards mobile). A busca por texto continua local, sobre o que já foi
  carregado.
- [x] **`[Admin]`** Theme toggle nas telas de login (admin, gestor, par anônimo) e no painel do
  admin. Como essas 4 páginas já desenham seu próprio título/subtítulo no corpo, o toggle foi
  colocado direto na página em vez de cadastrar a rota em `app-header-meta` — isso duplicaria o
  cabeçalho e, no admin, mostraria o `PrivacyBadge` de médico anônimo indevidamente.
  - **Escopo ampliado:** o item original só citava as duas telas do admin; o mesmo problema
    (nenhuma tela de login pré-autenticação tinha o toggle) existia também no login do gestor e do
    par anônimo, então as três foram corrigidas juntas — decisão consultada e aprovada, não
    unilateral.
- [x] **`[Admin]`** Paginação da tabela de instituições cadastradas — mesmo padrão keyset
  (`createdAt desc, id desc`) usado no histórico de análises e nas notificações, botão "Carregar
  mais". Fecha o item de busca em tabela que já estava listado como *parcial* só por faltar isso.
- [x] **`[Global]`** Hotkeys — Phase 2: replicado o padrão (`useHotkey` + tecla escolhida à mão) na
  navegação do gestor e do par anônimo, nas três páginas de admin do gestor (gestores/setores/
  pares), no dashboard, notificações e histórico de insights do gestor, e na inbox do par anônimo
  (Aceitar/Recusar). Fecha o "falta" que restava do item de Hotkeys — ver
  `docs/superpowers/plans/2026-09-08-hotkeys-phase-2.md`.
- [x] **`[Médico]` `[Admin]` `[Gestor]`** QR code já vinculado a um setor. `Sector` ganhou um
  `inviteCode` próprio (escolhido à mão pelo gestor, único, imutável como o da instituição); o
  lookup por código (`GET /institutions/by-code/:code`) passou a resolver também códigos de setor;
  e o fluxo de vínculo do médico ganhou um passo de confirmação (institution+sector) quando o
  código escaneado já resolve os dois, pulando a escolha manual de setor. Gestor gera o QR de cada
  setor em `ManagerAdminSectorsPage`; admin vê e gera o mesmo QR expandindo a linha da instituição
  em `AdminInstitutionsPage` (`DataTable` ganhou expand/collapse por linha, reutilizável). Ver
  `docs/superpowers/specs/2026-09-08-sector-scoped-qr-design.md` e
  `docs/superpowers/plans/2026-09-08-sector-scoped-qr.md`.
  - **Correção sobre o spec original:** a visão de setores do admin usa um endpoint próprio,
    autenticado por admin (`GET /admin/institutions/:id/sectors`), em vez de reaproveitar o
    endpoint público de lookup por código usado no fluxo do médico — esse é anônimo por design e
    nunca pode devolver invite codes para quem não está autenticado.
  - **Ressalva de segurança fechada em revisão:** o guard de conflito de invite code (setor vs.
    instituição) tinha duas lacunas cross-table — corrigidas antes do merge.

### Já estava implementado (verificado em 2026-09-08, doc estava desatualizado)

- [x] **`[Global]`** Modal explicativo de criptografia na pill "anônimo" — a `PrivacyBadge` só
  renderiza pelo `AppHeader`, e lá ela já abre o `EncryptionInfoModal` em toda tela do médico.
- [x] **`[Gestor]`** Filtro de setor por checkbox — hoje já são pills (`SectorPillPicker`) no
  desktop e `MultiSelectDropdown` no mobile; não há mais checkbox.
- [x] **`[Gestor]`** Altura do card "Tendência geral" igual à de "Sinais por setor" — ambos já
  esticam na mesma linha do grid com `h-full`.
- [x] **`[Gestor]`** Tooltip com informações detalhadas nos itens do gráfico de Tendências — cada
  barra já abre um `TrendWeekBubble` com semana, percentual, nº de respostas e variação.
- [x] **`[Autoavaliação]`** Theme toggle — a rota já tem título em `app-header-meta`, então o
  `AppHeader` (com o `ThemeSwitchButton`) renderiza normalmente.
- [x] **`[Gestor]`** Segmentação de gestor por setor (verificado em 2026-09-08) — já existe de
  ponta a ponta: `ManagerRole` (`HOSPITAL_ADMIN` vs `SECTOR_MANAGER`) no schema, `Sector.managerId`
  atribuível a um ou mais setores, e o acesso é de fato restringido no backend (`GET
  /manager/sectors` e `/manager/signals` resolvem os setores acessíveis do papel antes de
  responder; notificações de setor vão só para o gestor daquele setor + admins do hospital). A UI
  de criação/edição de gestor (`ManagerAdminManagersPage`) já expõe os dois papéis com a cópia
  "Gestor de setor — Vê apenas os setores atribuídos" vs. "Gestor do hospital — Vê os indicadores
  de todos os setores", e exige ao menos um setor selecionado para `SECTOR_MANAGER`.
  - **Ressalva registrada:** geração de insight por IA e o histórico de insights continuam
    institution-wide para os dois papéis — decisão de produto já documentada no código
    (`generate-manager-insight.use-case.ts`), não uma lacuna. Se quisermos também escopar isso por
    setor para `SECTOR_MANAGER`, é um ajuste pequeno e contido (reusar a resolução de setores
    acessíveis nesse use-case e no histórico).

---

## Fast notes

*Nenhuma nota pendente — as duas anteriores (redirect do "Sair" do gestor e tooltip do gráfico de
Tendências) estão em **5. Concluído**.*

---

# New - no taged yet
- Numa reuniao recente surgiu a possibilidade de implementar a Zelo Health para alunos de medicina, pois
nos foi relatado que a saude mental tambem dessa camada é sensivel, e o grande ganho é dar para os gestores
  - **Análise em 2026-09-08:** duas personas exploratórias geradas por analogia às já validadas —
    `documentacao-produto/persona-diretor-escola-medicina.md` (coordenador/diretor, comprador
    institucional) e `documentacao-produto/persona-aluno-medicina.md` (aluno, usuário final).
    Confiança **Proto** nas duas — nenhuma entrevista real feita, o sinal desta nota é de segunda
    mão e o texto original nem termina a frase. Principais tensões levantadas para validar antes de
    qualquer decisão de investimento: (1) o coordenador tem papel duplo — cuida e também avalia
    academicamente o mesmo aluno, tensão mais forte que a do gestor hospitalar com o médico; (2) o
    "par anônimo" de turma convive por anos, o que pode tornar o anonimato mais frágil (risco de
    reconhecimento) ou mais fácil de confiar — não resolvido; (3) não está claro se o NAE/apoio
    psicológico da instituição veria a ferramenta como aliado ou concorrência. Próximo passo: não
    investir engenharia/roadmap ainda — buscar 3-5 conversas reais (coordenação + alunos) antes de
    qualquer decisão maior.
