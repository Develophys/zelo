# Admin panel: institutions, sectors, and manager permissions — design spec

**Status:** approved design, not yet implemented.

**Relationship to prior specs:** `2026-08-02-multi-institution-data-partitioning-design.md` (and
its implementation plan, `2026-08-02-institution-model-and-manager-scoping.md`, already merged)
added a real `Institution` model and per-institution `Manager` scoping, but explicitly deferred
two things as non-goals: "self-service institution onboarding / an admin panel" (institutions
were created manually, seed/script-only) and "a fixed, per-institution department picklist / org
chart" (`department` stayed free text, typed once at link time). This spec is those two
deferrals being picked up, plus a new granularity layer neither prior spec anticipated: manager
permissions scoped to a subset of an institution rather than the whole thing.

`2026-08-01-manager-individual-accounts-design.md` established individual named `Manager`
accounts and explicitly said "don't add per-manager permission scoping speculatively" — this spec
is that speculation becoming a real requirement, now that a hospital manager (this PoC's persona:
"Mauricio") needs to delegate sector-level visibility to other managers ("Paulo"/UTI,
"João"/Pronto-Socorro) without giving them the whole institution's data.

This is the first of two specs from the same brainstorming session. The second — anonymous
peer-doctor chat — is deliberately separate (different kind of system: real-time chat/websockets,
notifications) and depends on this one existing first (peer partners are registered by a hospital
admin, the role this spec introduces).

---

## 1. Scope

**In scope:**

- A platform-level `SuperAdmin` role (Zelo staff), with its own login, that creates `Institution`
  rows and each institution's first `Manager` account (`role = HOSPITAL_ADMIN`).
- `Sector` as a first-class, admin-registered entity belonging to one `Institution`.
- `Manager.role` (`HOSPITAL_ADMIN` | `SECTOR_MANAGER`). A `HOSPITAL_ADMIN` always sees every
  active sector in their institution; a `SECTOR_MANAGER` sees only their assigned sector(s).
  One manager per sector; one manager may hold several sectors.
- A `HOSPITAL_ADMIN`-only admin panel, nested under the existing manager login, to create and
  manage sectors and other managers within their own institution.
- The device-linking flow (`screens/16-link-institution.md`) switches from free-text department
  to picking a registered `Sector` from the institution's active list.
- The manager dashboard gains a sector multiselect filter, scoped server-side to what the
  authenticated manager can see.
- Deactivation (not deletion) for `Manager` and `Sector`, and an admin-triggered password reset
  for managers.

**Explicitly out of scope (this spec):**

- Anonymous peer-doctor chat — separate, follow-up spec.
- Backfilling existing free-text `Signal.department` data into `Sector` rows. Clean cutover: the
  `signals` table is dropped and recreated with `sectorId` (same reasoning already used for
  `department` → `institutionId` in the prior migration — this data is demo-only and disposable),
  and the seeded "Zelo Demo" institution gets matching `Sector` rows so its dashboard keeps
  working.
- Deleting managers or sectors outright — deactivation only.
- Self-service super-admin account creation — `SuperAdmin` rows stay seed-created only, the same
  bootstrap pattern already established for `Manager`.
- Institution deactivation/deletion.
- `TD-001` (manager session token in `sessionStorage`, not an `HttpOnly` cookie) — untouched,
  orthogonal to this spec.
- Sector-level scoping for `ManagerInsight` (the saved AI-analysis history) — stays
  institution-wide, generated from whatever sectors the requesting manager currently has access
  to, but not tagged or filtered by sector on read.

## 2. Non-negotiables carried forward

Everything in `docs/superpowers/specs/AGENTS.md`'s Golden Rules still applies, plus
`2026-08-02-multi-institution-data-partitioning-design.md` §2's points, restated for the added
granularity:

- Linking a device to an institution/sector remains optional and never gates core functionality.
- k-anonymity is enforced server-side, at write time, per `institutionId + sectorId`. The
  suppression threshold (`K_ANONYMITY_THRESHOLD`, n=5) is unchanged — only the grouping key's
  shape changes (`sectorId` FK instead of a free-text `department` string).
- Linking still creates no identity. `sectorId`/`sectorName`/`deviceSignalId` continue to live
  only on the device (IndexedDB/localStorage), never associated server-side with anything else
  about the device.

