# Sidebar Collapse + Brand Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the desktop/tablet `Sidebar` a Zelo brand header (logo + label, links to Home) and a manual collapse/expand toggle (available from 1024px up, persisted across visits) that shrinks it to the same icon-only rail already used at tablet width.

**Architecture:** One component, `apps/web/src/presentation/layout/Sidebar.tsx`, changes from `<nav>`-is-the-root to `<aside>` (holding width/visibility classes) wrapping a new header `<div>` (logo + label + toggle button) and the existing `<nav>` (now just the 4 destination links). Collapse state is local `useState` in `Sidebar`, written to `localStorage` on change and read back on mount — no context, no new hook, no changes to `PhoneShell.tsx` or any other file, since nothing else consumes this state.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS v4 (`@theme` tokens in `apps/web/src/app/index.css`), `react-router` (`Link`/`NavLink`), `lucide-react` icons, Vitest + Testing Library + `@testing-library/user-event`.

## Global Constraints

- PT-BR only — all copy (`aria-label`s, button labels) in Portuguese, matching the rest of the file.
- WCAG 2.1 AA per `apps/web/PRODUCT.md`: interactive hit targets ≥44×44px; `prefers-reduced-motion` respected on every transition; icon-only interactive elements carry an accessible name; every flow operable by keyboard alone.
- This app has a global CSS rule (`apps/web/src/app/index.css:144-146`) that already forces `animation: none !important; transition: none !important;` under `prefers-reduced-motion: reduce` — new transition classes do **not** need a `motion-safe:` prefix; the existing blanket rule covers them.
- Presentation-layer only. No changes to `application/`, `infrastructure/`, or any HTTP port.
- The collapse toggle only renders/applies from `lg:` (1024px) up. Below that, existing responsive behavior (hidden <768px, auto icon-only rail 768–1023px) is unchanged and untouched by `collapsed` state.
- Reuse existing design tokens only — no new colors, radii, or spacing values. Toggle button styling matches `apps/web/src/presentation/ui/BackButton.tsx`'s established icon-button convention (`min-h-[44px] min-w-[44px]`, `text-muted`, `focus-visible:ring-2 focus-visible:ring-brand`).
- Reference spec: `docs/superpowers/specs/2026-08-09-sidebar-collapse-and-brand-header-design.md`.

---

### Task 1: Brand header (logo + "Zelo" label, links to Home)

Restructures `Sidebar` from a bare `<nav>` into an `<aside>` wrapping a new header row and the existing `<nav>`. No collapse behavior yet — this task only adds the always-present brand mark. Existing responsive behavior (hidden <768px, icon rail 768–1023px, expanded ≥1024px) must keep working exactly as before, just driven from the `<aside>` instead of the `<nav>`.

