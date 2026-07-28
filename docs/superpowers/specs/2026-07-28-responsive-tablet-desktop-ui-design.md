# UI responsiva para tablet e desktop — design spec

**Status:** design aprovado (brainstorm com Mauricio, 28/07/2026, incluindo revisão visual via companheiro de brainstorm — mockups em `.superpowers/brainstorm/244-1785275814/content/`). Prioridade explícita de Mauricio antes de iniciar qualquer feature nova (WhatsApp/US-010, chat par-a-par) — ver `general-documentations/roadmap/mauricio.md`.

## 1. Motivação e achado inicial

O Zelo foi construído mobile-only durante a Jornada Incubintech (prazo eliminatório encerrado, ver `roadmap/README.md`). Agora, na trilha de evolução independente do produto, Mauricio quer que a aplicação funcione bem em celular, tablet e computador — sem uma dor específica hoje, preparação geral ("tudo igualmente").

Dois achados de código mudaram o escopo original da conversa:

1. **Não existe nenhum breakpoint responsivo em lugar nenhum do projeto** (`sm:`/`md:`/`lg:`/`xl:` do Tailwind nunca usados) e **nenhum container com largura máxima** — o layout mobile hoje estica full-bleed em qualquer tamanho de tela, sem nenhuma adaptação.
2. **`BottomNav` não é uma barra de navegação persistente** — só aparece em `HomePage.tsx`. As outras 3 telas-destino (`ChatPage`, `AssessmentSelectPage`, `YouPage`) são alcançadas a partir da Home e voltam com `BackButton`, sem navegação visível. Isso significa que "trocar bottom nav por sidebar" não é uma tradução 1:1 — introduzir navegação persistente em telas grandes é uma decisão nova, não só um reposicionamento.

## 2. Breakpoints

Um único ponto de corte estrutural: **768px** (Tailwind `md:`), cobrindo tablet retrato e acima. Abaixo disso, **nenhuma mudança visual** — o celular continua exatamente como está hoje. Um segundo ponto em **1024px** (`lg:`) refina só a densidade da grade do painel do gestor.

| Faixa | Rótulo | Comportamento |
|---|---|---|
| < 768px | Celular | Idêntico ao hoje. `BottomNav` só na Home. Sem sidebar em lugar nenhum. |
| 768–1023px | Tablet | Sidebar em rail (só ícones) nas 4 telas-destino. Conteúdo centralizado (~680px). |
| ≥ 1024px | Desktop | Sidebar expandida (ícone + rótulo). Painel do gestor ganha grade de 2 colunas para tendência/segmentos. |

## 3. Navegação — sidebar persistente nas 4 telas-destino

**Decisão nova de produto, não só responsiva**: a partir de 768px, `HomePage`, `AssessmentSelectPage`, `ChatPage` e `YouPage` ganham uma sidebar fixa à esquerda com os mesmos 4 destinos hoje em `BottomNav.tsx` (Início, Check-in, Conversar, Você), mesma lógica de ativo/inativo (`brand` vs. `faint`).

- **768–1023px**: rail só com ícones (economiza espaço na largura mais apertada do tablet retrato).
- **≥1024px**: sidebar expandida, ícone + rótulo, mesmo padrão visual do rail.
- **Fluxos focados continuam sem navegação visível em qualquer largura** — autoavaliação em andamento (`Phq9AssessmentPage`, `Gad7AssessmentPage`, `AssessmentResultPage`), tela de crise (`CrisisOfferPage`, `CrisisAcceptPage`, `CrisisDeclinePage`), consentimento (`ConsentPage`), privacidade (`PrivacyPage`), splash. Só `BackButton`, mesmo padrão de foco que já existe hoje — preservado deliberadamente mesmo em desktop.
- **Celular**: zero mudança. `BottomNav` continua só na Home.

Refatoração de suporte: extrair a config `TABS` de `BottomNav.tsx` para um array compartilhado (ex.: `presentation/layout/nav-tabs.ts`), consumido tanto por `BottomNav` quanto pelo novo `Sidebar` — evita duplicar os 4 destinos em dois arquivos.

## 4. Largura de conteúdo e tipografia (telas do médico)