## 3. Data model

```prisma
model SuperAdmin {
  id           String   @id @default(cuid())
  name         String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  @@map("super_admins")
}

enum ManagerRole {
  HOSPITAL_ADMIN
  SECTOR_MANAGER
}

model Manager {
  id            String      @id @default(cuid())
  name          String      @unique
  passwordHash  String
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  role          ManagerRole @default(HOSPITAL_ADMIN)
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())

  sectors       Sector[]    // sectors this manager is assigned to; meaningful only when role = SECTOR_MANAGER

  @@map("managers")
}

model Sector {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  name          String
  isActive      Boolean     @default(true)
  managerId     String?
  manager       Manager?    @relation(fields: [managerId], references: [id])
  createdAt     DateTime    @default(now())

  signals       Signal[]

  @@unique([institutionId, name])
  @@map("sectors")
}
```

`Signal` moves from a free-text `department` to a `sectorId` FK (`Institution`/`ManagerInsight`
are otherwise unchanged from the prior spec):

```prisma
model Signal {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  sectorId      String
  sector        Sector      @relation(fields: [sectorId], references: [id])
  weekStart     DateTime
  checkIns      Int         @default(0)
  concerning    Int         @default(0)
  createdAt     DateTime    @default(now())

  @@unique([institutionId, sectorId, weekStart])
  @@map("signals")
}
```

Notes:

- `HOSPITAL_ADMIN` is a strict superset of `SECTOR_MANAGER` — it always sees every active sector
  in its institution regardless of any `sectors` assignment. "The same person does both jobs" (a
  small hospital where the hospital manager is also, functionally, a sector manager) just means
  their `Manager` row has `role = HOSPITAL_ADMIN`; there is no separate flag or dual-role case to
  model.
- One manager per sector, enforced by `Sector.managerId` being a plain nullable FK (not a join
  table) — a manager can hold several sectors, but each sector has at most one manager.
- `SignalDedupKey` (from the prior spec) is unchanged in shape — its hash input swaps `department`
  for `sectorId`, still a one-way hash with no reference back to any device, institution, or
  person.

## 4. Platform super-admin flow

