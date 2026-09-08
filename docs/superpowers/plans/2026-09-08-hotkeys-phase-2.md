# Hotkeys Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll the already-proven Phase 1 hotkey infrastructure (`useHotkey`, `HotkeyListener`,
`HotkeyHelpModal`, the settings toggle) out to every remaining screen: the gestor (manager)
persona's nav and its three admin CRUD pages, two of its single-action pages, the peer-partner
persona's nav, and its inbox page's time-boxed Aceitar/Recusar pair.

**Architecture:** No new infrastructure — every task is `useHotkey(key, handler, label, {
enabled })` calls added next to handlers that already exist, following Phase 1's exact
conventions (spelled-out nav-hotkey hooks per Rules of Hooks, `isAnyModalOpen`-style suppression
via `enabled`, hotkeys always call the same handler a button already calls). Two small new files
are needed only because the peer-partner persona has no central nav config yet (Phase 1 only
built one for the médico).

**Tech Stack:** React 19, TypeScript, Zustand, Vitest + @testing-library/react + user-event,
react-router.

**Spec:** `docs/superpowers/specs/2026-09-08-hotkeys-design.md` (Phase 1's spec; this plan is the
"Extension points" section it already anticipated — no new spec document, since nothing
architectural changed). Approved key assignments (from chat brainstorming, not a written spec)
are copied into each task below.

## Global Constraints

