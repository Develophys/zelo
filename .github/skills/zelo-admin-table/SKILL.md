---
name: zelo-admin-table
description: Use when asked to add an admin or manager list/table screen in apps/web, before writing any component.
---

# Zelo Admin Table

## Step 0 — search before building

Measured: given a task that sounded like new work, three independent agents all searched
`presentation/pages/` for the entity name first, found the screen already shipped and tested, and
reported that instead of duplicating it. Do the same — grep the entity name across
`presentation/pages/` before creating anything. A screen that's routed, tested, and reachable
from nav is done; report it, don't rebuild it.

**When you report "this already exists," don't stop at routing + tests** — also grep the
nav/header layer (`presentation/layout/manager-nav.ts`, `app-header-meta.ts`) to confirm a real
user has a click-path to it, not just that the route resolves.

**REQUIRED:** use `zelo-verify-before-reporting` for how to state that report — a measured
failure here was an agent confidently asserting a specific gap in the existing code that a direct
read disproved.

## Resolving "in the institution" scoping

If the task scopes to "the institution" or similarly implies a single tenant, and this repo also
has a platform-level, multi-institution admin console
(`apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`), open that console and check by
content — its expandable-row/section pattern — whether it already has an equivalent listing for
the entity in question. Don't infer single-tenant scope merely from the absence of an institution
selector elsewhere; read the sibling page's actual structure.

## If it genuinely doesn't exist yet

Build from `presentation/ui/DataTable/` — `DataTableShell`, `DataTableToolbar`, `DataTableEmpty`,
`DataTableError`, plus `useDataTableSelection`, `useBulkDelete`, `useBulkStatusUpdate`. A separate
`<name>-columns.tsx` file for column definitions. Mobile: `DataTableMobileCard`, not a
horizontally-scrolling table. Search through the existing `useDebouncedSearch` hook; PT-BR
pluralisation through `ui/DataTable/plural.ts`.

Mirror files: `ManagerAdminManagersPage/` (the refactored reference — page + hooks + columns +
modals as a folder) and `ManagerAdminPeersPage.tsx`.

## Full conventions

`docs/conventions/forms-and-ui.md` for the `DataTable` API in full.