**Files:**
- Modify: `apps/web/src/presentation/layout/Sidebar.tsx`
- Test: `apps/web/src/presentation/layout/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `NAV_TABS` from `./nav-tabs` (unchanged), `routes` from `@/presentation/lib/routes` (new import — `routes.home` is `"/home"`).
- Produces: `Sidebar` renders `<aside data-testid="sidebar">` as its root (previously `<nav>` was the root, targeted directly by tests). The inner `<nav aria-label="Navegação principal">` still exists, now containing only the 4 `NAV_TABS` links. Later tasks build directly on this structure.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/web/src/presentation/layout/Sidebar.test.tsx` with:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { Sidebar } from "./Sidebar";
import { routes } from "@/presentation/lib/routes";

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.home} element={<Sidebar />} />
        <Route path={routes.assessment} element={<Sidebar />} />
        <Route path={routes.chat} element={<Sidebar />} />
        <Route path={routes.you} element={<Sidebar />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("renders the four PT-BR destination labels", () => {
    renderAt(routes.home);
    expect(screen.getByText("Início")).toBeInTheDocument();
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("Conversar")).toBeInTheDocument();
    expect(screen.getByText("Você")).toBeInTheDocument();
  });

  it("marks the destination matching the current route as active", () => {
    renderAt(routes.chat);
    expect(screen.getByRole("link", { name: "Conversar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
  });

  it("navigates to the tapped destination's route", async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole("link", { name: "Conversar" }));
    expect(screen.getByRole("link", { name: "Conversar" })).toHaveAttribute("aria-current", "page");
  });

  it("is hidden below the tablet breakpoint and visible from it up", () => {
    renderAt(routes.home);
    expect(screen.getByTestId("sidebar")).toHaveClass("hidden", "md:flex");
  });

  it("renders the Zelo brand mark linking to Home", () => {
    renderAt(routes.home);
    const brandLink = screen.getByRole("link", { name: "Zelo" });
    expect(brandLink).toHaveAttribute("href", routes.home);
  });
});
```

- [ ] **Step 2: Run tests to verify the expected failures**

Run: `cd apps/web && npx vitest run src/presentation/layout/Sidebar.test.tsx`
Expected: the "is hidden below the tablet breakpoint" test FAILs (no element with `data-testid="sidebar"` exists yet — `Sidebar` still renders `<nav>` as its root), and the new "renders the Zelo brand mark" test FAILs (no link named "Zelo" exists yet). The other 3 pre-existing tests still PASS unchanged.

- [ ] **Step 3: Implement the brand header**

Replace the full contents of `apps/web/src/presentation/layout/Sidebar.tsx` with:

```tsx
import { Link, NavLink } from "react-router";
import { NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";

// Persistent navigation for tablet/desktop (≥768px) — shown only on the 4
// médico destination pages (Home, Check-in, Conversar, Você), never on
// focused-flow screens (assessment in progress, crisis, consent, etc.), per
// docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md §3.
// Below 768px this renders nothing visible (`hidden md:flex`); BottomNav
// remains the mobile nav, unchanged.
export function Sidebar() {
  return (
    <aside
      data-testid="sidebar"
      className="hidden flex-none flex-col border-r border-surface-brand bg-surface md:flex md:w-[76px] lg:w-[220px]"
    >
      <div className="flex flex-col items-center gap-2 border-b border-surface-brand px-2 py-4 lg:flex-row lg:justify-between">
        <Link
          to={routes.home}
          aria-label="Zelo"
          className="flex min-h-11 min-w-11 items-center gap-2 rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <picture>
            <source srcSet={`${import.meta.env.BASE_URL}zelo_logo.webp`} type="image/webp" />
            <img
              src={`${import.meta.env.BASE_URL}zelo_logo.png`}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 flex-none object-contain"
            />
          </picture>
          <span aria-hidden="true" className="hidden font-sans text-[15px] font-bold text-ink lg:inline">
            Zelo
          </span>
        </Link>
      </div>

      <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-1 px-2 py-6">
        {NAV_TABS.map(({ id, label, icon: Icon, route }) => (
          <NavLink
            key={id}
            to={route}
            aria-label={label}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center justify-center gap-3 rounded-input px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:justify-start ${
                isActive ? "bg-surface-brand text-brand" : "text-faint"
              }`
            }
          >
            <Icon size={22} />
            <span className="hidden font-sans text-[14px] font-semibold lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/presentation/layout/Sidebar.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/Sidebar.tsx apps/web/src/presentation/layout/Sidebar.test.tsx
git commit -m "feat: add Zelo brand header to Sidebar"
```

---

### Task 2: Manual collapse/expand toggle

Adds the collapse toggle button to the header built in Task 1, and wires a local `collapsed` boolean into the `<aside>` width, the header's row/column layout, and every nav item's label/alignment. No persistence yet (plain `useState(false)`) — that's Task 3.

**Files:**
- Modify: `apps/web/src/presentation/layout/Sidebar.tsx`
- Test: `apps/web/src/presentation/layout/Sidebar.test.tsx`

**Interfaces:**
- Consumes: the `<aside data-testid="sidebar">` / header `<div>` / `<nav>` structure produced by Task 1.
- Produces: a toggle `<button>` with `aria-label` alternating between `"Recolher menu"` (visible/expanded state, click collapses) and `"Expandir menu"` (collapsed state, click expands), plus `aria-pressed={collapsed}`. Task 3 consumes this same `collapsed`/`setCollapsed` pair, only changing how the initial value is computed and adding a persistence effect.

- [ ] **Step 1: Write the failing tests**

Add these three `it` blocks inside the existing `describe("Sidebar", ...)` block in `apps/web/src/presentation/layout/Sidebar.test.tsx` (after the "renders the Zelo brand mark linking to Home" test added in Task 1):

```tsx
  it("only shows the collapse toggle from the lg breakpoint up", () => {
    renderAt(routes.home);
    expect(screen.getByRole("button", { name: "Recolher menu" })).toHaveClass("hidden", "lg:flex");
  });

  it("collapses to the icon-only width and hides labels when the toggle is clicked", async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole("button", { name: "Recolher menu" }));

    expect(screen.getByTestId("sidebar")).not.toHaveClass("lg:w-[220px]");
    expect(screen.getByText("Zelo")).toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Expandir menu" })).toHaveAttribute("aria-pressed", "true");
  });

  it("expands again on a second toggle click", async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole("button", { name: "Recolher menu" }));
    await user.click(screen.getByRole("button", { name: "Expandir menu" }));

    expect(screen.getByTestId("sidebar")).toHaveClass("lg:w-[220px]");
    expect(screen.getByRole("button", { name: "Recolher menu" })).toHaveAttribute("aria-pressed", "false");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/presentation/layout/Sidebar.test.tsx`
Expected: the 3 new tests FAIL with "Unable to find role="button" with name "Recolher menu"" (no toggle button exists yet). The 5 existing tests still PASS.

- [ ] **Step 3: Implement the toggle**

Replace the full contents of `apps/web/src/presentation/layout/Sidebar.tsx` with:

```tsx
import { useState } from "react";
import { Link, NavLink } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";

// Persistent navigation for tablet/desktop (≥768px) — shown only on the 4
// médico destination pages (Home, Check-in, Conversar, Você), never on
// focused-flow screens (assessment in progress, crisis, consent, etc.), per
// docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md §3.
// Below 768px this renders nothing visible (`hidden md:flex`); BottomNav
// remains the mobile nav, unchanged. From 1024px up, `collapsed` lets the
// médico manually shrink it to the same icon rail used at tablet width — see
// docs/superpowers/specs/2026-08-09-sidebar-collapse-and-brand-header-design.md.
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      data-testid="sidebar"
      className={`hidden flex-none flex-col border-r border-surface-brand bg-surface transition-[width] duration-200 md:flex md:w-[76px] ${
        collapsed ? "" : "lg:w-[220px]"
      }`}
    >
      <div
        className={`flex flex-col items-center gap-2 border-b border-surface-brand px-2 py-4 ${
          collapsed ? "" : "lg:flex-row lg:justify-between"
        }`}
      >
        <Link
          to={routes.home}
          aria-label="Zelo"
          className="flex min-h-11 min-w-11 items-center gap-2 rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <picture>
            <source srcSet={`${import.meta.env.BASE_URL}zelo_logo.webp`} type="image/webp" />
            <img
              src={`${import.meta.env.BASE_URL}zelo_logo.png`}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 flex-none object-contain"
            />
          </picture>
          <span
            aria-hidden="true"
            className={`font-sans text-[15px] font-bold text-ink ${collapsed ? "hidden" : "hidden lg:inline"}`}
          >
            Zelo
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-pressed={collapsed}
          className="hidden min-h-11 min-w-11 items-center justify-center rounded-input text-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:flex"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-1 px-2 py-6">
        {NAV_TABS.map(({ id, label, icon: Icon, route }) => (
          <NavLink
            key={id}
            to={route}
            aria-label={label}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center justify-center gap-3 rounded-input px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                collapsed ? "" : "lg:justify-start"
              } ${isActive ? "bg-surface-brand text-brand" : "text-faint"}`
            }
          >
            <Icon size={22} />
            <span className={`hidden font-sans text-[14px] font-semibold ${collapsed ? "" : "lg:inline"}`}>
              {label}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/presentation/layout/Sidebar.test.tsx`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/Sidebar.tsx apps/web/src/presentation/layout/Sidebar.test.tsx
git commit -m "feat: add manual collapse/expand toggle to Sidebar"
```

---

### Task 3: Persist collapse state across visits

Wires the `collapsed` state from Task 2 to `localStorage`, so a médico's collapse choice survives a reload. Lazy-initializes state from storage on mount, writes on every change.

**Files:**
- Modify: `apps/web/src/presentation/layout/Sidebar.tsx`
- Test: `apps/web/src/presentation/layout/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `collapsed`/`setCollapsed` from Task 2's `useState(false)`.
- Produces: `localStorage` key `"zelo:sidebar-collapsed"` holding `"true"` or `"false"` — no other file reads or writes this key.

- [ ] **Step 1: Write the failing tests**

First, add `beforeEach` to the vitest import at the top of `apps/web/src/presentation/layout/Sidebar.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
```

Then add a `beforeEach` as the first statement inside `describe("Sidebar", ...)`, before the existing `it` blocks:

```tsx
  beforeEach(() => {
    window.localStorage.clear();
  });
```

Then add these two `it` blocks at the end of the `describe("Sidebar", ...)` block:

```tsx
  it("restores a collapsed state saved from a previous visit", () => {
    window.localStorage.setItem("zelo:sidebar-collapsed", "true");
    renderAt(routes.home);

    expect(screen.getByTestId("sidebar")).not.toHaveClass("lg:w-[220px]");
    expect(screen.getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
  });

  it("persists the collapsed state after the sidebar remounts", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt(routes.home);
    await user.click(screen.getByRole("button", { name: "Recolher menu" }));
    unmount();

    renderAt(routes.home);
    expect(screen.getByTestId("sidebar")).not.toHaveClass("lg:w-[220px]");
    expect(screen.getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/presentation/layout/Sidebar.test.tsx`
Expected: the 2 new tests FAIL — `Sidebar` still always starts with `collapsed = false` regardless of `localStorage`, so `"lg:w-[220px]"` is still present and no button named "Expandir menu" exists. The 8 existing tests still PASS (the new `beforeEach` clearing an already-empty `localStorage` is a no-op for them).

- [ ] **Step 3: Implement persistence**

In `apps/web/src/presentation/layout/Sidebar.tsx`, change the import line and the top of the component. Replace:

```tsx
import { useState } from "react";
import { Link, NavLink } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";
```

with:

```tsx
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";

const COLLAPSED_STORAGE_KEY = "zelo:sidebar-collapsed";

function readStoredCollapsed(): boolean {
  return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
}
```

Then replace:

```tsx
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
```

with:

```tsx
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
```

The rest of the component (the returned JSX) is unchanged from Task 2.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/presentation/layout/Sidebar.test.tsx`
Expected: all 10 tests PASS.

- [ ] **Step 5: Run the full web test suite to check for regressions**

Run: `cd apps/web && npx vitest run`
Expected: all tests PASS — in particular `PhoneShell.test.tsx` (renders `Sidebar` inside it, unaffected since `Sidebar`'s public interface — no props, self-contained — hasn't changed) and `a11y.test.tsx` (axe-core check; the new toggle button and brand link both carry accessible names, so no new violations expected).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/layout/Sidebar.tsx apps/web/src/presentation/layout/Sidebar.test.tsx
git commit -m "feat: persist Sidebar collapse state in localStorage"
```

---

## Self-Review

**Spec coverage:**
- §2 (toggle scope, lg+ only) → Task 2 Step 3 (`hidden lg:flex` on the button; `collapsed` never affects `md:w-[76px]`).
- §3 (localStorage persistence) → Task 3.
- §4 (header layout: stacked toggle when collapsed, logo always has an accessible name, icon swap not rotation) → Task 2 Step 3 (`lg:flex-row lg:justify-between` only when `!collapsed`; `aria-label="Zelo"` on the `Link`; `ChevronLeft`/`ChevronRight` swap).
- §5 (aside/header/nav structure) → Task 1 Step 3.
- §6 (widths/visibility classes) → Task 1 Step 3 (base widths) + Task 2 Step 3 (collapse override).
- §7 (a11y/motion: 44px target, states, aria-pressed, motion-safe transition, spacing reuse) → Task 2 Step 3 (`min-h-11 min-w-11`, `hover:text-brand`, `focus-visible:ring-2 focus-visible:ring-brand`, `aria-pressed`, `transition-[width] duration-200` covered by the project's existing global `prefers-reduced-motion` rule, `px-2`/`gap-1`/`gap-3`/`py-6` reused from the incumbent file).
- §8 (tests) → covered by all three tasks' test steps.

**Placeholder scan:** No TBD/TODO/"handle appropriately" — every step has literal code.

**Type consistency:** `collapsed: boolean` and `setCollapsed: Dispatch<SetStateAction<boolean>>` (from `useState`) are used identically across Tasks 2 and 3; `COLLAPSED_STORAGE_KEY` / `readStoredCollapsed` are defined once in Task 3 and not referenced elsewhere. `routes.home` (string) matches its existing type in `routes.ts`. No signature drift between tasks.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-09-sidebar-collapse-and-brand-header.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
