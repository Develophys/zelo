# UI Primitives

Build these **before** any screen (Phase 2). Screens are ~80% composed of these. All live under
`src/presentation/`. Props are given as TypeScript signatures — implement them exactly so screen
specs can reference them without ambiguity. Styling uses the Tailwind tokens from
`tailwind-and-css.md`.

> Icons: `lucide-react`. Import per-icon (`import { Lock } from "lucide-react"`).

---

## `layout/PhoneShell.tsx`
Scroll container + safe-area padding for a mobile-first screen. In-app (production) it's just a
full-height flex column; the phone bezel is a prototype artifact and is **not** shipped.

```ts
interface PhoneShellProps {
  children: React.ReactNode;
  /** When true, removes horizontal padding (for full-bleed hero screens like Splash). */
  bleed?: boolean;
  /** Optional sticky bottom nav. */
  footer?: React.ReactNode;
  /** Background token; defaults to "canvas". */
  bg?: "canvas" | "canvas-alt" | "surface";
  /** Renders a persistent `Sidebar` to the left from the `md:` breakpoint (≥768px) up, and
   *  hides `footer` from `md:` up (the Sidebar replaces it as the primary nav). Only the 4
   *  médico destination pages (Home, Check-in, Conversar, Você) pass this — never focused-flow
   *  screens (assessment in progress, crisis, consent, etc.). Default false. */
  nav?: boolean;
  /** Constrains the body to a ~680px centered reading column from the `md:` breakpoint up.
   *  Independent of `nav` — focused-flow pages set this without `nav`. Default false. */
  centered?: boolean;
}
```
- Root: `flex h-full min-h-screen flex-col bg-{bg}` (`flex-1` is added when `nav` is set, so the
  content column shares width with the Sidebar).
- Body: `flex-1 overflow-y-auto no-scrollbar` + `px-6` unless `bleed`; adds
  `md:mx-auto md:w-full md:max-w-[680px]` when `centered`.
- Footer, if present, is `flex-none`; gains `md:hidden` when `nav` is set.
- When `nav` is set, the whole shell is wrapped in a `flex min-h-screen` row with `Sidebar`
  rendered before the content column.

---

## `ui/Button.tsx`
```ts
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "soft" | "ghost" | "outline" | "danger" | "unstyled"; // cor
  size?: "md" | "sm";  // geometria; ausente = md (e nenhuma, se unstyled)
  full?: boolean;      // width 100%, default true
  loading?: boolean;   // shows spinner + disables
}
```

**Dois eixos independentes.** `variant` decide **cor**, `size` decide **geometria**.

| variant | classes |
|---|---|
| `primary` | `bg-brand text-white enabled:hover:bg-brand-hover` |
| `soft` | `bg-surface-brand text-brand enabled:hover:bg-track` |
| `ghost` | `bg-transparent text-muted` (text link style) |
| `outline` | `bg-surface text-ink border border-line` |
| `danger` | `bg-danger text-white` |
| `unstyled` | nenhuma cor, nenhuma forma — traga a sua via `className` |

| size | classes |
|---|---|
| `md` (padrão) | `gap-2 py-4 px-2 text-[16px] min-h-13` — 52px de alto |
| `sm` | `gap-1.5 py-2.5 px-4 text-label min-h-11` — 44px, o piso de toque |

Base quando tem forma: `inline-flex items-center justify-center rounded-pill font-sans font-semibold`.
Comportamento sempre presente: `cursor-pointer`, anel de foco `ring-brand`, `disabled:opacity-50`,
alternância de largura total, `loading` trocando o rótulo por um spinner.

**`unstyled` + `size` é a combinação para controle com cor própria.** Sem `size`, `unstyled` não
traz forma nenhuma (comportamento antigo, preservado). Passando `size`, ele ganha a geometria do
sistema e continua sem cor — que é o único jeito seguro de um chamador definir a própria cor: duas
utilidades Tailwind da **mesma propriedade** (ex.: `text-danger` do chamador vs. `text-ink` de uma
variant) são ordenadas pelo Tailwind, não pela ordem no `className`, então sobrescrever cor de
variant por `className` é aposta, não regra.

`size="sm"` nasceu de 5 chamadas no `ChatPage` (dois atalhos compactos da bandeja, botão de repetir,
pílula de voltar ao fim, e o link do CVV que continua `<a>` à mão). A geometria estava duplicada nas
cinco e já tinha derivado uma vez — ver `screens/11-chat.md`.

---