- Every hotkey is a single bare key (already enforced by `HotkeyListener` — no per-task work
  needed to satisfy this, just don't invent modifier combos).
- A hotkey's handler must be the exact same function/expression the equivalent button's own
  `onClick` already calls. Never a new handler, never a shortcut that skips a confirmation step.
- **Manager nav reserves this key set, mounted on every manager-persona page:** `t` (Tendências),
  `n` (Notificações), `h` (Análises com IA), `m` (Metodologia), `g` (Gestores), `s` (Setores),
  `p` (Pares anônimos), `c` (Configurações). Every manager-persona page-level hotkey in this plan
  avoids these eight letters.
- `Sair` (logout) never gets a hotkey, on any nav, in this phase — confirmed with the user
  (too disruptive for a bare key to trigger by accident).
- `Tentar novamente` (retry-after-failure) buttons never get a hotkey, on any page, in this
  phase — confirmed with the user (rare failure-recovery path, low value for a dedicated key).
- Per-row action buttons (e.g. "Editar {nome}" on a specific table row, "Reenviar convite de
  {nome}") stay mouse/tap-only — same limitation Phase 1 already accepted for
  `AdminInstitutionsPage`'s row actions; a bare single-letter scheme has no sensible way to
  address "row 7" specifically.
- The three admin CRUD pages (Gestores/Setores/Pares) reuse the identical page-level key scheme
  since they are never mounted simultaneously (separate routes): `a` Adicionar (opens create
  modal), `e` Editar (bulk), `v` Salvar (edit modal), `u` Pausar (bulk), `i` Ativar (bulk), `x`
  Excluir (bulk — opens the delete-confirmation modal, never deletes directly).
- New Zustand-store-adjacent config files (`manager-nav.ts`, a new `peer-partner-nav.ts`) follow
  the existing plain-array-of-objects style already used by `nav-tabs.ts` and `manager-nav.ts` —
  no new state management pattern.

---

### Task 1: Manager nav hotkeys

**Files:**
- Modify: `apps/web/src/presentation/layout/manager-nav.ts`
- Create: `apps/web/src/presentation/layout/manager-nav.test.ts`
- Create: `apps/web/src/presentation/layout/useManagerNavHotkeys.ts`
- Create: `apps/web/src/presentation/layout/useManagerNavHotkeys.test.tsx`
- Modify: `apps/web/src/presentation/layout/ManagerSidebar.tsx`
- Create: `apps/web/src/presentation/layout/ManagerSidebar.test.tsx`
- Modify: `apps/web/src/presentation/layout/ManagerBottomNav.tsx`
- Create: `apps/web/src/presentation/layout/ManagerBottomNav.test.tsx`

**Interfaces:**
- Consumes: `useHotkey` (`apps/web/src/presentation/hooks/useHotkey.ts`, already built —
  `useHotkey(key: string, handler: () => void, label: string, options?: { scope?: "global" |
  "page"; enabled?: boolean }): void`), `useManagerSessionStore((s) => s.role)` (already exists,
  returns `"HOSPITAL_ADMIN" | "SECTOR_MANAGER" | null`).
- Produces: `ManagerNavItem` gains an optional `hotkey?: string` field. `useManagerNavHotkeys():
  void` — call it from a component already inside both a router context and
  `useManagerSessionStore`'s provider tree.

Key assignments: Tendências→`t`, Notificações→`n`, Análises com IA→`h` (matches the route name
`managerHistory`), Metodologia→`m`, Gestores→`g`, Setores→`s`, Pares anônimos→`p`,
Configurações→`c`. The three admin items (Gestores/Setores/Pares) only register while
`role === "HOSPITAL_ADMIN"` — mirrors `managerNavFor`'s own existing role filter, which already
hides those three destinations from a `SECTOR_MANAGER`.

**Note on `ManagerSidebar`/`ManagerBottomNav` mounting both at once:** exactly like Phase 1's
médico `Sidebar`/`BottomNav`, both manager nav components are mounted simultaneously (CSS
toggles which is visible, not React mount/unmount) whenever a manager page renders its shell.
Both calling `useManagerNavHotkeys()` independently is expected — Task 1 of Phase 1's
`hotkey.store.ts` already merges identical `(key, label, scope)` registrations via a reference
count instead of warning, so this needs no new handling.

- [ ] **Step 1: Write the failing tests**

Append to the existing `apps/web/src/presentation/layout/manager-nav.ts`'s test coverage by
creating `apps/web/src/presentation/layout/manager-nav.test.ts` (this file does not exist yet):

```ts
// apps/web/src/presentation/layout/manager-nav.test.ts
import { describe, expect, it } from "vitest";
import {
  MANAGER_ADMIN_NAV,
  MANAGER_METHODOLOGY_NAV,
  MANAGER_PRIMARY_NAV,
  MANAGER_SETTINGS_NAV,
} from "./manager-nav";

describe("manager nav hotkeys", () => {
  it("assigns a distinct single-letter hotkey to each of the three primary destinations", () => {
    const hotkeys = MANAGER_PRIMARY_NAV.map((item) => item.hotkey);
    expect(hotkeys).toEqual(["t", "n", "h"]);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
  });

  it("assigns Metodologia a hotkey that does not collide with the primary group", () => {
    expect(MANAGER_METHODOLOGY_NAV.hotkey).toBe("m");
  });

  it("assigns each admin destination a distinct hotkey, none colliding with the rest of the nav", () => {
    const hotkeys = MANAGER_ADMIN_NAV.map((item) => item.hotkey);
    expect(hotkeys).toEqual(["g", "s", "p"]);
    const reserved = new Set(["t", "n", "h", "m", ...hotkeys, "c"]);
    expect(reserved.size).toBe(8);
  });

  it("assigns Configurações a hotkey that does not collide with anything else in the nav", () => {
    expect(MANAGER_SETTINGS_NAV.hotkey).toBe("c");
  });
});
```

Create `apps/web/src/presentation/layout/useManagerNavHotkeys.test.tsx`:

```tsx
// apps/web/src/presentation/layout/useManagerNavHotkeys.test.tsx
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { useManagerNavHotkeys } from "./useManagerNavHotkeys";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";

function Probe() {
  useManagerNavHotkeys();
  return null;
}

function renderAt(pathname: string, role: "HOSPITAL_ADMIN" | "SECTOR_MANAGER" | null) {
  useManagerSessionStore.setState({ role });
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.manager} element={<><Probe /><p>Trends screen</p></>} />
        <Route path={routes.managerNotifications} element={<p>Notifications screen</p>} />
        <Route path={routes.managerHistory} element={<p>History screen</p>} />
        <Route path={routes.managerMethodology} element={<p>Methodology screen</p>} />
        <Route path={routes.managerAdminManagers} element={<p>Managers screen</p>} />
        <Route path={routes.managerAdminSectors} element={<p>Sectors screen</p>} />
        <Route path={routes.managerAdminPeers} element={<p>Peers screen</p>} />
        <Route path={routes.managerSettings} element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useManagerNavHotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers all eight destinations for a HOSPITAL_ADMIN", () => {
    renderAt(routes.manager, "HOSPITAL_ADMIN");
    const entries = useHotkeyStore.getState().entries;
    expect(entries.get("t")).toMatchObject({ label: "Tendências", scope: "global" });
    expect(entries.get("n")).toMatchObject({ label: "Notificações", scope: "global" });
    expect(entries.get("h")).toMatchObject({ label: "Análises com IA", scope: "global" });
    expect(entries.get("m")).toMatchObject({ label: "Como calculamos", scope: "global" });
    expect(entries.get("g")).toMatchObject({ label: "Gestores", scope: "global" });
    expect(entries.get("s")).toMatchObject({ label: "Setores", scope: "global" });
    expect(entries.get("p")).toMatchObject({ label: "Pares anônimos", scope: "global" });
    expect(entries.get("c")).toMatchObject({ label: "Configurações", scope: "global" });
  });

  it("does not register the three admin destinations for a SECTOR_MANAGER", () => {
    renderAt(routes.manager, "SECTOR_MANAGER");
    const entries = useHotkeyStore.getState().entries;
    expect(entries.has("g")).toBe(false);
    expect(entries.has("s")).toBe(false);
    expect(entries.has("p")).toBe(false);
    expect(entries.get("t")).toMatchObject({ label: "Tendências" });
  });

  it("navigates to Notificações when its hotkey fires", async () => {
    renderAt(routes.manager, "HOSPITAL_ADMIN");
    useHotkeyStore.getState().entries.get("n")?.handler();
    expect(await screen.findByText("Notifications screen")).toBeInTheDocument();
  });

  it("navigates to Gestores when its hotkey fires, for a HOSPITAL_ADMIN", async () => {
    renderAt(routes.manager, "HOSPITAL_ADMIN");
    useHotkeyStore.getState().entries.get("g")?.handler();
    expect(await screen.findByText("Managers screen")).toBeInTheDocument();
  });
});
```

Create `apps/web/src/presentation/layout/ManagerSidebar.test.tsx` (this file does not exist yet
— it will carry only the hotkey-related tests this task needs, not a retroactive full test
suite for the component):

```tsx
// apps/web/src/presentation/layout/ManagerSidebar.test.tsx
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ManagerSidebar } from "./ManagerSidebar";
import { HotkeyListener } from "./HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";

describe("ManagerSidebar hotkeys", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useHotkeyStore.setState({ entries: new Map() });
    useManagerSessionStore.setState({ role: "HOSPITAL_ADMIN" });
  });

  it("navigates to Setores when its hotkey fires", async () => {
    render(
      <MemoryRouter initialEntries={[routes.manager]}>
        <Routes>
          <Route path={routes.manager} element={<><ManagerSidebar /><HotkeyListener /></>} />
          <Route path={routes.managerAdminSectors} element={<p>Sectors screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: "s" });

    expect(await screen.findByText("Sectors screen")).toBeInTheDocument();
  });
});
```

Create `apps/web/src/presentation/layout/ManagerBottomNav.test.tsx` (same reasoning — no prior
test file exists):

```tsx
// apps/web/src/presentation/layout/ManagerBottomNav.test.tsx
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ManagerBottomNav } from "./ManagerBottomNav";
import { HotkeyListener } from "./HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";

describe("ManagerBottomNav hotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
    useManagerSessionStore.setState({ role: "HOSPITAL_ADMIN" });
  });

  it("navigates to Setores when its hotkey fires, even though the destination is only reachable via Mais on this nav", async () => {
    render(
      <MemoryRouter initialEntries={[routes.manager]}>
        <Routes>
          <Route path={routes.manager} element={<><ManagerBottomNav /><HotkeyListener /></>} />
          <Route path={routes.managerAdminSectors} element={<p>Sectors screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: "s" });

    expect(await screen.findByText("Sectors screen")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/presentation/layout/manager-nav.test.ts src/presentation/layout/useManagerNavHotkeys.test.tsx src/presentation/layout/ManagerSidebar.test.tsx src/presentation/layout/ManagerBottomNav.test.tsx`
Expected: FAIL — `manager-nav.test.ts` fails because no destination has a `hotkey` yet;
`useManagerNavHotkeys.test.tsx` fails because `./useManagerNavHotkeys` does not exist;
`ManagerSidebar.test.tsx`/`ManagerBottomNav.test.tsx` fail because pressing `s` does nothing yet.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/layout/manager-nav.ts`:

```ts
// Add hotkey?: string to the interface:
export interface ManagerNavItem {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  route: string;
  hotkey?: string;
}

// MANAGER_PRIMARY_NAV gains a hotkey per entry:
export const MANAGER_PRIMARY_NAV: readonly ManagerNavItem[] = [
  { id: 'trends', label: 'Tendências', icon: BarChart3, route: routes.manager, hotkey: 't' },
  { id: 'notifications', label: 'Notificações', icon: Bell, route: routes.managerNotifications, hotkey: 'n' },
  { id: 'insights', label: 'Análises com IA', icon: Brain, route: routes.managerHistory, hotkey: 'h' },
];

// MANAGER_METHODOLOGY_NAV:
export const MANAGER_METHODOLOGY_NAV: ManagerNavItem = {
  id: 'methodology',
  label: 'Como calculamos',
  icon: BookOpen,
  route: routes.managerMethodology,
  hotkey: 'm',
};

// MANAGER_ADMIN_NAV:
export const MANAGER_ADMIN_NAV: readonly ManagerNavItem[] = [
  { id: 'managers', label: 'Gestores', icon: User, route: routes.managerAdminManagers, hotkey: 'g' },
  { id: 'sectors', label: 'Setores', icon: Building2, route: routes.managerAdminSectors, hotkey: 's' },
  { id: 'peers', label: 'Pares anônimos', icon: Users, route: routes.managerAdminPeers, hotkey: 'p' },
];

// MANAGER_SETTINGS_NAV:
export const MANAGER_SETTINGS_NAV: ManagerNavItem = {
  id: 'settings',
  label: 'Configurações',
  icon: Settings,
  route: routes.managerSettings,
  hotkey: 'c',
};
```

Create `apps/web/src/presentation/layout/useManagerNavHotkeys.ts`:

```ts
import { useNavigate } from "react-router";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import {
  MANAGER_ADMIN_NAV,
  MANAGER_METHODOLOGY_NAV,
  MANAGER_PRIMARY_NAV,
  MANAGER_SETTINGS_NAV,
} from "./manager-nav";

/**
 * One useHotkey call per destination, spelled out rather than looped — same
 * reason as the médico's useNavHotkeys: React's rules of hooks forbid a
 * variable-length loop of hook calls, and this list is fixed at eight
 * entries by hand in manager-nav.ts.
 */
export function useManagerNavHotkeys(): void {
  const navigate = useNavigate();
  const role = useManagerSessionStore((state) => state.role);
  const isHospitalAdmin = role === "HOSPITAL_ADMIN";

  const trends = MANAGER_PRIMARY_NAV[0]!;
  const notifications = MANAGER_PRIMARY_NAV[1]!;
  const insights = MANAGER_PRIMARY_NAV[2]!;
  const managers = MANAGER_ADMIN_NAV[0]!;
  const sectors = MANAGER_ADMIN_NAV[1]!;
  const peers = MANAGER_ADMIN_NAV[2]!;

  useHotkey(trends.hotkey ?? "", () => navigate(trends.route), trends.label, {
    scope: "global",
    enabled: Boolean(trends.hotkey),
  });
  useHotkey(notifications.hotkey ?? "", () => navigate(notifications.route), notifications.label, {
    scope: "global",
    enabled: Boolean(notifications.hotkey),
  });
  useHotkey(insights.hotkey ?? "", () => navigate(insights.route), insights.label, {
    scope: "global",
    enabled: Boolean(insights.hotkey),
  });
  useHotkey(
    MANAGER_METHODOLOGY_NAV.hotkey ?? "",
    () => navigate(MANAGER_METHODOLOGY_NAV.route),
    MANAGER_METHODOLOGY_NAV.label,
    { scope: "global", enabled: Boolean(MANAGER_METHODOLOGY_NAV.hotkey) },
  );
  useHotkey(managers.hotkey ?? "", () => navigate(managers.route), managers.label, {
    scope: "global",
    enabled: isHospitalAdmin && Boolean(managers.hotkey),
  });
  useHotkey(sectors.hotkey ?? "", () => navigate(sectors.route), sectors.label, {
    scope: "global",
    enabled: isHospitalAdmin && Boolean(sectors.hotkey),
  });
  useHotkey(peers.hotkey ?? "", () => navigate(peers.route), peers.label, {
    scope: "global",
    enabled: isHospitalAdmin && Boolean(peers.hotkey),
  });
  useHotkey(
    MANAGER_SETTINGS_NAV.hotkey ?? "",
    () => navigate(MANAGER_SETTINGS_NAV.route),
    MANAGER_SETTINGS_NAV.label,
    { scope: "global", enabled: Boolean(MANAGER_SETTINGS_NAV.hotkey) },
  );
}
```

Edit `apps/web/src/presentation/layout/ManagerSidebar.tsx` — add the import and call the hook
at the top of the component body:

```tsx
import { useManagerNavHotkeys } from './useManagerNavHotkeys';
// … (existing imports unchanged)

export function ManagerSidebar({ className = '' }: ManagerSidebarProps) {
  useManagerNavHotkeys();
  const navigate = useNavigate();
  // … rest unchanged
```

Edit `apps/web/src/presentation/layout/ManagerBottomNav.tsx` the same way:

```tsx
import { useManagerNavHotkeys } from './useManagerNavHotkeys';
// … (existing imports unchanged)

export function ManagerBottomNav({ className = '' }: ManagerBottomNavProps) {
  useManagerNavHotkeys();
  const navigate = useNavigate();
  // … rest unchanged
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run src/presentation/layout/manager-nav.test.ts src/presentation/layout/useManagerNavHotkeys.test.tsx src/presentation/layout/ManagerSidebar.test.tsx src/presentation/layout/ManagerBottomNav.test.tsx`
Expected: PASS — 4 tests in `manager-nav.test.ts`, 4 in `useManagerNavHotkeys.test.tsx`, 1 in
`ManagerSidebar.test.tsx`, 1 in `ManagerBottomNav.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/manager-nav.ts apps/web/src/presentation/layout/manager-nav.test.ts apps/web/src/presentation/layout/useManagerNavHotkeys.ts apps/web/src/presentation/layout/useManagerNavHotkeys.test.tsx apps/web/src/presentation/layout/ManagerSidebar.tsx apps/web/src/presentation/layout/ManagerSidebar.test.tsx apps/web/src/presentation/layout/ManagerBottomNav.tsx apps/web/src/presentation/layout/ManagerBottomNav.test.tsx
git commit -m "feat(web): navigate the manager panel with a keypress"
```

---

### Task 2: Peer-partner nav hotkeys

**Files:**
- Create: `apps/web/src/presentation/layout/peer-partner-nav.ts`
- Create: `apps/web/src/presentation/layout/peer-partner-nav.test.ts`
- Create: `apps/web/src/presentation/layout/usePeerPartnerNavHotkeys.ts`
- Create: `apps/web/src/presentation/layout/usePeerPartnerNavHotkeys.test.tsx`
- Modify: `apps/web/src/presentation/layout/PeerPartnerBottomNav.tsx`
- Modify: `apps/web/src/presentation/layout/PeerPartnerBottomNav.test.tsx`

**Interfaces:**
- Consumes: `useHotkey` (Task 1 of Phase 1, already built).
- Produces: `usePeerPartnerNavHotkeys(): void` — call it from a component inside a router
  context. `PEER_PARTNER_NAV: readonly { id: string; label: string; route: string; hotkey: string
  }[]` — a tiny new central config, since none exists yet for this persona (its bottom nav
  currently hardcodes its three slots inline).

Key assignments: Início→`i`, Configurações→`c`. `Sair` (logout) gets no hotkey, same reasoning
as Task 1. This is a standalone two-item nav for its own persona — it does not share a key
reservation with the manager nav from Task 1, since a médico/manager/peer-partner session never
has more than one persona's nav mounted at once.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/presentation/layout/peer-partner-nav.test.ts`:

```ts
// apps/web/src/presentation/layout/peer-partner-nav.test.ts
import { describe, expect, it } from "vitest";
import { PEER_PARTNER_NAV } from "./peer-partner-nav";
import { routes } from "@/presentation/lib/routes";

describe("PEER_PARTNER_NAV", () => {
  it("defines Início and Configurações, in order, with distinct hotkeys and their routes", () => {
    expect(PEER_PARTNER_NAV.map((item) => item.label)).toEqual(["Início", "Configurações"]);
    expect(PEER_PARTNER_NAV.map((item) => item.route)).toEqual([
      routes.peerPartnerInbox,
      routes.peerPartnerSettings,
    ]);
    const hotkeys = PEER_PARTNER_NAV.map((item) => item.hotkey);
    expect(hotkeys).toEqual(["i", "c"]);
    expect(new Set(hotkeys).size).toBe(2);
  });
});
```

Create `apps/web/src/presentation/layout/usePeerPartnerNavHotkeys.test.tsx`:

```tsx
// apps/web/src/presentation/layout/usePeerPartnerNavHotkeys.test.tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { usePeerPartnerNavHotkeys } from "./usePeerPartnerNavHotkeys";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { routes } from "@/presentation/lib/routes";

function Probe() {
  usePeerPartnerNavHotkeys();
  return null;
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.peerPartnerInbox} element={<><Probe /><p>Inbox screen</p></>} />
        <Route path={routes.peerPartnerSettings} element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("usePeerPartnerNavHotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers both destinations", () => {
    renderAt(routes.peerPartnerInbox);
    const entries = useHotkeyStore.getState().entries;
    expect(entries.get("i")).toMatchObject({ label: "Início", scope: "global" });
    expect(entries.get("c")).toMatchObject({ label: "Configurações", scope: "global" });
  });

  it("navigates to Configurações when its hotkey fires", async () => {
    renderAt(routes.peerPartnerInbox);
    useHotkeyStore.getState().entries.get("c")?.handler();
    expect(await screen.findByText("Settings screen")).toBeInTheDocument();
  });
});
```

Change `apps/web/src/presentation/layout/PeerPartnerBottomNav.test.tsx`'s imports and append a
new describe block. Its current imports are:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { PeerPartnerBottomNav } from "./PeerPartnerBottomNav";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
```

Change them to add `beforeEach`, `fireEvent`, `HotkeyListener`, and `useHotkeyStore`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { PeerPartnerBottomNav } from "./PeerPartnerBottomNav";
import { HotkeyListener } from "./HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
```

Append this describe block at the end of the file:

```tsx
describe("PeerPartnerBottomNav hotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("navigates to Configurações when its hotkey fires", async () => {
    render(
      <MemoryRouter initialEntries={[routes.peerPartnerInbox]}>
        <Routes>
          <Route path={routes.peerPartnerInbox} element={<><PeerPartnerBottomNav /><HotkeyListener /></>} />
          <Route path={routes.peerPartnerSettings} element={<p>Settings screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: "c" });

    expect(await screen.findByText("Settings screen")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/presentation/layout/peer-partner-nav.test.ts src/presentation/layout/usePeerPartnerNavHotkeys.test.tsx src/presentation/layout/PeerPartnerBottomNav.test.tsx`
Expected: FAIL — `peer-partner-nav.ts`/`usePeerPartnerNavHotkeys.ts` don't exist yet; pressing
`c` on `PeerPartnerBottomNav` does nothing yet.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/src/presentation/layout/peer-partner-nav.ts`:

```ts
import { routes } from "@/presentation/lib/routes";

export interface PeerPartnerNavItem {
  id: string;
  label: string;
  route: string;
  hotkey: string;
}

export const PEER_PARTNER_NAV: readonly PeerPartnerNavItem[] = [
  { id: "inbox", label: "Início", route: routes.peerPartnerInbox, hotkey: "i" },
  { id: "settings", label: "Configurações", route: routes.peerPartnerSettings, hotkey: "c" },
];
```

Create `apps/web/src/presentation/layout/usePeerPartnerNavHotkeys.ts`:

```ts
import { useNavigate } from "react-router";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { PEER_PARTNER_NAV } from "./peer-partner-nav";

/** Two useHotkey calls, spelled out — same fixed-list reasoning as the médico's and manager's nav hooks. */
export function usePeerPartnerNavHotkeys(): void {
  const navigate = useNavigate();
  const inbox = PEER_PARTNER_NAV[0]!;
  const settings = PEER_PARTNER_NAV[1]!;

  useHotkey(inbox.hotkey, () => navigate(inbox.route), inbox.label, { scope: "global" });
  useHotkey(settings.hotkey, () => navigate(settings.route), settings.label, { scope: "global" });
}
```

Edit `apps/web/src/presentation/layout/PeerPartnerBottomNav.tsx` — add the import and call the
hook at the top of the component body:

```tsx
import { usePeerPartnerNavHotkeys } from "./usePeerPartnerNavHotkeys";
// … (existing imports unchanged)

export function PeerPartnerBottomNav() {
  usePeerPartnerNavHotkeys();
  const navigate = useNavigate();
  // … rest unchanged
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run src/presentation/layout/peer-partner-nav.test.ts src/presentation/layout/usePeerPartnerNavHotkeys.test.tsx src/presentation/layout/PeerPartnerBottomNav.test.tsx`
Expected: PASS — 1 test in `peer-partner-nav.test.ts`, 2 in `usePeerPartnerNavHotkeys.test.tsx`,
6 in `PeerPartnerBottomNav.test.tsx` (5 pre-existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/peer-partner-nav.ts apps/web/src/presentation/layout/peer-partner-nav.test.ts apps/web/src/presentation/layout/usePeerPartnerNavHotkeys.ts apps/web/src/presentation/layout/usePeerPartnerNavHotkeys.test.tsx apps/web/src/presentation/layout/PeerPartnerBottomNav.tsx apps/web/src/presentation/layout/PeerPartnerBottomNav.test.tsx
git commit -m "feat(web): navigate the peer-partner shell with a keypress"
```

---

### Task 3: ManagerAdminManagersPage hotkeys

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerAdminManagersPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerAdminManagersPage.test.tsx`

**Interfaces:**
- Consumes: `useHotkey`, `HotkeyListener` (test only).

Key assignments (see Global Constraints): `a`→`openCreate`, `e`→the same inline lambda the
bulk-toolbar Editar button already uses (`() => selection.selectedRows[0] && openEdit(...)`),
`v`→`handleSaveEdit`, `u`→`handleBulkPause`, `i`→`handleBulkActivate`,
`x`→`() => bulkDelete.openDeleteConfirm(selection.selectedIds)`. All six disabled while either
modal is open (`formMode !== null || bulkDelete.deleteTarget !== null`), except `v` (Salvar),
enabled only while `formMode === "edit"`.

- [ ] **Step 1: Write the failing tests**

`ManagerAdminManagersPage.test.tsx` currently starts:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminManagersPage } from "./ManagerAdminManagersPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useToastStore } from "@/stores/toast.store";
import { AdminDeleteConflictError, LastActiveHospitalAdminError } from "@/ports/manager-admin.port";
```

`fireEvent` is already imported. Add two new imports:

```tsx
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
```

Change `renderPage()` to also mount `HotkeyListener` alongside the page:

```tsx
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/admin/managers"]}>
        <Routes>
          <Route
            path="/manager/admin/managers"
            element={
              <>
                <ManagerAdminManagersPage />
                <HotkeyListener />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

Add `useHotkeyStore.setState({ entries: new Map() })` to the existing `beforeEach`:

```tsx
describe("ManagerAdminManagersPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
    useToastStore.getState().clear();
    useHotkeyStore.setState({ entries: new Map() });
  });
```

Append a new `describe("hotkeys", ...)` block at the end of the file, before its final closing:

```tsx
describe("hotkeys", () => {
  it("opens the create modal on 'a'", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    renderPage();
    await screen.findByRole("button", { name: "+ Adicionar gestor" });

    fireEvent.keyDown(document, { key: "a" });

    expect(await screen.findByRole("dialog", { name: "Adicionar gestor" })).toBeInTheDocument();
  });

  it("opens the edit modal on 'e' once exactly one row is selected", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: [], sectorNames: [], isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Paulo" }));

    fireEvent.keyDown(document, { key: "e" });

    expect(await screen.findByRole("dialog", { name: "Editar Paulo" })).toBeInTheDocument();
  });

  it("saves the edit on 'v' while the edit modal is open", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: ["sector-1"], sectorNames: ["UTI"], isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const updateManager = vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: "Editar Paulo" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Editar Paulo" }));
    dialog.getByRole("button", { name: "Salvar" }).focus();

    fireEvent.keyDown(document, { key: "v" });

    await waitFor(() =>
      expect(updateManager).toHaveBeenCalledWith("token", {
        id: "1",
        patch: { role: "SECTOR_MANAGER", sectorIds: ["sector-1"] },
      }),
    );
  });

  it("pauses the selection on 'u'", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: [], sectorNames: [], isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const updateManager = vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Paulo" }));

    fireEvent.keyDown(document, { key: "u" });

    await waitFor(() =>
      expect(updateManager).toHaveBeenCalledWith("token", { id: "1", patch: { isActive: false } }),
    );
  });

  it("activates the selection on 'i'", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: [], sectorNames: [], isActive: false, setPasswordTokenExpiresAt: null },
    ]);
    const updateManager = vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Paulo" }));

    fireEvent.keyDown(document, { key: "i" });

    await waitFor(() =>
      expect(updateManager).toHaveBeenCalledWith("token", { id: "1", patch: { isActive: true } }),
    );
  });

  it("opens the delete-confirmation modal on 'x', without deleting directly", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: [], sectorNames: [], isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const deleteManager = vi.spyOn(container.deleteManagerAdminUseCase, "execute");
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Paulo" }));

    fireEvent.keyDown(document, { key: "x" });

    expect(await screen.findByRole("dialog", { name: "Excluir Paulo?" })).toBeInTheDocument();
    expect(deleteManager).not.toHaveBeenCalled();
  });

  it("does nothing on 'u' while the create modal sits on top", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: [], sectorNames: [], isActive: true, setPasswordTokenExpiresAt: true },
    ]);
    const updateManager = vi.spyOn(container.updateManagerAdminUseCase, "execute");
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Paulo" }));
    await user.click(screen.getByRole("button", { name: "+ Adicionar gestor" }));
    await screen.findByRole("dialog", { name: "Adicionar gestor" });

    fireEvent.keyDown(document, { key: "u" });

    expect(updateManager).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerAdminManagersPage.test.tsx`
Expected: FAIL — none of the hotkeys exist yet; every new test in the `hotkeys` block fails
while the rest of the file's existing tests keep passing.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/pages/ManagerAdminManagersPage.tsx`. Add the import:

