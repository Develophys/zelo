# Sidebar colapsável + cabeçalho de marca — design spec

**Status:** design aprovado (brainstorm com Mauricio, 09/08/2026, incluindo revisão visual via companheiro de brainstorm — mockup em `.superpowers/brainstorm/110-1786309958/content/header-layout.html`). Revisado contra as diretrizes do skill `impeccable` (modo Operate) antes da aprovação final.

## 1. Motivação

`Sidebar.tsx` (introduzida em `docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md`) hoje só responde ao tamanho de tela: rail de ícones entre 768–1023px, expandida com ícone + rótulo a partir de 1024px. Não existe controle manual, e a sidebar não tem cabeçalho — nenhuma marca Zelo visível nela. Este spec adiciona:

1. Um botão de colapsar/expandir manual, disponível a partir de 1024px (`lg:`).
2. Um cabeçalho com o ícone-logo do Zelo e o rótulo "Zelo", linkando para a Home.

## 2. Escopo do toggle manual

O toggle só existe a partir de **1024px (`lg:`)**. Abaixo disso, o comportamento responsivo atual continua idêntico e sem alteração:

| Faixa | Comportamento |
|---|---|
| < 768px | Sem sidebar (inalterado). |
| 768–1023px | Rail só com ícones, sem toggle — mesmo comportamento de hoje, guiado só por breakpoint. |
| ≥ 1024px | Sidebar expandida por padrão (ícone + rótulo). Toggle manual visível, permite colapsar para o mesmo rail de 76px usado no tablet. |

Motivo da escolha: no tablet (768–1023px) o rail de ícones já é o único estado que cabe confortavelmente; um toggle ali não teria o que alternar. Reaproveitar a largura de 76px do rail no estado colapsado de desktop evita uma terceira largura no design system.

## 3. Persistência

O estado (colapsada/expandida) é salvo em `localStorage` (`zelo:sidebar-collapsed`) e restaurado na carga da página — se o médico colapsar a sidebar, ela continua colapsada na próxima visita. Sem SSR neste app (SPA Vite), então não há preocupação de hidratação.

## 4. Cabeçalho — logo, rótulo e toggle

Validado visualmente no companheiro de brainstorm (opção "Stacked in header" escolhida entre duas alternativas):

- **Expandida:** uma linha única — ícone-logo (`public/zelo_logo.png`, já é uma marca quadrada, funciona em ambos os tamanhos) + rótulo "Zelo" à esquerda, botão de toggle à direita.
- **Colapsada:** o botão de toggle desce para sua própria linha, centralizada, abaixo do ícone-logo — nunca desaparece, sempre acessível para reexpandir.
- O ícone-logo (dentro de um `<Link to={routes.home}>`) sempre carrega um nome acessível ("Zelo"), mesmo quando o rótulo de texto visível está oculto no estado colapsado — não é um link-ícone sem nome.
- Botão de toggle: ícone `ChevronLeft` (expandida → colapsar) troca para `ChevronRight` (colapsada → expandir) — troca de ícone, não rotação, consistente com o resto do código-base (nenhum padrão de rotação existe hoje).

## 5. Estrutura de componentes

`Sidebar.tsx` passa a ser um `<aside>` (as classes de visibilidade/largura migram do `<nav>` para ele), contendo:

1. Um `<div>` de cabeçalho novo (logo + rótulo + toggle, conforme §4).
2. O `<nav aria-label="Navegação principal">` existente, agora só com os 4 links de `NAV_TABS` — conteúdo e comportamento inalterados.

Nenhuma mudança em `PhoneShell.tsx`: ele só renderiza `<Sidebar />`, e o layout `flex` se adapta à largura que a sidebar reportar.

## 6. Larguras e visibilidade

- Largura do `<aside>`: `md:w-[76px]` sempre; `lg:w-[220px]` só quando **não** colapsada. Colapsada, a sidebar permanece em 76px mesmo em telas `lg:`.
- Rótulos (itens de nav e "Zelo"): `hidden lg:inline` quando expandida (comportamento atual); vira `hidden` sem condição quando colapsada.
- Botão de toggle: `hidden lg:flex` — só existe onde faz sentido (§2).

## 7. Acessibilidade e motion (revisão `impeccable`, modo Operate)

Alinhado ao piso de acessibilidade do projeto (WCAG 2.1 AA, `PRODUCT.md`) e à convenção de botão-ícone já estabelecida em `BackButton.tsx`:

- **Alvo de toque:** botão de toggle usa `min-h-11 min-w-11` (44px), igual a `BackButton` — não o tamanho reduzido usado só na ilustração do mockup.
- **Estados:** default (`text-muted`), hover (`text-brand`), `focus-visible:ring-2 focus-visible:ring-brand` — mesmo vocabulário visual dos demais elementos interativos do arquivo, nenhum estado faltando.
- **Semântica:** `aria-label` alterna entre "Recolher menu"/"Expandir menu"; `aria-pressed={collapsed}` expõe o estado explicitamente para tecnologia assistiva, além da relabelagem.
- **Motion:** a transição de largura do `<aside>` usa `transition-[width] duration-200` (200ms, dentro da faixa 150–250ms recomendada para produto), sem o prefixo `motion-safe:`. Isso é intencional: o projeto já tem uma regra CSS global (`apps/web/src/app/index.css`, último bloco — `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }`) que força a remoção de toda animação/transição quando `prefers-reduced-motion: reduce` está ativo, cobrindo esta transição automaticamente. Um prefixo `motion-safe:` seria redundante. O texto dos rótulos alterna visibilidade instantaneamente (`hidden`/visível), sem animação própria — a largura já comunica a mudança de estado, sem coreografia extra.
- **Espaçamento:** cabeçalho reaproveita o ritmo existente do arquivo (`px-2`, `gap-1`/`gap-3`, `py-6`) — nenhum valor novo introduzido só para este componente.

## 8. Testes

- `Sidebar.test.tsx` ganha casos novos: toggle alterna largura/visibilidade dos rótulos; estado persiste via `localStorage` (mock); logo navega para `routes.home`; toggle ausente abaixo de `lg`.
- Os 4 testes existentes continuam válidos, com ajuste pontual: a asserção de classes `hidden`/`md:flex` passa a mirar o `<aside>` (agora o elemento raiz), não mais o `<nav>` — o `<nav>` interno mantém só os 4 links e seu próprio `aria-label`.

## 9. Fora de escopo

- Qualquer mudança em `application/`, `infrastructure/` ou breakpoints existentes (768px/1024px) — puramente uma extensão do `Sidebar.tsx` já existente.
- Colapso automático baseado em largura de conteúdo ou heurísticas — só manual, via clique no toggle.
- Painel do gestor — não tem sidebar hoje (ver §5 do spec responsivo) e continua fora deste escopo.
