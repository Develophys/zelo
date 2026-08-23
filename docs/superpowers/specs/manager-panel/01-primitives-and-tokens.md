# Phase 01 — Primitives & tokens

**Goal.** Every visual decision the redesign depends on becomes a token or a primitive, once,
before any screen changes. The most visible outcome: **buttons, inputs and cards stop being
pill-shaped/over-rounded** and adopt the sharp-cornered scale the user picked.

**Touches.** `tailwind.config.ts`, `src/app/index.css`, `src/presentation/ui/*`,
`src/stores/manager-prefs.store.ts`. **No page files.**

---

## A. Corner scale (FR-P01-1)

The validated direction is **sharp**: small, consistent radii; pills reserved for *status* only.

| Token | Value | Used by |
|---|---|---|
| `rounded-control` | `6px` | buttons, inputs, selects, icon buttons |
| `rounded-card` | `10px` | cards, tables, modals, sheets |
| `rounded-status` | `4px` | status pills, badges, filter pills |
| `rounded-full` | — | **only** avatars and the drag handle on mobile sheets |

Implement as `theme.extend.borderRadius` keys `control`, `card`, `status`. Then
**grep-and-replace**: no `rounded-xl`, `rounded-2xl`, `rounded-3xl` or `rounded-full` may
remain on a button, input, card or modal anywhere in `src/presentation`.

> **Why not `rounded-full` on filter pills?** They read as buttons and competed with the
> primary action in validation. Filter pills use `rounded-status` + a border, and signal
> selection with `bg-brand text-white border-brand`, never with a checkbox.

## B. Density (FR-P01-2)

Validated choice: **confortável** as the default, with a compact option available in
Configurações (Phase 04).

Expose density as CSS custom properties on `:root` in `index.css`, overridden by a
`data-density` attribute on `<html>`:

```css
:root { --cell-py: 0.875rem; --cell-px: 1.125rem; --nav-py: 0.625rem; --control-py: 0.625rem; }
[data-density="compact"] { --cell-py: 0.5rem; --cell-px: 0.75rem; --nav-py: 0.4375rem; --control-py: 0.4375rem; }
```

Map into Tailwind as `spacing.cell-y`, `spacing.cell-x`, `spacing.nav-y`, `spacing.control-y`
so components write `py-cell-y px-cell-x` and inherit density with no JS.

## C. Accent color (FR-P01-3)

The accent is user-configurable (Phase 04, Configurações). Same mechanism: `--accent`,
`--accent-tint` custom properties, consumed by Tailwind as `colors.brand.DEFAULT` /
`colors.brand.tint` via `rgb(var(--accent) / <alpha-value>)`. Defaults stay the existing
sage green from `src/app/index.css` — **do not change the default brand color.**

Allowed accent options (curated, contrast-checked ≥ 4.5:1 against white text):
sage `#3F7D5C` (default), teal `#2F6B72`, indigo `#4A5A8C`, clay `#8A5A46`.
No free color picker.

## D. `manager-prefs.store.ts` (FR-P01-4)

Zustand store, `persist` middleware, key `zelo.manager.prefs`:

```ts
interface ManagerPrefsState {
  density: "comfortable" | "compact";
  accent: "sage" | "teal" | "indigo" | "clay";
  sidebarCollapsed: boolean;
  setDensity(d: ManagerPrefsState["density"]): void;
  setAccent(a: ManagerPrefsState["accent"]): void;
  toggleSidebar(): void;
}
```

A single `useApplyManagerPrefs()` hook (called once in `ManagerShell`) writes
`data-density` and the `--accent` custom props onto `document.documentElement`. Components
never read the store for styling — they read tokens.

## E. Primitives

Each gets an explicit prop signature, forwards `ref`, spreads `...rest` onto the root, and
uses `aria-*` correctly.

```ts
// Button.tsx
type ButtonProps = {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  isLoading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

// IconButton.tsx — icon-only; `label` is REQUIRED and becomes aria-label + tooltip content
type IconButtonProps = {
  label: string;
  icon: React.ReactNode;
  variant?: "outline" | "ghost" | "danger";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">;

// Pill.tsx
type PillProps = {
  tone: "neutral" | "positive" | "warning" | "danger";
  children: React.ReactNode;
};

// Tooltip.tsx — wraps Radix Tooltip if already a dep; otherwise a minimal
// focus/hover-triggered popover. MUST also open on touch long-press (mobile row actions).
type TooltipProps = { content: React.ReactNode; children: React.ReactElement };

// Checkbox.tsx — native input, custom-styled via peer classes; supports indeterminate
type CheckboxProps = { indeterminate?: boolean } & React.InputHTMLAttributes<HTMLInputElement>;
```

**Status pill tones** (used by every table): `positive` = Ativa, `neutral` = Inativa,
`warning` = Convite pendente / Não lida (amber border — validated), `danger` = Convite expirado.
Warning tone carries a `border` in addition to background; the others are borderless.

## F. Hit targets

Every interactive element ≥ 44×44px on touch viewports, even when the visual box is smaller —
use padding, not size. Icon buttons in table rows: visual 32px, tap target 44px via
`before:absolute before:-inset-1.5`.

---

## Acceptance criteria

- [ ] `pnpm --filter web build` passes.
- [ ] Grep proves zero `rounded-xl|rounded-2xl|rounded-3xl` on buttons/inputs/cards/modals.
- [ ] Toggling `data-density="compact"` in devtools visibly tightens every table and nav item
      with no JS re-render.
- [ ] Setting `--accent` in devtools recolors every primary button, active nav item and
      selected pill.
- [ ] `IconButton` without `label` is a **type error**.
- [ ] axe-core reports no violations on a throwaway kitchen-sink route rendering all variants.