## `ui/TextField.tsx` (extraído em 16/08/2026)

```ts
export const FIELD_SURFACE: string;                                  // a superfície, para controles que não são input/select
export function TextField(props: React.InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> })
export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> })
```

Superfície única: `w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[16px]
text-ink placeholder:text-muted` + anel de foco `ring-brand`. `className` do chamador é
**concatenado**, não substituído — ele traz só layout (`mt-2`, `flex-1`), nunca a pele.

**Por que existia duplicação e o que ela escondia.** A receita estava copiada à mão em **21 pontos
de 9 arquivos** (logins, formulários, admin, peer chat). Era por isso que `text-[14.5px]` aparecia
22 vezes sem token — não faltava um token de tipo, faltava o **componente**. E a cópia manual tinha
divergido em duas coisas que importam:

| | Antes | Depois |
|---|---|---|
| Anel de foco | **12 dos 21 não tinham nenhum** | todos |
| Placeholder | `text-faint` #9AA7A1 → **2,50:1** | `text-muted` #5C6B64 → **5,61:1** |
| Corpo | `14,5px` → **zoom no foco no iOS** | `16px` |

Os 12 sem anel de foco eram falha de WCAG 2.4.7 contra o compromisso de AA do PRODUCT.md
("every flow operable by keyboard alone"). O `faint` reprovava o piso de 4,5:1 para texto. Um
componente força **uma** decisão para cada, e só a versão que passa era defensável — ver
`design-tokens.md` sobre o papel de `faint`.

Os 14,5px eram o terceiro defeito, e o mais silencioso: o Safari do iOS dá zoom em qualquer campo
focado abaixo de 16px, e o `index.html` — corretamente, por WCAG 1.4.4 — não trava a escala com
`maximum-scale`/`user-scalable=no`. Ou seja, todo login, formulário e tela de admin sacudia a
viewport ao focar, no celular, que é o aparelho principal do PRODUCT.md. A regra já estava escrita
aqui embaixo como a razão de o composer ser 16px; o que faltava era aplicá-la aos outros 21 pontos.
Com a superfície em 16px, `text-[14.5px]` deixa de existir no código.

**O composer do chat não usa `TextField`, de propósito.** Ele é `textarea` que cresce e declara
**dois** deltas sobre a mesma DNA (mesma borda, mesmo `p-[13px_18px]`, mesmo `text-[16px]`, mesmo
tratamento de placeholder): `rounded-card-lg` em vez de `rounded-pill` (canto que sobrevive ao
crescimento) e `bg-canvas` em vez de `bg-surface` (ele mora sobre `surface`). Eram três até
16/08/2026, quando o corpo da superfície subiu para os mesmos 16px pela razão que o composer já
documentava. Antes esses deltas eram coincidência; agora são desvio declarado de uma superfície
nomeada — e o que sobrou é só a forma, não o tipo.

**Rótulo e erro ficam fora.** O que estava duplicado 21 vezes era a superfície do controle, não a
composição — alguns pontos usam `<label htmlFor>`, outros `aria-label`, com `mt-4 block` variando.
Extrair a composição junto teria trocado parceamento real por generalidade inventada.

---

## `ui/Card.tsx`
```ts
interface CardProps {
  children: React.ReactNode;
  size?: "md" | "lg";        // md → rounded-card, lg → rounded-card-lg
  tone?: "surface" | "brand" | "brand-tint"; // brand = solid green hero, brand-tint = surface-brand
  className?: string;
}
```
- `surface`: `bg-surface shadow-card`. `brand`: `bg-brand text-white shadow-hero`.
  `brand-tint`: `bg-surface-brand`.
- Default padding `p-[18px]`; `lg` → `p-[22px]`.

---

## `ui/IconBadge.tsx`
```ts
interface IconBadgeProps {
  icon: React.ComponentType<{ size?: number; className?: string }>; // a lucide icon
  size?: number;    // box size, default 38
  tone?: "brand" | "danger" | "neutral";
}
```
- `brand`: `bg-surface-brand text-brand`. Rounded `radius-icon`, centered, icon at ~55% of box.

---

## `ui/PrivacyBadge.tsx`
The always-visible anonymity marker.
```ts
interface PrivacyBadgeProps {
  label?: string;   // default "anônimo"
  variant?: "chip" | "inline"; // chip = pill in header, inline = mono caption
}
```
- `chip`: `rounded-pill bg-surface-brand px-3 py-[7px] font-mono text-[12px] text-brand` with a
  `Lock` icon (14px) before the label.