```tsx
import { useHotkey } from "@/presentation/hooks/useHotkey";
```

Add a derived boolean right after `bulkStatus` is defined (before `toggleSector`):

```tsx
  const bulkStatus = useBulkStatusUpdate({
    updateOne: (id, isActive) => updateManager.mutateAsync({ id, patch: { isActive } }),
    conflictMessage: updateConflictMessage,
    noun: { singular: "gestor" },
  });

  const isAnyModalOpen = formMode !== null || bulkDelete.deleteTarget !== null;

  const toggleSector = (id: string) => {
```

Add the six `useHotkey` calls right after `handleBulkActivate` is defined (before
`emailFormatError`):

```tsx
  const handleBulkActivate = async () => {
    const { failedIds } = await bulkStatus.run(selection.selectedIds, true);
    if (failedIds.length === 0) selection.clear();
  };

  useHotkey("a", openCreate, "Adicionar gestor", { enabled: !isAnyModalOpen });
  useHotkey("e", () => selection.selectedRows[0] && openEdit(selection.selectedRows[0]), "Editar", {
    enabled: !isAnyModalOpen && selection.edit.enabled,
  });
  useHotkey("v", handleSaveEdit, "Salvar", { enabled: formMode === "edit" });
  useHotkey("u", handleBulkPause, "Pausar", { enabled: !isAnyModalOpen && selection.pause.enabled });
  useHotkey("i", handleBulkActivate, "Ativar", { enabled: !isAnyModalOpen && selection.activate.enabled });
  useHotkey("x", () => bulkDelete.openDeleteConfirm(selection.selectedIds), "Excluir", {
    enabled: !isAnyModalOpen && selection.remove.enabled,
  });

  const emailFormatError = emailTouched && email.length > 0 && !isValidEmail(email) ? "Digite um email válido." : null;
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerAdminManagersPage.test.tsx`
Expected: PASS — all existing tests plus the 7 new ones in the `hotkeys` block.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerAdminManagersPage.tsx apps/web/src/presentation/pages/ManagerAdminManagersPage.test.tsx
git commit -m "feat(web): add hotkeys to ManagerAdminManagersPage's CRUD actions"
```

---

### Task 4: ManagerAdminSectorsPage hotkeys

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerAdminSectorsPage.test.tsx`

