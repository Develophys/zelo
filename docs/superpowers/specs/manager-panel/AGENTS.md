# Zelo — Painel do Gestor: Redesign Build Plan

> **Purpose.** Implementation plan for the manager-panel redesign validated in
> `Painel Gestor Redesign.dc.html`. Five phases, in order. Each phase is a single
> self-contained file that can be handed to one agent as one task.
>
> **Target repo.** `Develophys/zelo` @ `main`, subtree `apps/web`.
> React 18 + Vite + Tailwind + react-router v6 + TanStack Query v5 + Zustand,
> clean-architecture layering (domain → ports → use-cases → infrastructure → presentation).
>
> **Prototype of record.** `Painel Gestor Redesign.dc.html` (Omelette design doc). It has a
> desktop/mobile toggle and covers every screen in scope. When this spec and the prototype
> disagree, **this spec wins** — the prototype is inline-styled and not token-driven.

---

## Golden rules

1. **Layers.** Phases 01–04 are **presentation-only** (+ `tailwind.config.ts`, `src/app/index.css`).
   Phase 05 is the **one authorized exception**: it changes `ports/`, `use-cases/`,
   `infrastructure/http/` and the backend API contract. Do not anticipate those changes in
   earlier phases.
2. **Mobile-first.** Author the base (unprefixed) styles for phones. Add `md:` for tablet and
   `lg:` for desktop. **One component per page** — no `MobilePage`/`DesktopPage` forks, no
   `useBreakpoint` branching for layout. (Rationale + the one legitimate exception: Phase 02.)
3. **Tokens only.** No raw hex in components. Everything resolves through the Tailwind theme
   from the existing `spec/design-tokens.md` + Phase 01 additions.
4. **Anonymity is unchanged.** The manager panel shows aggregates only; `n < 5` segments stay
   suppressed. Nothing in this redesign may surface an individual doctor's data.
5. **PT-BR copy is normative.** Strings in these specs are the copy. Do not paraphrase.
6. **Server-side truth.** After Phase 05, search and pagination are **backend** concerns.
   No client-side `.filter()` over a full list — that is the bug this redesign removes.

---

## Phases

| # | File | Touches | Depends on |
|---|---|---|---|
| 01 | `01-primitives-and-tokens.md` | tokens, `ui/` primitives | — |
| 02 | `02-responsive-strategy.md` | `layout/`, tailwind screens | 01 |
| 03 | `03-manager-navigation.md` | `layout/ManagerShell`, router | 01, 02 |
| 04 | `04-screen-layouts.md` | `pages/`, `components/` | 01–03 |
| 05 | `05-infinite-scroll-and-api.md` | ports, use-cases, http, **backend** | 01–04 |

Run them in order. Each ends with acceptance criteria — do not open the next phase until the
previous one's criteria pass `pnpm --filter web build` + `pnpm --filter web test`.

---

## In scope for real implementation

- Manager navigation (sidebar desktop / bottom-nav + expand-sheet mobile), collapsible sidebar.
- Table pattern: global search, bulk-selection actions, row actions, empty/loading states.
- Modals as bottom sheets on mobile, centered dialogs on desktop.
- **Configurações** page (accent color, density, corner style) — new route.
- **Notificações** (unread state, mark-as-read, unread badge with `99+` cap) — new route.
- Infinite scroll with TanStack, as one shared component.

## Deferred — build the surface, stub the data

These appear in the prototype but are **not** implementation scope in this pass. Render them
with the real layout and an explicit "em breve" / empty state; do **not** invent backends:

- **Análises com IA history** (collapsible rows) — `ManagerInsightHistoryPort.fetchHistory`
  exists but is unpaginated; the table shell is Phase 04, the data stays as-is until Phase 05
  lands its contract change. Mark the export/download actions as non-functional.
- **Bulk actions mutations** — the selection UX, enable/disable logic and tooltips ship in
  Phase 04; the actual batch mutations stay per-item loops over existing use-cases (no new
  batch endpoint in this pass).

---

## File map

```
apps/web/
  tailwind.config.ts                             (edit: screens, radius, density)
  src/app/index.css                              (edit: CSS custom props for theme prefs)
  src/app/router.tsx                             (edit: manager routes)
  src/stores/manager-prefs.store.ts              (new — Phase 01)
  src/presentation/
    layout/
      ManagerShell.tsx                           (new — Phase 02/03)
      ManagerSidebar.tsx                         (new — Phase 03)
      ManagerBottomNav.tsx                       (new — Phase 03)
    ui/
      Button.tsx  IconButton.tsx  Pill.tsx        (new/edit — Phase 01)
      Modal.tsx  Sheet.tsx  Tooltip.tsx  Checkbox.tsx
      DataTable/                                 (Phase 04)
        DataTable.tsx  DataTableToolbar.tsx  DataTableEmpty.tsx
      InfiniteList.tsx                           (new — Phase 05)
    pages/
      ManagerDashboardPage.tsx                   (edit)
      ManagerAdminSectorsPage.tsx                (new, split from ManagerAdminPage)
      ManagerAdminManagersPage.tsx               (new)
      ManagerAdminPeersPage.tsx                  (new)
      ManagerNotificationsPage.tsx               (new)
      ManagerInsightHistoryPage.tsx              (edit)
      ManagerSettingsPage.tsx                    (new)
  ports/, use-cases/, infrastructure/            (Phase 05 only)
```
