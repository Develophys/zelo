# Header compartilhado entre todas as telas

Data: 2026-08-25

## Problema

O `ChatHeader` de `/chat` é o único header fixo do app: uma barra com
borda inferior, botão voltar, título e subtítulo à esquerda, e ações à
direita. Toda outra tela monta à mão alguma variação disso *dentro* do
corpo rolável — `YouPage`, `PeersPage`, `AssessmentSelectPage`,
`AssessmentResultPage`, `CrisisAcceptPage`, `CrisisDeclinePage` e
`LinkStepShell` repetem a mesma linha com espaçamentos diferentes
(`pt-6`, `pt-6.5`, `pt-7`, `pt-7.5`), ordens diferentes de ações e
presenças diferentes do `ThemeSwitchButton`. O painel do gestor usa um
terceiro padrão, `ManagerPageHeader`, que é um bloco de conteúdo com um
eyebrow "Painel do gestor" repetido em cada página.

Resultado: o header rola para fora da tela em todo lugar menos no chat,
a cópia dos títulos está espalhada por 20 arquivos, e cada tela nova
recomeça a decisão do zero.

## Objetivo

Um único header, declarado uma vez por shell, alimentado por parâmetros
de rota. Da esquerda para a direita:

```text
┌─ sidebar ──┬─ AppHeader (sticky, border-b, md:min-h-app-header) ──────────┐
│  [Z] Zelo ‹│  ‹   Autoavaliação                     ◐    🔒 anônimo      │
│  ──────────│      Escolha uma escala validada.                           │
│  PAINEL DO │─────────────────────────────────────────────────────────────│
│  GESTOR    │                                                             │
```

- botão voltar (ausente na home do usuário e na home do painel);
- título e subtítulo empilhados num mesmo container, alinhados à esquerda;
- `ThemeSwitchButton` e a pill "anônimo" alinhados à direita, sendo que a
  pill abre o `EncryptionInfoModal`.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Escopo | Páginas de app; splash, privacy, consent, os 3 logins e os finish-setup ficam fora |
| Voltar no painel do gestor | `/manager` é a home do painel; em `/manager` o botão some |
| "Painel do gestor" | Sai do header de cada página, vai para a sidebar |
| Viewports | Todos; header sticky em qualquer largura |
| Voltar em telas de fluxo | O header assume o voltar do fluxo; a página deleta o seu |

## Arquitetura

### `AppHeader` — o componente

Novo: `apps/web/src/presentation/layout/AppHeader.tsx`.

Estrutura e classes espelham o `ChatHeader` atual, porque é a régua que
já existe: `border-b border-surface-brand bg-surface md:min-h-app-header`.
`--spacing-app-header` vale 65px e é o mesmo mínimo do bloco do logo em
`SidebarHeader`, o que faz as duas bordas inferiores se encontrarem.

Ordem interna:

1. `BackButton` icon-only (sem `label`), renderizado só quando há destino;
2. container `min-w-0` com `<h1>` (`font-sans text-body-strong text-ink`)
   e o subtítulo abaixo (`font-mono text-mono-data text-brand`, `truncate`);
3. `ml-auto` → `ThemeSwitchButton` e `PrivacyBadge`.

O `EncryptionInfoModal` vira estado interno do `AppHeader`. Como o header
é montado uma vez por shell, o modal deixa de ser duplicado nas páginas.

A largura interna acompanha a geometria do shell: barra sangrando de
ponta a ponta, conteúdo interno numa coluna centralizada
(`mx-auto w-full max-w-chat` no chat, `md:max-w-170` nas telas
`centered`, largura cheia no painel do gestor).

### `PrivacyBadge` ganha `onClick`

`apps/web/src/presentation/ui/PrivacyBadge.tsx` passa a aceitar
`onClick?: () => void`. Com handler renderiza um `<button>` com
`aria-label="Saiba mais sobre a criptografia AES-256"`; sem handler segue
`<span>`, então as chamadas inline existentes (`HomeGreeting`) não mudam
de comportamento.

### Parâmetros por rota — `handle`

Cada rota no escopo declara em `apps/web/src/app/router.tsx`:

```ts
{
  path: "assessment",
  Component: AssessmentSelectPage,
  handle: {
    header: {
      title: "Autoavaliação",
      subtitle: "Escolha uma escala validada. Leva cerca de 5 minutos.",
      back: routes.home,
    },
  },
}
```

`back` aceita três formas:

- **ausente** — sem botão voltar (`/home`, `/manager`);
- **uma rota** — `routes.home` na maioria, `routes.crisis` nas duas
  ramificações de crise, `routes.manager` no painel;
- **`'flow'`** — a página registra o handler (ver abaixo).

`AppHeader` lê o handle com `useMatches()`, pegando o match mais
profundo que tenha `header`. **Rota sem `handle.header` não renderiza
header nenhum** — é o opt-in automático que mantém splash, privacy,
consent e as telas de login exatamente como estão hoje, sem flag extra.

### Escape hatch para conteúdo dinâmico

Três casos precisam de título, subtítulo ou voltar que a tabela estática
não consegue exprimir:

| Caso | O que é dinâmico |
|---|---|
| `/home` | Título é a saudação por horário (`getGreeting`) |
| `/peers` | Subtítulo muda conforme o usuário está ou não vinculado a um hospital |
| `/you/link` | Título, subtítulo e voltar mudam por passo (código → setor) |
| `/assessment/phq9`, `/assessment/gad7` | Voltar é "pergunta anterior", não uma rota |

Um contexto provido pelos shells expõe:

```ts
useHeaderOverride({ title?, subtitle?, onBack? })
```

A página chama o hook com as dependências que a fazem mudar; o
`AppHeader` mescla o override sobre o handle da rota. É o único caminho
para conteúdo dinâmico — nada de props de header nas páginas.

### Montagem — uma vez por shell

**`PhoneShell`** renderiza `<AppHeader />` acima do `<main>`:

- `flex-none` quando `fill` está ligado (o chat depende disso: o `main`
  dele tem scroll interno e o header não pode participar dele);
- `sticky top-0 z-30` no caso geral, em que o scroll é do documento.

**`ManagerShell`** passa a ter a coluna da direita como
`flex min-h-dvh min-w-0 flex-1 flex-col`, com `<AppHeader />` sticky no
topo e o `<main>` abaixo. O header fica fora do `px-6` do `main` para
sangrar até a borda.

Os wrappers `pt-6` / `pt-6.5` / `pt-7` / `pt-7.5` que cada página aplica
hoje somem; o padding superior do conteúdo passa a ser único, definido
no `main` de cada shell.

### Tabela de rotas do escopo

| Rota | Título | Subtítulo | Voltar |
|---|---|---|---|
| `/home` | saudação (override) | Bom te ver por aqui | — |
| `/chat` | Acolhimento | anonimizado antes do envio | home |
| `/assessment` | Autoavaliação | Escolha uma escala validada. Leva cerca de 5 minutos. | home |
| `/assessment/phq9` | PHQ-9 | Humor e sinais de depressão | `flow` |
| `/assessment/gad7` | GAD-7 | Ansiedade | `flow` |
| `/assessment/result` | Resultado | Um sinal, não um diagnóstico. | home |
| `/crisis` | Você não está sozinho(a). | — | home |
| `/crisis/connect` | Vamos te direcionar | — | `/crisis` |
| `/crisis/line` | Tudo bem. A escolha é sua. | — | `/crisis` |
| `/peers` | Pares anônimos | por estado de vínculo (override) | home |
| `/you` | Você | Seu consentimento e sua privacidade. | home |
| `/you/link` | por passo (override) | por passo (override) | `flow` |
| `/manager` | Tendências | Indicadores agregados e anônimos do seu hospital. | — |
| `/manager/notifications` | Notificações | Alertas do sistema sobre sinais agregados, convites e integrações. | `/manager` |
| `/manager/history` | Análises com IA | Histórico das análises geradas a partir dos indicadores agregados. | `/manager` |
| `/manager/settings` | Configurações | Preferências de aparência do painel. | `/manager` |
| `/manager/admin/managers` | Gestores | Quem tem acesso ao painel e a quais setores. | `/manager` |
| `/manager/admin/sectors` | Setores | Áreas do hospital acompanhadas pelo Zelo. | `/manager` |
| `/manager/admin/peers` | Pares anônimos | Profissionais disponíveis para acolhimento entre pares. | `/manager` |

### Subtítulos do painel: primeira frase no header, resto no corpo

Os `intro` do `ManagerPageHeader` têm até ~160 caracteres e hoje quebram
em duas ou três linhas dentro de um `max-w-[62ch]`. Numa barra de 65px
com título em cima, só cabe uma linha.

Regra: **o subtítulo é a primeira frase do intro atual** (nenhuma cópia
nova é inventada), truncada com `title` no elemento para o texto
completo ficar acessível no hover. A frase restante é descartada, exceto
onde enuncia uma regra que o gestor precisa conhecer — nesses dois casos
ela vira uma linha `text-label text-muted` no corpo, logo abaixo da
`ManagerActionBar`:

- `/manager`: "Nenhum dado individual é exibido; segmentos com menos de 5
  respostas ficam ocultos."
- `/manager/admin/peers`: "A identidade de quem procura acolhimento nunca
  é revelada."