**Interfaces:**
- Consumes: `useHotkey`, `HotkeyListener` (test only).

Same key scheme as Task 3: `a`→`openCreate`, `e`→the bulk-toolbar Editar's own inline lambda,
`v`→`handleSaveEdit`, `u`→`handleBulkPause`, `i`→`handleBulkActivate`,
`x`→`() => bulkDelete.openDeleteConfirm(selection.selectedIds)`. Same `isAnyModalOpen` and `v`
exceptions as Task 3. Note this page's own create-modal submit button is labeled `Salvar` too
(not `Adicionar setor`) — irrelevant to `a`, which opens the modal via the toolbar's own
`+ Adicionar setor` trigger, not the modal's internal submit button.

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/pages/ManagerAdminSectorsPage.test.tsx` first to find its exact
current `renderPage()`/`beforeEach`/imports (they follow the same shape as
`ManagerAdminManagersPage.test.tsx` from Task 3, but confirm field-for-field before editing —
do not assume identical container use-case names). Apply the same three changes Task 3 made:
add `fireEvent` to the `@testing-library/react` import if not already present, add
`HotkeyListener`/`useHotkeyStore` imports, mount `<HotkeyListener />` alongside the page in
`renderPage()`, add `useHotkeyStore.setState({ entries: new Map() })` to `beforeEach`.

Append this `describe("hotkeys", ...)` block at the end of the file:

```tsx
describe("hotkeys", () => {
  it("opens the create modal on 'a'", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    renderPage();
    await screen.findByRole("button", { name: "+ Adicionar setor" });

    fireEvent.keyDown(document, { key: "a" });

    expect(await screen.findByRole("dialog", { name: "Adicionar setor" })).toBeInTheDocument();
  });

  it("opens the edit modal on 'e' once exactly one row is selected", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));

    fireEvent.keyDown(document, { key: "e" });

    expect(await screen.findByRole("dialog", { name: "Editar UTI" })).toBeInTheDocument();
  });

  it("saves the edit on 'v' while the edit modal is open", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: [], sectorNames: [], isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const updateSector = vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: "Editar UTI" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Editar UTI" }));
    await user.selectOptions(dialog.getByLabelText("Gestor responsável"), "Paulo");
    dialog.getByRole("button", { name: "Salvar" }).focus();

    fireEvent.keyDown(document, { key: "v" });

    await waitFor(() =>
      expect(updateSector).toHaveBeenCalledWith("token", { id: "1", patch: { managerId: "manager-1" } }),
    );
  });

  it("pauses the selection on 'u'", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    const updateSector = vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));

    fireEvent.keyDown(document, { key: "u" });

    await waitFor(() =>
      expect(updateSector).toHaveBeenCalledWith("token", { id: "1", patch: { isActive: false } }),
    );
  });

  it("activates the selection on 'i'", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "UTI", isActive: false, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    const updateSector = vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));

    fireEvent.keyDown(document, { key: "i" });

    await waitFor(() =>
      expect(updateSector).toHaveBeenCalledWith("token", { id: "1", patch: { isActive: true } }),
    );
  });

  it("opens the delete-confirmation modal on 'x', without deleting directly", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    const deleteSector = vi.spyOn(container.deleteSectorAdminUseCase, "execute");
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));

    fireEvent.keyDown(document, { key: "x" });

    expect(await screen.findByRole("dialog", { name: "Excluir UTI?" })).toBeInTheDocument();
    expect(deleteSector).not.toHaveBeenCalled();
  });

  it("does nothing on 'u' while the create modal sits on top", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    const updateSector = vi.spyOn(container.updateSectorUseCase, "execute");
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));
    await user.click(screen.getByRole("button", { name: "+ Adicionar setor" }));
    await screen.findByRole("dialog", { name: "Adicionar setor" });

    fireEvent.keyDown(document, { key: "u" });

    expect(updateSector).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerAdminSectorsPage.test.tsx`
Expected: FAIL — none of the hotkeys exist yet.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx`. Add the import:

```tsx
import { useHotkey } from "@/presentation/hooks/useHotkey";
```

Add the derived boolean right after `bulkStatus` (before `openCreate`):

```tsx
  const bulkStatus = useBulkStatusUpdate({
    updateOne: (id, isActive) => updateSector.mutateAsync({ id, patch: { isActive } }),
    noun: { singular: "setor" },
  });

  const isAnyModalOpen = formMode !== null || bulkDelete.deleteTarget !== null;

  const openCreate = () => {
```

Add the six `useHotkey` calls right after `handleBulkActivate` (before `isSubmitDisabled`):

```tsx
  const handleBulkActivate = async () => {
    const { failedIds } = await bulkStatus.run(selection.selectedIds, true);
    if (failedIds.length === 0) selection.clear();
  };

  useHotkey("a", openCreate, "Adicionar setor", { enabled: !isAnyModalOpen });
  useHotkey("e", () => selection.selectedRows[0] && openEdit(selection.selectedRows[0]), "Editar", {
    enabled: !isAnyModalOpen && selection.edit.enabled,
  });
  useHotkey("v", handleSaveEdit, "Salvar", { enabled: formMode === "edit" });
  useHotkey("u", handleBulkPause, "Pausar", { enabled: !isAnyModalOpen && selection.pause.enabled });
  useHotkey("i", handleBulkActivate, "Ativar", { enabled: !isAnyModalOpen && selection.activate.enabled });
  useHotkey("x", () => bulkDelete.openDeleteConfirm(selection.selectedIds), "Excluir", {
    enabled: !isAnyModalOpen && selection.remove.enabled,
  });

  const isSubmitDisabled = name.trim().length === 0;
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerAdminSectorsPage.test.tsx`
Expected: PASS — all existing tests plus the 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx apps/web/src/presentation/pages/ManagerAdminSectorsPage.test.tsx
git commit -m "feat(web): add hotkeys to ManagerAdminSectorsPage's CRUD actions"
```

---

### Task 5: ManagerAdminPeersPage hotkeys

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerAdminPeersPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerAdminPeersPage.test.tsx`

**Interfaces:**
- Consumes: `useHotkey`, `HotkeyListener` (test only).

Same key scheme again: `a`→`openCreate`, `e`→the bulk-toolbar Editar's own inline lambda,
`v`→`handleSaveEdit`, `u`→`handleBulkPause`, `i`→`handleBulkActivate`,
`x`→`() => bulkDelete.openDeleteConfirm(selection.selectedIds)`. Same `isAnyModalOpen`/`v`
exceptions. This page additionally has a per-row `Excluir {nome}` icon button (single-target
delete) — stays mouse-only, same as every other per-row action in this plan; the `x` hotkey only
ever targets the current bulk selection, exactly mirroring the bulk-toolbar Excluir button it's
wired to.

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/pages/ManagerAdminPeersPage.test.tsx` first to confirm its exact
current `renderPage()`/`beforeEach`/imports before editing. Apply the same three changes as
Tasks 3 and 4: `fireEvent` import if missing, add `HotkeyListener`/`useHotkeyStore` imports,
mount `<HotkeyListener />` in `renderPage()`, add the store reset to `beforeEach`.

Append this `describe("hotkeys", ...)` block at the end of the file:

```tsx
describe("hotkeys", () => {
  it("opens the create modal on 'a'", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([]);
    renderPage();
    await screen.findByRole("button", { name: "+ Adicionar par" });

    fireEvent.keyDown(document, { key: "a" });

    expect(await screen.findByRole("dialog", { name: "Adicionar par" })).toBeInTheDocument();
  });

  it("opens the edit modal on 'e' once exactly one row is selected", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Psiquiatria", isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Dra. Ana" }));

    fireEvent.keyDown(document, { key: "e" });

    expect(await screen.findByRole("dialog", { name: "Editar Dra. Ana" })).toBeInTheDocument();
  });

  it("saves the edit on 'v' while the edit modal is open", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Psiquiatria", isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const updatePeerPartner = vi.spyOn(container.updatePeerPartnerUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: "Editar Dra. Ana" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Editar Dra. Ana" }));
    dialog.getByRole("button", { name: "Salvar" }).focus();

    fireEvent.keyDown(document, { key: "v" });

    await waitFor(() =>
      expect(updatePeerPartner).toHaveBeenCalledWith("token", {
        id: "1",
        patch: { name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Psiquiatria" },
      }),
    );
  });

  it("pauses the selection on 'u'", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Psiquiatria", isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const updatePeerPartner = vi.spyOn(container.updatePeerPartnerUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Dra. Ana" }));

    fireEvent.keyDown(document, { key: "u" });

    await waitFor(() =>
      expect(updatePeerPartner).toHaveBeenCalledWith("token", { id: "1", patch: { isActive: false } }),
    );
  });

  it("activates the selection on 'i'", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Psiquiatria", isActive: false, setPasswordTokenExpiresAt: null },
    ]);
    const updatePeerPartner = vi.spyOn(container.updatePeerPartnerUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Dra. Ana" }));

    fireEvent.keyDown(document, { key: "i" });

    await waitFor(() =>
      expect(updatePeerPartner).toHaveBeenCalledWith("token", { id: "1", patch: { isActive: true } }),
    );
  });

  it("opens the delete-confirmation modal on 'x', without deleting directly", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Psiquiatria", isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const deletePeerPartner = vi.spyOn(container.deletePeerPartnerAdminUseCase, "execute");
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Dra. Ana" }));

    fireEvent.keyDown(document, { key: "x" });

    expect(await screen.findByRole("dialog", { name: "Excluir Dra. Ana?" })).toBeInTheDocument();
    expect(deletePeerPartner).not.toHaveBeenCalled();
  });

  it("does nothing on 'u' while the create modal sits on top", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Psiquiatria", isActive: true, setPasswordTokenExpiresAt: null },
    ]);
    const updatePeerPartner = vi.spyOn(container.updatePeerPartnerUseCase, "execute");
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar Dra. Ana" }));
    await user.click(screen.getByRole("button", { name: "+ Adicionar par" }));
    await screen.findByRole("dialog", { name: "Adicionar par" });

    fireEvent.keyDown(document, { key: "u" });

    expect(updatePeerPartner).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerAdminPeersPage.test.tsx`
Expected: FAIL — none of the hotkeys exist yet.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/pages/ManagerAdminPeersPage.tsx`. Add the import:

```tsx
import { useHotkey } from "@/presentation/hooks/useHotkey";
```

Add the derived boolean right after `bulkStatus` (before `openCreate`):

```tsx
  const bulkStatus = useBulkStatusUpdate({
    updateOne: (id, isActive) => updatePeerPartner.mutateAsync({ id, patch: { isActive } }),
    noun: { singular: "par" },
  });

  const isAnyModalOpen = formMode !== null || bulkDelete.deleteTarget !== null;

  const openCreate = () => {
```

Add the six `useHotkey` calls right after `handleBulkActivate` (before `emailFormatError`):

```tsx
  const handleBulkActivate = async () => {
    const { failedIds } = await bulkStatus.run(selection.selectedIds, true);
    if (failedIds.length === 0) selection.clear();
  };

  useHotkey("a", openCreate, "Adicionar par", { enabled: !isAnyModalOpen });
  useHotkey("e", () => selection.selectedRows[0] && openEdit(selection.selectedRows[0]), "Editar", {
    enabled: !isAnyModalOpen && selection.edit.enabled,
  });
  useHotkey("v", handleSaveEdit, "Salvar", { enabled: formMode === "edit" });
  useHotkey("u", handleBulkPause, "Pausar", { enabled: !isAnyModalOpen && selection.pause.enabled });
  useHotkey("i", handleBulkActivate, "Ativar", { enabled: !isAnyModalOpen && selection.activate.enabled });
  useHotkey("x", () => bulkDelete.openDeleteConfirm(selection.selectedIds), "Excluir", {
    enabled: !isAnyModalOpen && selection.remove.enabled,
  });

  const emailFormatError = emailTouched && email.length > 0 && !isValidEmail(email) ? "Digite um email válido." : null;
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerAdminPeersPage.test.tsx`
Expected: PASS — all existing tests plus the 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerAdminPeersPage.tsx apps/web/src/presentation/pages/ManagerAdminPeersPage.test.tsx
git commit -m "feat(web): add hotkeys to ManagerAdminPeersPage's CRUD actions"
```

---

### Task 6: ManagerNotificationsPage hotkeys

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerNotificationsPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerNotificationsPage.test.tsx`

**Interfaces:**
- Consumes: `useHotkey`, `HotkeyListener` (test only).

Key assignments: `l`→`markAllRead` (enabled only while `unreadCount > 0`, matching the button's
own conditional rendering), `r`→`refresh` (always enabled — no modal exists on this page, so no
`isAnyModalOpen` gating is needed here at all).

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/pages/ManagerNotificationsPage.test.tsx` first (already large)
to find its exact current imports and `beforeEach`. Its current `@testing-library/react` import
is `import { render, screen, waitFor, within } from "@testing-library/react";` — add
`fireEvent`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

Add two new imports:

```tsx
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
```

Change `renderPage()` to also mount `HotkeyListener`:

```tsx
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ManagerNotificationsPage />
        <HotkeyListener />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

Add the store reset to the existing top-level `beforeEach`:

```tsx
beforeEach(() => {
  sessionStorage.clear();
  useManagerSessionStore
    .getState()
    .setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  useToastStore.getState().clear();
  useHotkeyStore.setState({ entries: new Map() });
  vi.restoreAllMocks();
});
```

Append this `describe("hotkeys", ...)` block at the end of the file:

```tsx
describe("hotkeys", () => {
  it("marks all as read on 'l' once there is at least one unread notification", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD],
      nextCursor: null,
      total: 1,
    });
    const markAllRead = vi.spyOn(container.markManagerNotificationReadUseCase, "executeAll").mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole("button", { name: "Atualizar" });

    fireEvent.keyDown(document, { key: "l" });

    await waitFor(() => expect(markAllRead).toHaveBeenCalledWith("token"));
  });

  it("does nothing on 'l' when there is nothing unread", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [READ],
      nextCursor: null,
      total: 1,
    });
    const markAllRead = vi.spyOn(container.markManagerNotificationReadUseCase, "executeAll");
    renderPage();
    await screen.findByRole("button", { name: "Atualizar" });

    fireEvent.keyDown(document, { key: "l" });

    expect(markAllRead).not.toHaveBeenCalled();
  });

  it("refreshes on 'r'", async () => {
    const listNotifications = vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });
    renderPage();
    await screen.findByRole("button", { name: "Atualizar" });
    listNotifications.mockClear();

    fireEvent.keyDown(document, { key: "r" });

    await waitFor(() => expect(listNotifications).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerNotificationsPage.test.tsx`
Expected: FAIL — `l`/`r` do nothing yet.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/pages/ManagerNotificationsPage.tsx`. Add the import:

```tsx
import { useHotkey } from "@/presentation/hooks/useHotkey";
```

Add the two `useHotkey` calls right after the `resendInvite` function is defined (before
`presentTypes`):

```tsx
  const resendInvite = (notificationIds: string[], kind: unknown, id: string, email: unknown) => {
    const mutation = kind === "manager" ? sendManagerSetPasswordEmail : sendPeerPartnerSetPasswordEmail;
    mutation.mutate(id, {
      onSuccess: () => {
        toast.success(
          typeof email === "string" ? `Convite reenviado para ${email}.` : "Convite reenviado.",
        );
        notificationIds.forEach(markRead);
      },
    });
  };

  useHotkey("l", markAllRead, "Marcar todas como lidas", { enabled: unreadCount > 0 });
  useHotkey("r", refresh, "Atualizar");

  const presentTypes = TYPE_ORDER.filter((type) => notifications.some((n) => n.type === type));
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerNotificationsPage.test.tsx`
Expected: PASS — all existing tests plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerNotificationsPage.tsx apps/web/src/presentation/pages/ManagerNotificationsPage.test.tsx
git commit -m "feat(web): add hotkeys to ManagerNotificationsPage"
```

---

### Task 7: ManagerInsightHistoryPage hotkeys

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerInsightHistoryPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerInsightHistoryPage.test.tsx`

**Interfaces:**
- Consumes: `useHotkey`, `HotkeyListener` (test only).

Key assignments: `r`→`() => insight.mutate()` (always enabled — no modal on this page),
`l`→`() => fetchNextPage()` (enabled only while `hasNextPage`, matching the existing `loadMore`
conditional that already only renders the button under the same condition).

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/pages/ManagerInsightHistoryPage.test.tsx` first (already large,
already uses a `page()` helper and `fireEvent`-free style from earlier work this session — check
whether `fireEvent` is already imported before adding it). Its current top-of-file imports
(confirm before editing, this is what they were as of this plan's authoring):

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerInsightHistoryPage } from "./ManagerInsightHistoryPage";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import * as container from "@/app/container";
import * as downloadHelper from "@/presentation/lib/download-manager-insight";
import type { ManagerInsightHistoryPage as InsightHistoryPage, StoredManagerInsight } from "@/ports/manager-insight-history.port";
```

Add `fireEvent` to the `@testing-library/react` import and two new imports:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
// … keep the rest …
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
```

