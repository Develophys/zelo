# Responsive Tablet/Desktop UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Zelo PWA (`apps/web`) usable on tablet and desktop screens — persistent sidebar navigation and a centered reading column for the médico flow, a multi-column grid for the manager dashboard — with zero visual change below 768px.

**Architecture:** A single Tailwind breakpoint (`md:` = 768px, `lg:` = 1024px refines the manager grid only) drives everything via CSS classes — no JS media-query logic, no device detection. A shared `nav-tabs.ts` config feeds both the existing mobile `BottomNav` and a new `Sidebar` component so the two can never drift apart. `PhoneShell` gains two independent boolean props (`nav`, `centered`) that every page opts into individually, so the rollout is mechanical and each page's diff is obviously correct.

**Tech Stack:** React 19, Vite, Tailwind CSS v4 (`@theme` tokens in `apps/web/src/app/index.css`), React Router 7, Vitest + Testing Library.

## Global Constraints

- Below 768px, **zero visual/behavioral change** anywhere in the app — every existing test must keep passing unmodified unless a task explicitly says otherwise.
- Breakpoints are the built-in Tailwind defaults (`md:` 768px, `lg:` 1024px) — no `tailwind.config` changes needed, `apps/web/src/app/index.css` has no custom breakpoint overrides today.
- No new dependencies.
- All new UI copy is PT-BR, matching the rest of the app.
- Source spec: `docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md`.

---

### Task 1: Extract shared `nav-tabs.ts` config, refactor `BottomNav` to consume it

**Files:**
- Create: `apps/web/src/presentation/layout/nav-tabs.ts`
- Create: `apps/web/src/presentation/layout/nav-tabs.test.ts`
- Modify: `apps/web/src/presentation/layout/BottomNav.tsx`

**Interfaces:**
- Produces: `NavTabId` (type: `"home" | "checkin" | "chat" | "you"`), `NavTab` (interface: `{ id: NavTabId; label: string; icon: ComponentType<{ size?: number }>; route: string }`), `NAV_TABS: NavTab[]` — all from `apps/web/src/presentation/layout/nav-tabs.ts`.

- [ ] **Step 1: Write the failing test for `nav-tabs.ts`**

```ts
// apps/web/src/presentation/layout/nav-tabs.test.ts
import { describe, expect, it } from "vitest";
import { NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";

describe("NAV_TABS", () => {
  it("defines exactly the four médico destinations, in order, with their routes", () => {
    expect(NAV_TABS.map((tab) => tab.id)).toEqual(["home", "checkin", "chat", "you"]);
    expect(NAV_TABS.map((tab) => tab.label)).toEqual(["Início", "Check-in", "Conversar", "Você"]);
    expect(NAV_TABS.map((tab) => tab.route)).toEqual([routes.home, routes.assessment, routes.chat, routes.you]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web test -- nav-tabs.test.ts`
Expected: FAIL — `Cannot find module './nav-tabs'`

- [ ] **Step 3: Create `nav-tabs.ts`**

```ts
// apps/web/src/presentation/layout/nav-tabs.ts
import type { ComponentType } from "react";
import { Home, ClipboardCheck, MessageCircle, UserRound } from "lucide-react";
import { routes } from "@/presentation/lib/routes";

export type NavTabId = "home" | "checkin" | "chat" | "you";

export interface NavTab {
  id: NavTabId;
  label: string;
  icon: ComponentType<{ size?: number }>;
  route: string;
}

// Single source of truth for the médico's 4 primary destinations — consumed by
// both BottomNav (mobile, only shown on HomePage) and Sidebar (tablet/desktop,
// persistent) so the two navs can never list different destinations.
export const NAV_TABS: NavTab[] = [
  { id: "home", label: "Início", icon: Home, route: routes.home },
  { id: "checkin", label: "Check-in", icon: ClipboardCheck, route: routes.assessment },
  { id: "chat", label: "Conversar", icon: MessageCircle, route: routes.chat },
  { id: "you", label: "Você", icon: UserRound, route: routes.you },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/web test -- nav-tabs.test.ts`
Expected: PASS

- [ ] **Step 5: Refactor `BottomNav.tsx` to consume `NAV_TABS` instead of its local `TABS` array**

Replace the top of `apps/web/src/presentation/layout/BottomNav.tsx` (current lines 1-16):

```tsx
import { NAV_TABS, type NavTabId } from "./nav-tabs";

interface BottomNavProps {
  active: NavTabId;
  onNavigate: (tab: NavTabId) => void;
}

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="flex flex-none justify-around border-t border-surface-brand bg-surface px-2 pb-6 pt-3">
      {NAV_TABS.map(({ id, label, icon: Icon }) => {
```