A partir de 768px, o conteúdo das telas do médico (as 4 telas-destino e os fluxos focados) fica centralizado numa coluna de leitura confortável de **~680px**, em vez de esticar borda a borda — mesma decisão validada visualmente no brainstorm (Opção A: coluna centralizada vs. largura total vs. híbrido). Nas 4 telas-destino, essa coluna fica ao lado da sidebar; nos fluxos focados, ocupa o centro sozinha.

Tipografia ganha um passo a mais a partir de 768px, mesma família/hierarquia de `docs/superpowers/specs/design-tokens.md`, só ajustando os valores em pixel para a distância de leitura maior de tablet/desktop:

| Token | Mobile (< 768px, atual) | Tablet/Desktop (≥ 768px) |
|---|---|---|
| `h1` | 28px | 32px |
| `h2` | 24px | 26px |
| `body` | 15px | 16px |
| `label` | 14px | 15px |
| `score` | 64px | 64px (sem mudança — já é grande o bastante; um salto aqui desequilibraria `ResultBandCard`/`ScoreDial`) |

`design-tokens.md` ganha uma seção nova "Tablet/Desktop scale (≥768px)" documentando esses valores como uma segunda camada do mesmo token, não uma escala paralela.

## 5. Painel do gestor — grade multi-coluna

Sem sidebar aqui — o painel só tem 2 destinos (`ManagerDashboardPage`, `ManagerInsightHistoryPage`), não justifica navegação persistente; `BackButton`/link "Ver histórico" continuam como hoje.

- **≥768px**: os 3 cards de KPI (`overallConcerningRate`, `checkInsLast4Weeks`, `followUpResponseRate` — hoje 2 lado a lado + 1 embaixo) ficam numa única linha de 3 colunas (`md:grid-cols-3`).
- **≥1024px**: o card de tendência (`Tendência geral`) e o de segmentos (`Sinais por setor`) passam de empilhados para lado a lado, tendência ocupando mais espaço (`lg:grid-cols-[2fr_1fr]`). O card de "Análise com IA" permanece em largura total, abaixo dos dois.
- Puramente CSS/classes Tailwind nos containers já existentes em `ManagerDashboardPage.tsx` — nenhum componente novo aqui.

## 6. Estrutura de componentes

- `PhoneShell` (`apps/web/src/presentation/layout/PhoneShell.tsx`) ganha um modo responsivo:
  - Para as 4 telas-destino: a partir de 768px, `flex` horizontal `[Sidebar | coluna de conteúdo centralizada]`.
  - Para telas de fluxo focado: a partir de 768px, só centraliza o conteúdo (sem sidebar).
  - Abaixo de 768px: comportamento idêntico ao atual em ambos os casos.
- Novo componente `Sidebar` (`apps/web/src/presentation/layout/Sidebar.tsx`), consumindo o array `nav-tabs.ts` compartilhado com `BottomNav`.
- `ManagerDashboardPage.tsx` ganha classes de grade responsiva nos containers existentes descritos em §5 — sem componente novo.
- Nenhuma mudança de arquitetura de dados/portas/use-cases — este spec é inteiramente `presentation/`, não toca `application/` nem `infrastructure/`.

## 7. Testes

- Toda a suíte de testes existente (`*.test.tsx`) continua validando o comportamento mobile sem alteração — nenhum teste deve quebrar por essas mudanças, já que abaixo de 768px nada muda.
- Novos testes para `Sidebar`: renderiza só a partir de 768px, destino ativo correto, ausente nas telas de fluxo focado.
- Novo teste para `nav-tabs.ts`: `BottomNav` e `Sidebar` consomem exatamente a mesma lista de 4 destinos (evita drift entre os dois).
- Verificação manual em 3 larguras de referência: **375px** (celular — sem mudança visual nenhuma), **768px** (tablet retrato — rail de ícones + coluna centralizada), **1280px** (desktop — sidebar expandida + grade do painel do gestor).

## 8. Fora de escopo deste spec

- Qualquer mudança em `application/`, `infrastructure/` ou nas portas HTTP — puramente camada de apresentação.
- Layout responsivo do fluxo do gestor além da grade descrita em §5 (ex.: sidebar própria do gestor) — os únicos 2 destinos não justificam isso agora.
- Detecção de tipo de dispositivo (touch vs. mouse) — a resposta é inteiramente por largura de viewport, mesmo sinal para tablet touch e desktop com mouse.
- Orientação landscape/portrait como sinal separado — só largura de viewport importa, não orientação.