---

## `ui/ProgressBar.tsx`
```ts
interface ProgressBarProps {
  value: number;   // 0..100
  label?: string;  // e.g. "3/9" (rendered by caller usually)
}
```
- Track: `h-[7px] rounded-pill bg-line overflow-hidden`.
- Fill: `h-full bg-brand rounded-pill` with `style={{ width: value + "%" }}` and
  `transition-[width] duration-300`.

---

## `ui/SectionLabel.tsx`
Uppercase mono eyebrow.
```ts
interface SectionLabelProps { children: React.ReactNode; tone?: "muted" | "brand"; }
```
- `font-mono text-eyebrow uppercase` + `text-muted-2` (muted) or `text-brand`.

---

## `ui/ScoreDial.tsx`
The big result number + band pill (used by result screen).
```ts
interface ScoreDialProps {
  score: number;
  max: number;                 // 27 for PHQ-9, 21 for GAD-7
  band: { label: string; fg: string; bg: string }; // from band palette
}
```
- Number: `font-serif text-score text-ink`; `/max` in `text-[24px] text-faint`.
- Band pill: `inline-block rounded-pill px-4 py-[7px] font-sans text-label font-extrabold`,
  colored via inline style from `band.fg`/`band.bg` (this is the ONE place inline color is
  allowed, because bands are data-driven).

---

## `layout/nav-tabs.ts`
Single source of truth for the médico's 4 primary destinations — consumed by both `BottomNav`
(mobile) and `Sidebar` (tablet/desktop) so the two navs can never list different destinations.
```ts
type NavTabId = "home" | "checkin" | "chat" | "you";
interface NavTab {
  id: NavTabId;
  label: string;                            // PT-BR: Início, Check-in, Conversar, Você
  icon: React.ComponentType<{ size?: number }>;
  route: string;
}
const NAV_TABS: NavTab[]; // one entry per destination, in nav order
```

---

## `layout/BottomNav.tsx`
```ts
interface BottomNavProps { active: NavTabId; onNavigate: (tab: NavTabId) => void; }
```
- `NavTabId` is imported from `./nav-tabs` (not a locally-defined union).
- Container: `flex-none flex justify-around border-t border-surface-brand bg-surface px-2 pb-6 pt-3`.
- Each tab: icon + `font-sans text-[11px] font-semibold`. Active → `text-brand`; else `text-faint`.
- Labels (PT-BR): Início, Check-in, Conversar, Você. Hit target ≥ 44px.

---

## `layout/Sidebar.tsx`
Persistent navigation for tablet/desktop (`md:` breakpoint, ≥768px, up). Rendered by `PhoneShell`
when its `nav` prop is set — screens never mount it directly. Below `md:` it renders nothing
visible (`hidden md:flex`); `BottomNav` remains the mobile nav, unchanged. Self-contained: takes
no props, and reads its destinations from the same `NAV_TABS` (`./nav-tabs`) that `BottomNav`
uses, so the two navs can never drift apart.
```ts
// No props — Sidebar is self-contained.
function Sidebar(): JSX.Element;
```
- Container: `nav` with `aria-label="Navegação principal"`, `hidden flex-none flex-col gap-1
  border-r border-surface-brand bg-surface px-2 py-6 md:flex md:w-[76px] lg:w-[220px]` (icon-only
  rail at `md:`, icon + label at `lg:`).
- Each destination is a React Router `NavLink` (not a button + `onClick`/`navigate`), so desktop
  users get native link behavior — Ctrl/Cmd-click, middle-click to open in a new tab, copy link
  address, etc. `NavLink` sets `aria-current="page"` automatically on the active route; active vs.
  inactive styling is driven by its `isActive` render prop: `bg-surface-brand text-brand` when
  active, `text-faint` when inactive.
- Each link: `flex min-h-[44px] items-center justify-center gap-3 rounded-input px-3 py-2` +
  focus ring, `lg:justify-start`; icon (22px) + `aria-label={label}`; label text is
  `hidden lg:inline`, `font-sans text-[14px] font-semibold`.
- Labels (PT-BR): Início, Check-in, Conversar, Você — same 4 destinations and order as `BottomNav`.

---

## Acceptance criteria
- Every primitive matches its prop signature above.
- A throwaway `/kitchen-sink` route renders all variants; delete before merge.
- No primitive imports another screen; primitives are leaf/composable only.
- All interactive primitives are keyboard-focusable with a visible focus ring
  (`focus-visible:ring-2 focus-visible:ring-brand`).