Change `renderHistory()` to also mount `HotkeyListener` alongside the page:

```tsx
function renderHistory() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/history"]}>
        <Routes>
          <Route
            path="/manager/history"
            element={
              <>
                <ManagerInsightHistoryPage />
                <HotkeyListener />
              </>
            }
          />
          <Route path="/manager" element={<div>Manager dashboard screen</div>} />
          <Route path="/manager/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

Add `useHotkeyStore.setState({ entries: new Map() })` to the existing `beforeEach` that resets
`sessionStorage`/`useManagerSessionStore`.

Append this `describe("hotkeys", ...)` block at the end of the file:

```tsx
describe("hotkeys", () => {
  it("generates an analysis on 'r'", async () => {
    vi.spyOn(container.getManagerInsightHistoryUseCase, "execute").mockResolvedValue(page([]));
    const generate = vi
      .spyOn(container.generateManagerInsightUseCase, "execute")
      .mockResolvedValue({ interpretation: "Nova interpretação.", suggestedActions: ["Ação nova"] });
    renderHistory();
    await screen.findByRole("button", { name: "Gerar análise" });

    fireEvent.keyDown(document, { key: "r" });

    await waitFor(() => expect(generate).toHaveBeenCalled());
  });

  it("offers no 'l' Carregar mais hotkey when there is nothing more to load", async () => {
    vi.spyOn(container.getManagerInsightHistoryUseCase, "execute").mockResolvedValue(page([]));
    renderHistory();
    await screen.findByRole("button", { name: "Gerar análise" });

    fireEvent.keyDown(document, { key: "l" });

    expect(container.getManagerInsightHistoryUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it("loads the next page on 'l' when Carregar mais is available", async () => {
    const historySpy = vi.spyOn(container.getManagerInsightHistoryUseCase, "execute");
    historySpy.mockResolvedValueOnce(
      page(
        [
          { id: "1", interpretation: "texto 1", suggestedActions: [], summary: "resumo 1", generatedAt: "2026-07-01T00:00:00.000Z", createdByManagerName: null },
        ],
        "cursor-1",
      ),
    );
    historySpy.mockResolvedValueOnce(
      page([
        { id: "2", interpretation: "texto 2", suggestedActions: [], summary: "resumo 2", generatedAt: "2026-06-01T00:00:00.000Z", createdByManagerName: null },
      ]),
    );
    renderHistory();
    const rows = await screen.findByTestId("insight-row-list");
    await waitFor(() => expect(within(rows).getByText("resumo 1")).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "l" });

    await waitFor(() => expect(historySpy).toHaveBeenCalledWith("abc.def", { cursor: "cursor-1" }));
    await waitFor(() => expect(within(rows).getByText("resumo 2")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerInsightHistoryPage.test.tsx`
Expected: FAIL — `r`/`l` do nothing yet.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/pages/ManagerInsightHistoryPage.tsx`. Add the import:

```tsx
import { useHotkey } from "@/presentation/hooks/useHotkey";
```

Add the two `useHotkey` calls right after `loadMore` is defined (before the `return` statement):

```tsx
  const loadMore = hasNextPage ? (
    <Button
      variant="outline"
      size="sm"
      full={false}
      isLoading={isFetchingNextPage}
      onClick={() => fetchNextPage()}
    >
      Carregar mais
    </Button>
  ) : null;

  useHotkey("r", () => insight.mutate(), "Gerar análise");
  useHotkey("l", () => fetchNextPage(), "Carregar mais", { enabled: Boolean(hasNextPage) });

  return (
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerInsightHistoryPage.test.tsx`
Expected: PASS — all existing tests plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerInsightHistoryPage.tsx apps/web/src/presentation/pages/ManagerInsightHistoryPage.test.tsx
git commit -m "feat(web): add hotkeys to ManagerInsightHistoryPage"
```

---

### Task 8: ManagerDashboardPage hotkeys

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useHotkey`, `HotkeyListener` (test only).

Key assignments: `r`→`() => insight.mutate()` (enabled only while `!insight.data`, matching the
button's own conditional rendering — same key as Task 7's Insight History page, since it's the
same underlying action and the two pages never coexist), `v`→`() =>
downloadPgrReportAsCsv(data)` (enabled only while `data && segments.length > 0`, matching the
button's own `disabled` condition and its conditional rendering inside `{data && (...)}`),
`f`→`() => downloadPgrReportAsPdf(data)` (same enabling condition as `v`). `Tentar novamente`
gets no hotkey (Global Constraints).

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx` first (confirm its exact
current imports/`renderManager()`/`beforeEach` before editing — it's large). Add `fireEvent` to
its `@testing-library/react` import if not already present, and two new imports:

```tsx
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
```

Change `renderManager()` to also mount `HotkeyListener` alongside the page (inside the
`/manager` route's element, next to `<ManagerDashboardPage />`), and add
`useHotkeyStore.setState({ entries: new Map() })` to the existing `beforeEach`.

Append this `describe("hotkeys", ...)` block at the end of the file:

```tsx
describe("hotkeys", () => {
  it("generates an analysis on 'r' while none exists yet", async () => {
    const generate = vi
      .spyOn(container.generateManagerInsightUseCase, "execute")
      .mockResolvedValue({ interpretation: "Nova interpretação.", suggestedActions: ["Ação nova"] });
    renderManager();
    await screen.findByRole("button", { name: "Gerar análise" });

    fireEvent.keyDown(document, { key: "r" });

    await waitFor(() => expect(generate).toHaveBeenCalled());
  });

  it("exports CSV on 'v' once segments exist", async () => {
    const csvSpy = vi.spyOn(pgrExport, "downloadPgrReportAsCsv").mockImplementation(() => {});
    renderManager();
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar CSV" })).not.toBeDisabled());

    fireEvent.keyDown(document, { key: "v" });

    expect(csvSpy).toHaveBeenCalledWith(SIGNALS_RESPONSE);
  });

  it("exports PDF on 'f' once segments exist", async () => {
    const pdfSpy = vi.spyOn(pgrExport, "downloadPgrReportAsPdf").mockImplementation(() => {});
    renderManager();
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar PDF" })).not.toBeDisabled());

    fireEvent.keyDown(document, { key: "f" });

    expect(pdfSpy).toHaveBeenCalledWith(SIGNALS_RESPONSE);
  });

  it("does nothing on 'v' or 'f' while segments are empty", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({ ...SIGNALS_RESPONSE, segments: [] });
    const csvSpy = vi.spyOn(pgrExport, "downloadPgrReportAsCsv").mockImplementation(() => {});
    const pdfSpy = vi.spyOn(pgrExport, "downloadPgrReportAsPdf").mockImplementation(() => {});
    renderManager();
    await screen.findByTestId("segments-empty");

    fireEvent.keyDown(document, { key: "v" });
    fireEvent.keyDown(document, { key: "f" });

    expect(csvSpy).not.toHaveBeenCalled();
    expect(pdfSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: FAIL — `r`/`v`/`f` do nothing yet.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`. Add the import:

```tsx
import { useHotkey } from "@/presentation/hooks/useHotkey";
```

Add the three `useHotkey` calls right after `trendWindowLabel` is computed (the last `const`
before the component's `return`):

```tsx
  const trendWindowLabel =
    weeklyTrend.length === 1 ? "última semana" : `últimas ${weeklyTrend.length} semanas`;

  useHotkey("r", () => insight.mutate(), "Gerar análise", { enabled: !insight.data });
  useHotkey("v", () => data && downloadPgrReportAsCsv(data), "Exportar CSV", {
    enabled: Boolean(data) && segments.length > 0,
  });
  useHotkey("f", () => data && downloadPgrReportAsPdf(data), "Exportar PDF", {
    enabled: Boolean(data) && segments.length > 0,
  });

  return (
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: PASS — all existing tests plus the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git commit -m "feat(web): add hotkeys to ManagerDashboardPage"
```

---

### Task 9: PeerPartnerInboxPage hotkeys

**Files:**
- Modify: `apps/web/src/presentation/pages/PeerPartnerInboxPage.tsx`
- Modify: `apps/web/src/presentation/pages/PeerPartnerInboxPage.test.tsx`

**Interfaces:**
- Consumes: `useHotkey`, `HotkeyListener` (test only).

Key assignments: `a`→`accept`, `r`→`decline` (not `Recusar`'s literal first letter — chosen this
way in the approved design, both only registered/enabled while `state === "incoming_request" &&
incomingRequest`, matching exactly when the Aceitar/Recusar card itself renders).
`Tentar novamente` (the `state === "error"` retry button) gets no hotkey (Global Constraints).

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/pages/PeerPartnerInboxPage.test.tsx` first (confirm its exact
current imports/`renderPage()`/`beforeEach`/socket-mock setup before editing). Add `fireEvent`
to its `@testing-library/react` import if not already present, and two new imports:

```tsx
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
```

Change `renderPage()` to also mount `HotkeyListener` alongside the page, and add
`useHotkeyStore.setState({ entries: new Map() })` to the existing `beforeEach`.

Append this `describe("hotkeys", ...)` block at the end of the file:

```tsx
describe("hotkeys", () => {
  it("accepts the incoming request on 'a'", async () => {
    renderPage();
    handlers["incoming_request"]!({ requestId: "request-1", sectorName: "UTI" });
    await waitFor(() => screen.getByRole("button", { name: "Aceitar" }));

    fireEvent.keyDown(document, { key: "a" });

    expect(emitSpy).toHaveBeenCalledWith("accept_request", { requestId: "request-1" });
  });

  it("declines the incoming request on 'r'", async () => {
    renderPage();
    handlers["incoming_request"]!({ requestId: "request-1", sectorName: "UTI" });
    await waitFor(() => screen.getByRole("button", { name: "Recusar" }));

    fireEvent.keyDown(document, { key: "r" });

    expect(emitSpy).toHaveBeenCalledWith("decline_request", { requestId: "request-1" });
  });

  it("does nothing on 'a' or 'r' while idle, with no incoming request", async () => {
    renderPage();
    await act(async () => {
      handlers["connect"]?.();
    });
    await screen.findByText("Conectado, aguardando solicitações.");

    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "r" });

    expect(emitSpy).not.toHaveBeenCalledWith("accept_request", expect.anything());
    expect(emitSpy).not.toHaveBeenCalledWith("decline_request", expect.anything());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/pages/PeerPartnerInboxPage.test.tsx`
Expected: FAIL — `a`/`r` do nothing yet.

- [ ] **Step 3: Write the minimal implementation**

Edit `apps/web/src/presentation/pages/PeerPartnerInboxPage.tsx`. Add the import:

```tsx
import { useHotkey } from "@/presentation/hooks/useHotkey";
```

Add the two `useHotkey` calls right after the `usePeerPartnerConnection` call (before the
`return` statement):

```tsx
  const { state, incomingRequest, secondsRemaining, messages, peerLeft, accept, decline, sendMessage, leave, reconnect } = usePeerPartnerConnection(token);

  const hasIncomingRequest = state === "incoming_request" && incomingRequest !== undefined;
  useHotkey("a", accept, "Aceitar", { enabled: hasIncomingRequest });
  useHotkey("r", decline, "Recusar", { enabled: hasIncomingRequest });

  return (
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/pages/PeerPartnerInboxPage.test.tsx`
Expected: PASS — all existing tests plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/PeerPartnerInboxPage.tsx apps/web/src/presentation/pages/PeerPartnerInboxPage.test.tsx
git commit -m "feat(web): add hotkeys to PeerPartnerInboxPage's Aceitar/Recusar"
```

---

### Task 10: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full web test suite**

Run (from `apps/web`): `npx vitest run`
Expected: PASS, no regressions anywhere in the suite.

- [ ] **Step 2: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 3: Lint the touched files**

Run (from `apps/web`):
```bash
npx eslint src/presentation/layout/manager-nav.ts src/presentation/layout/manager-nav.test.ts \
  src/presentation/layout/useManagerNavHotkeys.ts src/presentation/layout/useManagerNavHotkeys.test.tsx \
  src/presentation/layout/ManagerSidebar.tsx src/presentation/layout/ManagerSidebar.test.tsx \
  src/presentation/layout/ManagerBottomNav.tsx src/presentation/layout/ManagerBottomNav.test.tsx \
  src/presentation/layout/peer-partner-nav.ts src/presentation/layout/peer-partner-nav.test.ts \
  src/presentation/layout/usePeerPartnerNavHotkeys.ts src/presentation/layout/usePeerPartnerNavHotkeys.test.tsx \
  src/presentation/layout/PeerPartnerBottomNav.tsx src/presentation/layout/PeerPartnerBottomNav.test.tsx \
  src/presentation/pages/ManagerAdminManagersPage.tsx src/presentation/pages/ManagerAdminManagersPage.test.tsx \
  src/presentation/pages/ManagerAdminSectorsPage.tsx src/presentation/pages/ManagerAdminSectorsPage.test.tsx \
  src/presentation/pages/ManagerAdminPeersPage.tsx src/presentation/pages/ManagerAdminPeersPage.test.tsx \
  src/presentation/pages/ManagerNotificationsPage.tsx src/presentation/pages/ManagerNotificationsPage.test.tsx \
  src/presentation/pages/ManagerInsightHistoryPage.tsx src/presentation/pages/ManagerInsightHistoryPage.test.tsx \
  src/presentation/pages/ManagerDashboardPage.tsx src/presentation/pages/ManagerDashboardPage.test.tsx \
  src/presentation/pages/PeerPartnerInboxPage.tsx src/presentation/pages/PeerPartnerInboxPage.test.tsx
```
Expected: no output (clean). If a `react-hooks/exhaustive-deps`-style disable comment is ever
tempting for any of the `useHotkey` calls in this plan, don't add one — none of these calls use
`useEffect` directly (that's entirely inside `useHotkey` itself, already built and already
verified against this project's actual lint config in Phase 1), so no disable comment is needed
anywhere in this plan's own code.

- [ ] **Step 4: Manual smoke test**

Start the dev server (`pnpm dev` from `apps/web`) and, in a browser, logged in as a
`HOSPITAL_ADMIN` manager: press `s` from `/manager` and confirm it navigates to Setores; on
`/manager/admin/managers`, press `a` and confirm the create-gestor modal opens; select a row,
press `u` and confirm it pauses; on `/manager/notifications` with at least one unread item,
press `l` and confirm it marks all read. Log in as a peer partner: from the inbox with an
incoming request active (or simulate one), press `a` and confirm it accepts. This step has no
automated assertion — it is the final human check that the wiring behaves in a real browser.

- [ ] **Step 5: Report**

No commit for this task — it is verification only. If any step surfaces a regression, fix it as
part of the task that introduced it (a new small fix commit, never amend) and re-run Steps 1–3.

## Self-Review Notes

- **Spec coverage:** every screen/nav the approved chat design named has a task — manager nav
  (Task 1), peer-partner nav (Task 2), the three admin CRUD pages (Tasks 3–5), the two manager
  single-action pages plus the dashboard (Tasks 6–8), and the peer-partner inbox (Task 9). The
  three explicit exclusions (Sair, Tentar novamente ×2) are called out in Global Constraints and
  never wired in any task.
- **Placeholder scan:** none found — every step carries real, complete code, including exact
  mock data shapes read from each page's own existing types.
- **Type consistency:** `useHotkey`'s signature (from Phase 1) is used identically across all
  nine implementation tasks; `ManagerNavItem`/`PeerPartnerNavItem`'s `hotkey` field names match
  between the config files (Tasks 1–2) and the hooks that read them; every `isAnyModalOpen`
  expression in Tasks 3–5 is spelled the same way (`formMode !== null || bulkDelete.deleteTarget
  !== null`), matching the two-modal shape all three admin pages actually have.
- **Cross-task key collision check:** the reserved manager-nav set `{t,n,h,m,g,s,p,c}` never
  appears as a page-level key in Tasks 3–8 (Tasks 3–5 use `{a,e,v,u,i,x}`; Task 6 uses `{l,r}`;
  Task 7 uses `{r,l}`; Task 8 uses `{r,v,f}`) — Task 6 and Task 7 reuse `l`/`r` for different
  actions, and Task 7 and Task 8 reuse `r` for the *same* action, but no two of these pages are
  ever mounted at the same time as each other or as the manager nav being anything other than
  what's already reserved, so none of this is a real conflict. Task 9's peer-partner `{a,r}` is
  a separate persona's registry entirely, never mounted alongside manager or médico hotkeys.