As demais frases restantes são explicativas e redundantes com a própria
tela ("Cadastre um gestor antes de vinculá-lo a um setor.", "Marque como
lida para tirar da lista.", "Cada linha pode ser expandida...", "Elas
valem só para você, neste dispositivo...", "Cada setor pode ter um
gestor responsável.") e saem.

### Crise: o h1 migra, o corpo mantém o resto

Nas três telas de crise a frase-declaração já é o `<h1>`. Ela passa a ser
o título do header; o corpo mantém o `IconBadge` e o parágrafo de apoio
sem heading duplicado. Nenhuma cópia nova.

### "Painel do gestor" na sidebar

O rótulo vai **abaixo** do bloco do logo, não dentro dele: o bloco tem
`md:min-h-app-header` e uma linha extra o faria passar de 65px, quebrando
o alinhamento com a borda do header. Ele vira a primeira linha da área de
nav em `ManagerSidebar`, com `font-mono text-eyebrow uppercase text-muted`,
e `sr-only` quando a sidebar está recolhida — mesmo tratamento que o
`MANAGER_ADMIN_GROUP_LABEL` logo abaixo já recebe.

## O que é removido

| Removido | De onde |
|---|---|
| `ChatHeader.tsx` | deletado (`AnonymityNote` fica — `ChatEmptyState` usa) |
| `ManagerPageHeader.tsx` + `ManagerPageHeader.test.tsx` | deletados |
| Linha de `BackButton` / `PrivacyBadge` / `ThemeSwitchButton` + `<h1>` + subtítulo | You, Peers, AssessmentSelect, AssessmentResult, CrisisAccept, CrisisDecline, LinkStepShell, HomeGreeting |
| Só o `<h1>` (a tela não tem linha de ações) | CrisisOffer |
| `EncryptionInfoModal` local e o gatilho "tudo processado no seu aparelho" / "processado no seu aparelho" | AssessmentSelect, AssessmentResult (a pill do header cobre). `ConsentPage` mantém o dela — está fora do escopo |
| `actions={<PrivacyBadge />}` | ManagerDashboardPage |
| Wrappers `pt-6` / `pt-6.5` / `pt-7` / `pt-7.5` | todas as páginas do escopo |

`HomeGreeting.tsx` fica sem conteúdo próprio depois disso e é deletado;
a saudação vira o override de header da `HomePage`.

## Testes

### Novos

- `AppHeader.test.tsx` — renderiza título e subtítulo do handle; esconde
  o botão voltar quando não há destino; navega para o destino ao clicar;
  a pill abre o `EncryptionInfoModal`; o override de página vence o
  handle da rota.
- `app-header-handles.test.ts` — percorre `routeChildren` e afirma que
  toda rota do escopo tem `handle.header` com `title` não vazio, e que as
  rotas fora do escopo não têm. Guarda contra uma página nova nascer sem
  header.

### Migração — o custo escondido

`pages/a11y.test.tsx` e vários testes de página renderizam o componente
direto dentro de um `MemoryRouter`, sem a tabela de rotas. Com o header
vindo do handle, esses renders passariam a não ter header: os `<h1>`
sumiriam das asserções e o eixo a11y deixaria de cobrir o header.

Um helper compartilhado `renderRoute(path, options)` construído sobre
`routeChildren` — o mesmo truque que `app/router.test.tsx` já usa — passa
a ser o caminho de render desses testes. Ganho colateral: eles passam a
exercitar a tabela de rotas que realmente vai para produção.

Arquivos a migrar ou ajustar: `pages/a11y.test.tsx`,
`pages/ChatPage/ChatPage.test.tsx`,
`pages/ChatPage/ChatPage.transcript-crash.test.tsx`,
`pages/ScaleAssessmentPage.test.tsx`, `pages/YouPage/YouPage.test.tsx`,
`layout/PhoneShell.test.tsx`, `layout/ManagerShell.test.tsx`,
`ui/PrivacyBadge.test.tsx` (novo caso: variante `<button>`) e
`layout/ManagerNav.test.tsx` (o rótulo "Painel do gestor" passa a ser
asserção da sidebar, não mais do header de página).

### Verificação visual

Testes não pegam alinhamento. Antes de fechar: rodar o app e conferir,
em desktop, que a borda inferior do header encontra a borda inferior do
bloco do logo na sidebar, nos dois shells, com a sidebar expandida e
recolhida; e que o header do chat continua fixo enquanto a transcrição
rola por baixo.

## Riscos

- **Sticky dentro de flex.** `PhoneShell` sem `fill` tem
  `h-full min-h-dvh` na coluna e `flex-1 overflow-y-auto` no `main`.
  Conforme o conteúdo, o scroll pode ser do documento ou do `main`; o
  `sticky top-0` cobre o primeiro caso e o `flex-none` o segundo. Se
  algum shell ficar entre os dois, o header sai da tela. Verificar
  página a página na checagem visual.
- **Duplo `h1`.** `LinkStepShell` e `HomeGreeting` têm `<h1>` próprios;
  se algum ficar para trás, a página passa a ter dois. O `a11y.test.tsx`
  migrado pega isso.
- **Superfície grande.** ~25 arquivos. O plano deve fatiar por shell
  (primeiro `PhoneShell`, depois `ManagerShell`) para manter cada passo
  verificável.

## Fora do escopo

Splash, Privacy, Consent, `ManagerLogin`, `ManagerFinishSetup`,
`AdminLogin`, `AdminInstitutions`, `PeerPartnerLogin`,
`PeerPartnerFinishSetup`, `PeerPartnerInbox`. Nenhuma delas ganha
`handle.header` e nenhuma é tocada.

As telas de onboarding e login ficam fora porque não têm sessão nem
"home" para onde voltar. `AdminInstitutions` e `PeerPartnerInbox` ficam
fora por serem personas separadas, com shells próprios que não
compartilham nem a sidebar nem a régua de 65px — estendê-las é uma
decisão à parte.