New auth stack mirroring the manager one exactly (same primitives, different secret/table):
`SuperAdminPasswordService` (scrypt, matching `ManagerPasswordService`'s pattern),
`SuperAdminTokenService` (HMAC-signed JSON payload, `SUPER_ADMIN_TOKEN_SECRET`),
`SuperAdminAuthGuard`, `POST /admin/login`.

`SuperAdmin` rows are seed-created only — same bootstrap pattern already established for
`Manager` (`apps/api/prisma/seed.ts`, documented in `prisma/README.md`). No self-service
super-admin signup in this spec.

- `POST /admin/institutions` — body `{ institutionName, inviteCode, hospitalAdminName }`.
  Creates the `Institution` row and, in the same transaction, its first `Manager` row
  (`role = HOSPITAL_ADMIN`) with a system-generated temporary password, returned once in the
  response for the super-admin to relay out-of-band. Duplicate institution name/invite code or
  duplicate manager name rejected with a validation error.
- `GET /admin/institutions` — list of institutions (name, invite code, creation date, hospital
  admin name) for the super-admin's own reference.

Frontend: `/admin/login` (name + password, same shell/pattern as `ManagerLoginPage`) → `/admin`
(a form to create an institution + its first hospital admin, plus a table of existing
institutions). This is a small, separate area of the app — not linked from any médico- or
manager-facing navigation.

## 5. Hospital-admin panel (sectors + managers)

Nested under the *existing* manager login — no new auth surface. A `HOSPITAL_ADMIN`-only route
(`/manager/admin`), reachable from a nav item on `ManagerDashboardPage` that only renders when
`request.manager.role === "HOSPITAL_ADMIN"`. A `SECTOR_MANAGER` who reaches the route directly
gets a 403 from every endpoint it calls and is redirected back to the dashboard.

**Sectors tab:**

- `GET /manager/admin/sectors` — every sector in the manager's institution (active + inactive),
  each with its assigned manager's name if any.
- `POST /manager/admin/sectors` — `{ name }`. The UI suggests common sector names as tap-to-fill
  chips (UTI, Pronto-Socorro, Clínica Médica, Centro Cirúrgico, Pediatria, Ambulatório, Plantão
  Noturno) — a client-side convenience list only; the admin can still type any custom name.
  Enforces `@@unique([institutionId, name])`.
- `PATCH /manager/admin/sectors/:id` — `{ isActive?, managerId? }`. Deactivating (`isActive:
  false`) hides the sector from the linking picklist (§7) and from the dashboard filter's default
  options going forward; existing `Signal` rows are untouched, and médicos already linked to it
  keep working — check-ins still count, just against a now-hidden sector, until they relink.
  Reassigning `managerId` is a plain field update, no separate workflow.

**Managers tab:**

- `GET /manager/admin/managers` — every manager in the institution (name, role, active status,
  assigned sector names).
- `POST /manager/admin/managers` — `{ name, role, sectorIds? }` (`sectorIds` required and
  non-empty when `role = SECTOR_MANAGER`; ignored for `HOSPITAL_ADMIN`). Backend generates a
  temporary password and returns it once in the response — the panel shows a one-time
  "copy this password" dialog, same UX as the super-admin's institution-creation flow.
- `PATCH /manager/admin/managers/:id` — `{ isActive?, role?, sectorIds? }`. Deactivating a manager
  sets `isActive = false`; any sectors they held become unassigned (`managerId = null`) rather
  than blocking the deactivation — those sectors stay active and keep accruing data, just with no
  sector-manager attached until reassigned.
- `POST /manager/admin/managers/:id/reset-password` — generates and returns a new temporary
  password once, same mechanism as creation.

**Guard rail:** a `HOSPITAL_ADMIN` cannot deactivate themselves if they are the institution's last
active `HOSPITAL_ADMIN` — enforced server-side, not just hidden in the UI — otherwise an
institution could lock itself out of its own admin panel with no super-admin recourse built in
this spec.

## 6. Manager-scoped dashboard filter

The session token gains `role` alongside the existing `managerId`/`managerName`/`institutionId`
payload fields (same HMAC-signed JSON shape, one more field; `ManagerAuthGuard` attaches it to
`request.manager` the same way it already attaches `institutionId`).

- `GET /manager/signals?sectorIds=a,b,c` (optional query param). The server first resolves the
  manager's **accessible sector set**: every active sector in the institution for
  `HOSPITAL_ADMIN`, or exactly their assigned active sectors for `SECTOR_MANAGER`. If `sectorIds`
  is omitted, the full accessible set is used. If provided, it's intersected with the accessible
  set — any requested id outside it is silently dropped, never a 403 (avoids leaking "that sector
  exists but you can't see it" via an error response).
- `GetManagerSignalsUseCase.execute(institutionId, sectorIds)` — same grouping/threshold logic as
  today, pre-filtered to the resolved sector list before aggregation. k-anonymity still applies
  per `institutionId + sectorId`.
- `GET /manager/sectors` — a lighter, accessible-only endpoint (distinct from the admin tab's
  `GET /manager/admin/sectors`, which lists everything) that both roles use to populate the
  filter UI's options.
- Frontend: one reusable multiselect component renders the manager's accessible sectors, from
  `GET /manager/sectors`, defaulting to "all selected." `HOSPITAL_ADMIN` and `SECTOR_MANAGER` use
  the identical component; the only difference is which sectors the server told them they can
  pick from.

## 7. Device-linking flow changes (`screens/16-link-institution.md`)

State 2 ("Qual seu setor?") stops being a free-text input:

- After a successful invite-code lookup, the app calls a new unauthenticated
  `GET /institutions/:id/sectors` (active sectors only, `{ id, name }[]`) and renders them as a
  selectable list instead of a text field.
- If that list is empty, the screen shows "Seu hospital ainda não cadastrou os setores." and
  blocks completion — no free-text fallback. This pushes hospitals to register sectors before
  their médicos start linking, keeping the data model clean from day one.
- `useInstitutionLinkStore`'s persisted shape changes from
  `{ institutionId, institutionName, department, deviceSignalId }` to
  `{ institutionId, institutionName, sectorId, sectorName, deviceSignalId }`.
- `POST /signals/checkin` body changes from
  `{ institutionId, department, concerning, deviceSignalId }` to
  `{ institutionId, sectorId, concerning, deviceSignalId }`; the dedup key hashes in `sectorId`
  instead of the department string.
- The seeded "Zelo Demo" institution gets `Sector` rows matching its existing seeded `Signal`
  data's department names (e.g. "UTI", "Pronto-socorro", "Plantão noturno", "Ambulatório") so its
  dashboard keeps working after cutover — this is seed data, not a production backfill.

## 8. Testing

**Backend:**

- `SuperAdmin` auth round-trip (mirrors existing `ManagerTokenService`/`ManagerAuthGuard` test
  patterns): login succeeds/fails correctly, 401 on bad credentials or a tampered token.
- `POST /admin/institutions`: creates the institution and its first `HOSPITAL_ADMIN` manager
  atomically; the returned temp password verifies against the stored hash; duplicate institution
  name/invite code or manager name is rejected.
- Sector CRUD: unique-per-institution name enforced; deactivating hides the sector from
  `GET /institutions/:id/sectors` and from the manager's default filter options but not from
  historical `Signal` rows; reassigning `managerId` updates immediately.
- Manager CRUD: creating a `SECTOR_MANAGER` requires ≥1 `sectorId`; deactivating a manager nulls
  out their sectors' `managerId` without erroring; the "last active `HOSPITAL_ADMIN`" guard
  rejects self-deactivation when no other active hospital admin exists in the institution.
- `GetManagerSignalsUseCase`: a `SECTOR_MANAGER` requesting a `sectorId` outside their assignment
  gets it silently dropped, not a 403; a `HOSPITAL_ADMIN`'s unfiltered request returns every
  active sector; k-anonymity threshold still applies per `institutionId + sectorId`.
- `POST /signals/checkin`: dedup key now keyed on `sectorId`; a check-in against an inactive
  sector still succeeds (médicos already linked keep working).

**Frontend:**

- Admin panel: create sector (with suggestion chips), create manager (temp-password dialog shown
  once), deactivate manager (their sectors show as unassigned afterward), role-gated route (a
  `SECTOR_MANAGER` hitting `/manager/admin` is redirected and doesn't see the nav item either).
- Link-institution flow: sector list renders after a successful code lookup; an empty sector list
  blocks completion with the inline message; selecting a sector and completing persists
  `sectorId`/`sectorName` correctly.
- Dashboard filter: multiselect defaults to all accessible sectors; narrowing the selection
  re-fetches and reflects fewer segments; a `SECTOR_MANAGER`'s options never include a sector
  outside their assignment.

## 9. Migration

Additive except for `signals`, which is a clean cutover (no backfill, per §1):

- `CREATE TABLE super_admins (...)`.
- `CREATE TABLE sectors (...)` with the FK to `institutions` and the unique
  `(institutionId, name)` index.
- `ALTER TABLE managers ADD COLUMN role ... NOT NULL DEFAULT 'HOSPITAL_ADMIN'`, `ADD COLUMN
  is_active ... NOT NULL DEFAULT true` — safe defaults, no backfill logic needed since every
  existing seeded manager becoming an active hospital admin is the correct starting state.
- `DROP TABLE signals` and recreate it with `sector_id` instead of `department` (same
  disposable-demo-data reasoning already used for the prior `department` → `institutionId`
  migration) — existing demo rows are not preserved; the seed script recreates `Sector` rows for
  Zelo Demo and re-seeds `Signal` rows against them in the same run.
- No change to `institutions`, `manager_insights`, or `signal_dedup_keys` beyond what §3 already
  describes (the dedup key's hash input changes, but the table's shape doesn't).

## 10. Out of scope (explicitly)

- Anonymous peer-doctor chat — separate, follow-up spec.
- Backfilling old free-text `department` values into `Sector` rows.
- Deleting managers or sectors outright — deactivation only.
- Self-service super-admin signup — seed-created only.
- Institution deactivation/deletion.
- `TD-001` (manager session token storage/cookie migration) — untouched.
- Sector-level scoping for `ManagerInsight` — stays institution-wide.
- Multiple managers per sector (co-coverage) — one manager per sector in this spec; revisit only
  if a real hospital needs shared sector coverage.
