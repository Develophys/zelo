---
name: zelo-frontend-flow
description: Use when adding a new manager-facing screen or route in apps/web — wiring a new page from an API endpoint through port/adapter/use-case/container/hook to the route.
---

# Zelo Frontend Flow

## Overview

Measured by having three agents build the same screen independently: all three found the deep
architectural spine (port→adapter→use-case→container→hook→page, the nav-cap rule) purely by
reading sibling files — that part needs no skill. Every real divergence came from each agent
reading a different, incomplete subset of files that are **not adjacent** to the obvious template
page. This skill is that file list, made explicit.

## Open these files first, before writing anything

Beyond the one obvious template page, this repo has three silent per-pathname lookup tables and
one silent cross-cutting error convention that nothing points you to unless you already know:

- `presentation/lib/routes.ts` — the path constant.
- `presentation/lib/route-title.ts` — the document `<title>`.
- `presentation/layout/app-header-meta.ts` — **easy to miss.** `AppHeader` renders nothing (no
  title, no back button, no theme toggle) for any pathname missing here. Registering a route in
  the first two tables and skipping this one ships a screen with no header bar.
- Any `http-manager-*.adapter.ts` (e.g. `http-manager-admin.adapter.ts`) — for the 401 rule below.

## The recipe

1. Port + zod response schema in `ports/`.
2. `Http*Adapter` in `infrastructure/http/` — see the 401 rule below.
3. `*.usecase.ts` in `use-cases/`.
4. Wire into `app/container/<feature>.ts`. If a second use-case is added on a port that already
   backs one use-case in that file, construct the adapter **once** and share the instance —
   mirror the `managerAdminAdapter` singleton in `container/manager-admin.ts`, don't
   `new Adapter()` per use-case.
5. Thin hook in `presentation/hooks/` wrapping one use-case in `useQuery`/`useMutation`.
6. Page under `presentation/pages/`, built from `presentation/ui/` primitives.
7. Route entry in `app/routes/<audience>.routes.ts` (doctor / manager / peer-partner /
   super-admin — `router.tsx` only composes them) + the three lookup tables above. A staff route
   loads through `lazy: { Component: lazyPage(...) }`; a doctor route stays statically imported.
   See `docs/conventions/react-performance.md` § Code splitting for why.

## Mirror-file pointers (each closes a measured violation)

- **401 handling:** every `http-manager-*.adapter.ts` method must check
  `response.status === 401` and `throw new UnauthorizedManagerError()` (from
  `ports/manager-signals.port.ts`) before a generic `Error` for other statuses — copy
  `http-manager-notifications.adapter.ts`. A 401 must map to `Unauthorized<Role>Error` (manager:
  `UnauthorizedManagerError`, admin: `UnauthorizedAdminError`, peer partner:
  `UnauthorizedPeerPartnerError`) because `createQueryClient`'s central handler
  (`sessionRoleOfError`) is what ends the session; a plain `Error` on a 401 leaves the person on a
  retry button that cannot succeed. Existing manager sectors and manager-admin adapter methods do
  not all map it yet (`docs/conventions/priorities.md` #32), so do not copy their 401 handling.
- **List chrome:** for a read-oriented list, reuse `presentation/ui/DataTable/{DataTableShell,
  DataTableToolbar, DataTableEmpty, DataTableError}` the way `ManagerInsightHistoryPage.tsx` does
  (`DataTableToolbar`'s `selection` prop is optional — omit it for a list with no bulk actions).
  Don't hand-roll an empty or error state; `DataTableError` already renders the retry button.
- **Error-state deference:** a page under `ManagerShell` should suppress its own error banner
  when `error instanceof UnauthorizedManagerError` — copy the `loadFailed = isError &&
  !(error instanceof UnauthorizedManagerError)` guard from `ManagerDashboardPage.tsx` or
  `ManagerInsightHistoryPage.tsx`. The global session-expiry redirect already handles that case;
  a local error message races it and produces a confusing flash before the bounce to login.
- **Hotkey test coverage:** adding an entry to `manager-nav.ts` needs a matching assertion in
  `manager-nav.test.ts` alongside the existing per-nav-group cases — that file's whole purpose is
  catching hotkey collisions.
- **Don't rebuild a sibling feature component.** Before writing a new modal/wrapper component,
  grep `presentation/components/` for one that already solves the same UI problem (e.g. a QR
  code, a confirm dialog, a status pill) — not just the generic `presentation/ui/` primitives.
  `SectorQrCodeModal.tsx` already wraps `QrCodeModal` with the title/filename convention; a new
  screen needing a sector's QR should compose it, not hand-copy its title string and re-implement
  the wrapper.

## Full conventions

`docs/conventions/frontend-architecture.md` for the container/state-split rationale;
`docs/conventions/react-performance.md` for re-render and code-splitting guidance.
