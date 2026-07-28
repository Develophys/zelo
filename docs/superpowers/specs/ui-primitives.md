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
  variant?: "primary" | "ghost" | "outline" | "danger";
  full?: boolean;      // width 100%, default true
  loading?: boolean;   // shows spinner + disables
}
```
| variant | classes |
|---|---|
| `primary` | `bg-brand text-white hover:bg-brand-hover` |
| `ghost` | `bg-transparent text-muted` (text link style) |
| `outline` | `bg-surface text-ink border border-line` |
| `danger` | `bg-danger text-white` |
Base: `rounded-pill py-4 font-sans text-[16px] font-bold transition disabled:opacity-50`.
Min height 52px (hit target). `loading` swaps label for a small spinner.

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