Everything else in the file (the `.map` body, closing tags) stays exactly as-is — only the `TABS` array/`Tab` type declarations are removed and the two references (`TABS.map` → `NAV_TABS.map`, `Tab` → `NavTabId`) are updated.

- [ ] **Step 6: Run the existing `BottomNav.test.tsx` to confirm no regression**

Run: `pnpm --filter @zelo/web test -- BottomNav.test.tsx`
Expected: PASS (all 3 existing tests, unmodified)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/presentation/layout/nav-tabs.ts apps/web/src/presentation/layout/nav-tabs.test.ts apps/web/src/presentation/layout/BottomNav.tsx
git commit -m "refactor(web): extract shared nav-tabs config out of BottomNav"
```

---

### Task 2: Build the `Sidebar` component

**Files:**
- Create: `apps/web/src/presentation/layout/Sidebar.tsx`
- Create: `apps/web/src/presentation/layout/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `NAV_TABS: NavTab[]`, `NavTabId` from `apps/web/src/presentation/layout/nav-tabs.ts` (Task 1).
- Produces: `Sidebar` (no props — a self-contained component reading the current route via `useLocation()` and navigating via `useNavigate()`), from `apps/web/src/presentation/layout/Sidebar.tsx`.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/presentation/layout/Sidebar.test.tsx
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
    expect(screen.getByRole("button", { name: "Conversar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Início" })).not.toHaveAttribute("aria-current");
  });

  it("navigates to the tapped destination's route", async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole("button", { name: "Conversar" }));
    expect(screen.getByRole("button", { name: "Conversar" })).toHaveAttribute("aria-current", "page");
  });

  it("is hidden below the tablet breakpoint and visible from it up", () => {
    renderAt(routes.home);
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toHaveClass("hidden", "md:flex");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/web test -- Sidebar.test.tsx`
Expected: FAIL — `Cannot find module './Sidebar'`

- [ ] **Step 3: Implement `Sidebar.tsx`**

```tsx
// apps/web/src/presentation/layout/Sidebar.tsx
import { useLocation, useNavigate } from "react-router";
import { NAV_TABS, type NavTabId } from "./nav-tabs";

function activeTabFor(pathname: string): NavTabId | null {
  return NAV_TABS.find((tab) => tab.route === pathname)?.id ?? null;
}

// Persistent navigation for tablet/desktop (≥768px) — shown only on the 4
// médico destination pages (Home, Check-in, Conversar, Você), never on
// focused-flow screens (assessment in progress, crisis, consent, etc.), per
// docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md §3.
// Below 768px this renders nothing visible (`hidden md:flex`); BottomNav
// remains the mobile nav, unchanged.
export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = activeTabFor(location.pathname);

  return (
    <nav
      aria-label="Navegação principal"
      className="hidden flex-none flex-col gap-1 border-r border-surface-brand bg-surface px-2 py-6 md:flex md:w-[76px] lg:w-[220px]"
    >
      {NAV_TABS.map(({ id, label, icon: Icon, route }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => navigate(route)}
            className={`flex min-h-[44px] items-center justify-center gap-3 rounded-input px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:justify-start ${
              isActive ? "bg-surface-brand text-brand" : "text-faint"
            }`}
          >
            <Icon size={22} />
            <span className="hidden font-sans text-[14px] font-semibold lg:inline">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web test -- Sidebar.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/Sidebar.tsx apps/web/src/presentation/layout/Sidebar.test.tsx
git commit -m "feat(web): add persistent Sidebar nav for tablet/desktop"
```

---

### Task 3: Extend `PhoneShell` with `nav` and `centered` props

**Files:**
- Modify: `apps/web/src/presentation/layout/PhoneShell.tsx`
- Modify: `apps/web/src/presentation/layout/PhoneShell.test.tsx`

**Interfaces:**
- Consumes: `Sidebar` (no props) from `apps/web/src/presentation/layout/Sidebar.tsx` (Task 2).
- Produces: `PhoneShellProps` gains `nav?: boolean` (default `false` — renders `<Sidebar />` to the left from 768px up, and hides any `footer` from 768px up) and `centered?: boolean` (default `false` — constrains `phone-shell-body` to a ~680px column, centered, from 768px up). Both are independent and both default to today's exact behavior when omitted.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/presentation/layout/PhoneShell.test.tsx`: add `import { MemoryRouter } from "react-router";` to the existing import block at the top of the file (alongside the existing `vitest`/`@testing-library/react`/`./PhoneShell` imports). Keep all 4 existing `it(...)` blocks inside the existing `describe("PhoneShell", ...)` exactly as they are — do not touch them. Then append these two new top-level `describe` blocks at the end of the file, after the existing `describe("PhoneShell", ...)` closes:

```tsx
describe("PhoneShell nav mode", () => {
  it("does not render a Sidebar when nav is unset", () => {
    render(<PhoneShell>content</PhoneShell>);
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();
  });

  it("renders the Sidebar when nav is set", () => {
    render(
      <MemoryRouter>
        <PhoneShell nav>content</PhoneShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
  });

  it("hides the footer at the tablet breakpoint when nav is set", () => {
    render(
      <MemoryRouter>
        <PhoneShell nav footer={<div data-testid="my-footer">nav</div>}>
          content
        </PhoneShell>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("my-footer").parentElement).toHaveClass("md:hidden");
  });
});

describe("PhoneShell centered mode", () => {
  it("does not constrain body width when centered is unset", () => {
    render(<PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-body")).not.toHaveClass("md:max-w-[680px]");
  });

  it("constrains and centers the body from the tablet breakpoint when centered is set", () => {
    render(<PhoneShell centered>content</PhoneShell>);
    const body = screen.getByTestId("phone-shell-body");
    expect(body).toHaveClass("md:max-w-[680px]", "md:mx-auto");
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @zelo/web test -- PhoneShell.test.tsx`
Expected: FAIL — new tests fail (`nav`/`centered` props don't exist yet), 4 pre-existing tests still PASS

- [ ] **Step 3: Implement the extended `PhoneShell.tsx`**

```tsx
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

interface PhoneShellProps {
  children: ReactNode;
  bleed?: boolean;
  footer?: ReactNode;
  bg?: "canvas" | "canvas-alt" | "surface";
  // Renders a persistent Sidebar to the left from 768px up, and hides `footer`
  // from 768px up (the Sidebar replaces it). Only the 4 médico destination
  // pages pass this — see nav-tabs.ts and
  // docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md §3.
  nav?: boolean;
  // Constrains content to a ~680px centered reading column from 768px up.
  // Independent of `nav` — focused-flow pages (assessment in progress,
  // crisis, consent, etc.) set this without `nav`. See design spec §4.
  centered?: boolean;
}

const BG_CLASS: Record<NonNullable<PhoneShellProps["bg"]>, string> = {
  canvas: "bg-canvas",
  "canvas-alt": "bg-canvas-alt",
  surface: "bg-surface",
};

export function PhoneShell({
  children,
  bleed = false,
  footer,
  bg = "canvas",
  nav = false,
  centered = false,
}: PhoneShellProps) {
  const column = (
    <div data-testid="phone-shell-root" className={`flex h-full min-h-screen flex-1 flex-col ${BG_CLASS[bg]}`}>
      <div
        data-testid="phone-shell-body"
        className={`no-scrollbar flex-1 overflow-y-auto ${bleed ? "" : "px-6"} ${
          centered ? "md:mx-auto md:w-full md:max-w-[680px]" : ""
        }`}
      >
        {children}
      </div>
      {footer && <div className={`flex-none ${nav ? "md:hidden" : ""}`}>{footer}</div>}
    </div>
  );

  if (!nav) {
    return column;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {column}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they all pass**

Run: `pnpm --filter @zelo/web test -- PhoneShell.test.tsx`
Expected: PASS (4 pre-existing + 5 new = 9 tests)

- [ ] **Step 5: Run the full web test suite to confirm no regression elsewhere**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — every page currently rendering `<PhoneShell>` without `nav`/`centered` gets the exact same output as before (both new props default to `false`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/layout/PhoneShell.tsx apps/web/src/presentation/layout/PhoneShell.test.tsx
git commit -m "feat(web): add nav and centered responsive modes to PhoneShell"
```

---

### Task 4: Wire `nav` + `centered` into the 4 médico destination pages

**Files:**
- Modify: `apps/web/src/presentation/pages/HomePage.tsx:75`
- Modify: `apps/web/src/presentation/pages/AssessmentSelectPage.tsx:15`
- Modify: `apps/web/src/presentation/pages/ChatPage.tsx:17`
- Modify: `apps/web/src/presentation/pages/YouPage.tsx:25`

**Interfaces:**
- Consumes: `PhoneShellProps.nav`, `PhoneShellProps.centered` from Task 3. No new interfaces produced — this task only changes call sites.

- [ ] **Step 1: Update the four call sites**

`apps/web/src/presentation/pages/HomePage.tsx:75` — change:
```tsx
    <PhoneShell footer={<BottomNav active="home" onNavigate={handleNavigate} />}>
```
to:
```tsx
    <PhoneShell nav centered footer={<BottomNav active="home" onNavigate={handleNavigate} />}>
```

`apps/web/src/presentation/pages/AssessmentSelectPage.tsx:15` — change:
```tsx
    <PhoneShell>
```
to:
```tsx
    <PhoneShell nav centered>
```

`apps/web/src/presentation/pages/ChatPage.tsx:17` — change:
```tsx
    <PhoneShell bg="surface">
```
to:
```tsx
    <PhoneShell nav centered bg="surface">
```

`apps/web/src/presentation/pages/YouPage.tsx:25` — change:
```tsx
    <PhoneShell>
```
to:
```tsx
    <PhoneShell nav centered>
```

- [ ] **Step 2: Run each page's existing test file to confirm no regression**

Run: `pnpm --filter @zelo/web test -- HomePage.test.tsx AssessmentSelectPage.test.tsx ChatPage.test.tsx YouPage.test.tsx`
Expected: PASS — these tests assert on text content and click behavior, not on `PhoneShell`'s exact class list, so adding `nav`/`centered` doesn't affect them. `HomePage.test.tsx` in particular must still find `BottomNav`'s rendered output unchanged (it's still passed as `footer`, just now also wrapped in a `md:hidden` div by `PhoneShell` — invisible to a jsdom test, which doesn't evaluate media queries).

- [ ] **Step 3: Run the full web test suite**

Run: `pnpm --filter @zelo/web test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/presentation/pages/HomePage.tsx apps/web/src/presentation/pages/AssessmentSelectPage.tsx apps/web/src/presentation/pages/ChatPage.tsx apps/web/src/presentation/pages/YouPage.tsx
git commit -m "feat(web): show persistent sidebar nav on the 4 médico destination pages at md+"
```

---

### Task 5: Wire `centered` into the remaining médico-facing pages

**Files:**
- Modify: `apps/web/src/presentation/pages/SplashPage.tsx:59`
- Modify: `apps/web/src/presentation/pages/PrivacyPage.tsx:18`
- Modify: `apps/web/src/presentation/pages/ConsentPage.tsx:29`
- Modify: `apps/web/src/presentation/pages/Phq9AssessmentPage.tsx:55`
- Modify: `apps/web/src/presentation/pages/Gad7AssessmentPage.tsx:55`
- Modify: `apps/web/src/presentation/pages/AssessmentResultPage.tsx:51`
- Modify: `apps/web/src/presentation/pages/CrisisOfferPage.tsx:18`
- Modify: `apps/web/src/presentation/pages/CrisisAcceptPage.tsx:23`
- Modify: `apps/web/src/presentation/pages/CrisisDeclinePage.tsx:15`
- Modify: `apps/web/src/presentation/pages/PeersPage.tsx:18`

**Interfaces:**
- Consumes: `PhoneShellProps.centered` from Task 3. No `nav` on any of these — per design spec §3, focused-flow screens stay nav-free at every width. `PeersPage` isn't explicitly named in the design spec's focused-flow list, but it's a médico-facing screen reached from Home (not one of the 4 tab destinations) — the same "centered column, no persistent nav" treatment spec §3/§4 describe for every other non-destination médico screen applies here for consistency.

This is one mechanical, identical one-line change repeated across 10 files — batched into a single task since none of these edits has independent logic a reviewer could reject separately from its neighbors.

- [ ] **Step 1: Update all 10 call sites**

`apps/web/src/presentation/pages/SplashPage.tsx:59` — change:
```tsx
    <PhoneShell bleed>
```
to:
```tsx
    <PhoneShell bleed centered>
```

For each of the remaining 9 files, change:
```tsx
    <PhoneShell>
```
to:
```tsx
    <PhoneShell centered>
```
in: `PrivacyPage.tsx:18`, `ConsentPage.tsx:29`, `Phq9AssessmentPage.tsx:55`, `Gad7AssessmentPage.tsx:55`, `AssessmentResultPage.tsx:51`, `CrisisOfferPage.tsx:18`, `CrisisAcceptPage.tsx:23`, `CrisisDeclinePage.tsx:15`, `PeersPage.tsx:18`.

- [ ] **Step 2: Run the full web test suite**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — every one of these tests renders and asserts on text/behavior, none assert `PhoneShell`'s exact class list.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/presentation/pages/SplashPage.tsx apps/web/src/presentation/pages/PrivacyPage.tsx apps/web/src/presentation/pages/ConsentPage.tsx apps/web/src/presentation/pages/Phq9AssessmentPage.tsx apps/web/src/presentation/pages/Gad7AssessmentPage.tsx apps/web/src/presentation/pages/AssessmentResultPage.tsx apps/web/src/presentation/pages/CrisisOfferPage.tsx apps/web/src/presentation/pages/CrisisAcceptPage.tsx apps/web/src/presentation/pages/CrisisDeclinePage.tsx apps/web/src/presentation/pages/PeersPage.tsx
git commit -m "feat(web): center content column on remaining médico screens at md+"
```

---

### Task 6: Tablet/desktop type scale

**Files:**
- Modify: `apps/web/src/app/index.css`
- Modify: `docs/superpowers/specs/design-tokens.md`

**Interfaces:** None — pure CSS custom-property override, no component/prop changes, nothing for later tasks to consume.

- [ ] **Step 1: Add the responsive override block to `index.css`**

Add after the closing `}` of the `@theme { ... }` block (before `@layer base`) in `apps/web/src/app/index.css`:

```css
/* Tablet/desktop type scale (design-tokens.md §2) — overrides the same custom
   properties the @theme block above defines, so every `text-h1`/`text-h2`/
   `text-body`/`text-label`/`text-body-strong` utility picks this up
   automatically from 768px up, with zero component changes. `score` (64px)
   is deliberately not bumped — see the design spec, §4. */
@media (width >= 768px) {
  :root {
    --text-h1: 32px;
    --text-h2: 26px;
    --text-body: 16px;
    --text-body-strong: 16px;
    --text-label: 15px;
  }
}
```

- [ ] **Step 2: Manually verify in the browser**

Run: `pnpm --filter @zelo/web dev`, open the app, resize the viewport across 375px / 768px / 1280px on any page with an `h1` (e.g. `/you`). Expected: heading/body text size visibly steps up at 768px and stays that size at 1280px; below 768px it's pixel-identical to before this task.

*(No automated test for this step: jsdom, which the existing Vitest suite runs under, doesn't evaluate real CSS media queries or computed font sizes — an automated assertion here would be hollow. The existing snapshot-free, text-content-based test suite is unaffected because no component or className changed.)*

- [ ] **Step 3: Document the new scale in `design-tokens.md`**

Add a new section to `docs/superpowers/specs/design-tokens.md`, immediately after the existing "### Type scale (px / line-height / family)" table (which stays as the mobile/default scale):

```markdown
### Tablet/Desktop scale (≥768px)

Same tokens as above, overridden via a `@media (width >= 768px)` block in `apps/web/src/app/index.css` rather than a parallel set of names — every `text-h1`/`text-h2`/`text-body`/`text-label`/`text-body-strong` utility picks up the new value automatically above 768px.

| Token | Mobile (< 768px) | Tablet/Desktop (≥ 768px) |
|---|---|---|
| `h1` | 28px | 32px |
| `h2` | 24px | 26px |
| `body` | 15px | 16px |
| `body-strong` | 15px | 16px |
| `label` | 14px | 15px |
| `score` | 64px | 64px (unchanged — already large enough; a bump here would unbalance `ResultBandCard`/`ScoreDial`) |
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/index.css docs/superpowers/specs/design-tokens.md
git commit -m "feat(web): bump type scale one step from the tablet breakpoint up"
```

---

### Task 7: Manager dashboard responsive grid

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:** None — pure layout/className change inside one already-self-contained page component. Does not touch `PhoneShell`, `nav`, or `centered` (per design spec §5, the manager flow gets its own grid, not the médico centered-column treatment).

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx` (after the existing tests):

```tsx
  it("lays out the three KPI cards in a responsive grid", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByTestId("kpi-grid")).toHaveClass("grid-cols-2", "md:grid-cols-3");
  });

  it("lays out trend and segments in a responsive grid", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByTestId("trend-segments-grid")).toHaveClass("lg:grid-cols-[2fr_1fr]");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/web test -- ManagerDashboardPage.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="kpi-grid"]` (and same for `trend-segments-grid`)

- [ ] **Step 3: Restructure the KPI row (lines 101-130) into one responsive grid**

Replace the two separate KPI wrapper `<div>`s (current lines 101-119 and 121-130) with a single grid container. Current:

```tsx
        <div className="mt-5 flex gap-3">
          {isLoading ? (
            <>
              <KpiCardSkeleton className="flex-1" />
              <KpiCardSkeleton className="flex-1" />
            </>
          ) : (
            <>
              <Card className="flex-1 text-center">
                <p className="font-serif text-[30px] text-warn">{Math.round(overallConcerningRate * 100)}%</p>
                <p className="text-caption text-muted">sinais de burnout na equipe</p>
              </Card>
              <Card className="flex-1 text-center">
                <p className="font-serif text-[30px] text-brand">{checkInsLast4Weeks}</p>
                <p className="text-caption text-muted">questionários respondidos (4 semanas)</p>
              </Card>
            </>
          )}
        </div>

        <div className="mt-3">
          {isLoading ? (
            <KpiCardSkeleton />
          ) : (
            <Card className="text-center">
              <p className="font-serif text-[30px] text-brand">{Math.round(followUpResponseRate * 100)}%</p>
              <p className="text-caption text-muted">taxa de resposta do follow-up</p>
            </Card>
          )}
        </div>
```

New:

```tsx
        <div data-testid="kpi-grid" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          {isLoading ? (
            <>
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton className="col-span-2 md:col-span-1" />
            </>
          ) : (
            <>
              <Card className="text-center">
                <p className="font-serif text-[30px] text-warn">{Math.round(overallConcerningRate * 100)}%</p>
                <p className="text-caption text-muted">sinais de burnout na equipe</p>
              </Card>
              <Card className="text-center">
                <p className="font-serif text-[30px] text-brand">{checkInsLast4Weeks}</p>
                <p className="text-caption text-muted">questionários respondidos (4 semanas)</p>
              </Card>
              <Card className="col-span-2 text-center md:col-span-1">
                <p className="font-serif text-[30px] text-brand">{Math.round(followUpResponseRate * 100)}%</p>
                <p className="text-caption text-muted">taxa de resposta do follow-up</p>
              </Card>
            </>
          )}
        </div>
```

- [ ] **Step 4: Restructure the trend/segments row (lines 132-173) into one responsive grid**

Replace the two separate `mt-[14px]` wrapper `<div>`s around the trend card and segments card with:

```tsx
        <div data-testid="trend-segments-grid" className="mt-[14px] grid gap-[14px] lg:grid-cols-[2fr_1fr]">
          <div>
            {isLoading ? (
              <TrendCardSkeleton />
            ) : (
              <Card>
                <div className="flex items-center justify-between">
                  <p className="text-body font-extrabold text-ink">Tendência geral</p>
                  <p className="font-mono text-[12px] text-muted-2">últimas 6 semanas</p>
                </div>
                <div className="mt-3 flex h-14 items-end gap-2">
                  {bars.map((height, index) => (
                    <div key={index} data-testid="trend-bar" className="w-full rounded-md bg-brand" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </Card>
            )}
          </div>
          <div>
            {isLoading ? (
              <SegmentsCardSkeleton />
            ) : (
              <Card>
                <p className="text-body font-extrabold text-ink">Sinais por setor</p>
                <div className="mt-3 flex flex-col gap-3">
                  {segments.map((segment) => (
                    <div key={segment.label}>
                      <div className="flex items-center justify-between text-label text-ink-2">
                        <span>{segment.label}</span>
                        <span className="font-mono text-[12px] text-muted-2">
                          {segment.value}% · n={segment.n}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-pill bg-canvas-alt">
                        <div className="h-full rounded-pill bg-brand" style={{ width: `${segment.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
```

The "Análise com IA" block (current lines 175-209) is unchanged — it already sits below this grid as its own full-width block, matching design spec §5 as-is.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web test -- ManagerDashboardPage.test.tsx`
Expected: PASS — all pre-existing tests plus the 2 new ones (12 total)

- [ ] **Step 6: Run the full web test suite**

Run: `pnpm --filter @zelo/web test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git commit -m "feat(web): responsive grid for manager dashboard KPIs, trend and segments"
```

---

## Manual verification (all tasks complete)

Per design spec §7 — check these 3 reference widths after Task 7:

- **375px** (celular): pixel-identical to before this plan, on every page.
- **768px** (tablet retrato): Sidebar renders as an icon-only rail on the 4 destination pages; every médico screen's content is centered in the ~680px column; manager KPI cards are 3-across; type scale has stepped up.
- **1280px** (desktop): Sidebar shows icon + label; manager trend/segments sit side by side.
