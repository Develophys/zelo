# apps/api/prisma

> **⚠️ After any schema change, migrate before you seed — and both before login works.**
> Neither `prisma migrate deploy` nor the seed script runs automatically against the deployed
> Fly.io/Neon database (see `docker/api.Dockerfile`) — both are manual steps, always. This
> matters more than "keep the demo numbers fresh": since this branch added the `Manager`
> table, a production deploy that skips `prisma migrate deploy` has no `managers` table at
> all, and `POST /manager/login` will fail with a `500`, not just serve stale data. After
> *any* deploy that changes `schema.prisma` — and specifically after this branch's `Manager`
> table addition — run, in order, against the production database: (1) `prisma migrate
> deploy`, then (2) the seed script (see "Re-seeding before a live demo" below). Skipping
> either step, or running them out of order, means manager login is broken in production
> until both have run.

## Seeding two institutions

`pnpm --filter @zelo/api prisma:seed` first upserts `INSTITUTION_SEED_ROSTER` (in
`seed-data.ts`) — two `Institution` rows, keyed by (unique) `name`:

| Name | Invite code | Purpose |
|---|---|---|
| Zelo Demo | `zelo-demo-2026` | matches the row id `demo-institution` that the `add_institution_scoping` migration inserted and backfilled all pre-existing `managers`/`manager_insights` rows onto |
| Hospital São Lucas (Demo) | `sao-lucas-2026` | a second institution seeded purely so cross-tenant isolation is visible when running the app locally, not just in tests |

Because the upsert is keyed on `name`, re-running the seed against a database that already
has the migration-inserted "Zelo Demo" row (id `demo-institution`) finds and reuses that
same row — it is never duplicated. All other seeded data (`Signal` rows, `Manager` rows) is
scoped to one institution or the other via `institutionId`, so nothing from one institution
is ever visible to a manager logged into the other.

## Seeding sectors

The same `prisma:seed` run upserts `SECTOR_SEED_ROSTER` (in `seed-data.ts`) — one `Sector`
row per entry, keyed by the unique `(institutionId, name)` pair. Every sector name referenced
by `ZELO_DEMO_SCENARIOS`/`SAO_LUCAS_DEMO_SCENARIOS` (below) must have a matching roster entry
here, or `seed.ts`'s `sectorId()` helper throws — the `Signal` rows those scenarios produce
now carry a `sectorId` foreign key, not a free-text department string, so a seed scenario
referencing an unregistered sector name is a seed-data bug, not a silently-accepted string.

## Seeding simulated manager-dashboard data

The same `prisma:seed` run populates the `signals` table with 6 weeks of fabricated
department check-in data per institution, powering `ManagerDashboardPage`. This is
**demo data, not real assessment data** — see
`docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md` for why the
manager dashboard can never read real (encrypted) assessments.

The script is idempotent: for each institution it deletes only that institution's existing
`Signal` rows (`WHERE institutionId = ...`) and regenerates them relative to today's date,
so re-running it mid-demo always produces a fresh, current 6-week window with no manual
cleanup and no cross-institution interference.

**"Concerning" rule:** a simulated check-in counts as concerning if it would have scored
"Moderado" or worse on the app's existing PHQ-9/GAD-7 severity bands (`apps/web/src/presentation/lib/band-for.ts`).
To change this bar, edit both the design spec (§3) and `seed-data.ts`'s scenario tables —
nothing else in the pipeline encodes this rule.

**k-anonymity threshold:** `K_ANONYMITY_THRESHOLD = 5`, defined in
`../src/modules/manager/application/constants.ts`. A department's data is only ever
returned by `GET /api/manager/signals` for weeks where it has at least this many check-ins.

**Seed scenario for "Zelo Demo"** (`seed-data.ts`'s `ZELO_DEMO_SCENARIOS`):

| Sector | checkIns/week | Concerning rate | Purpose |
|---|---|---|---|
| Pronto-socorro | 24 | flat 37.5% | baseline "normal" department |
| Plantão noturno | 18 | flat 50% | baseline "elevated but stable" |
| UTI | 10 | climbing 30% → 60% | demo narrative — visibly worsening trend |
| Ambulatório | 3 | irrelevant | always below k=5, proves suppression works |

**Seed scenario for "Hospital São Lucas (Demo)"** (`seed-data.ts`'s
`SAO_LUCAS_DEMO_SCENARIOS`):

| Sector | checkIns/week | Concerning rate | Purpose |
|---|---|---|---|
| UTI | 8 | climbing 12.5% → 25% | deliberately overlaps "Zelo Demo"'s UTI sector name with different numbers, so a running app visibly proves the two institutions' `UTI` data never merges |

## Seeding simulated follow-up KPI data

The same `prisma:seed` run also populates `simulated_follow_ups` with 6 weeks of fabricated
"crisis follow-up" send/response counts — **demo data, not real follow-up records**. It exists
so a follow-up response-rate KPI has believable history to render without needing real crisis
protocol usage yet.

Like `signals`, the script is idempotent: it deletes all existing `SimulatedFollowUp` rows
and regenerates them relative to today's date via `buildFollowUpSeedRows` in
`seed-data.ts`. Unlike `signals`, `SimulatedFollowUp` rows are not institution-scoped —
there is a single shared 6-week follow-up KPI history, not one per institution.

**Seed scenario** (`seed-data.ts`'s `FOLLOW_UP_SCENARIO`): 6 weeks, oldest first, with the
sent/responded counts climbing from 20 sent / 9 responded (45%) to 30 sent / 21 responded
(70%) — a believable, improving-but-imperfect response rate for the demo. Edit only that
table to change the scenario.

## Seeding manager accounts

The same `prisma:seed` run also upserts named manager accounts into the `managers`
table, replacing the old single shared `MANAGER_ACCESS_CODE`. Each manager is tied to one
institution via `institutionName` in `seed-data.ts`'s `MANAGER_SEED_ROSTER` (resolved to
that institution's id at seed time) — a manager only ever sees their own institution's data.
Each manager also has a `role`: `HOSPITAL_ADMIN` sees every sector in their institution and
can register sectors and manage other managers; `SECTOR_MANAGER` is scoped to only the
sectors listed in that roster entry's `sectorNames` (assigned via `Sector.managerId` at seed
time):

| Name | Institution | Role | Password | Override env var |
|---|---|---|---|---|
| Ana Konder | Zelo Demo | Gestora do hospital | zelo-ana-2026 | `MANAGER_SEED_PASSWORD_ANA` |
| Carlos Mendes | Zelo Demo | Gestor do hospital | zelo-carlos-2026 | `MANAGER_SEED_PASSWORD_CARLOS` |
| Paulo Reis | Zelo Demo | Gestor de setor (UTI) | zelo-paulo-2026 | `MANAGER_SEED_PASSWORD_PAULO` |
| Beatriz Lima | Hospital São Lucas (Demo) | Gestora do hospital | zelo-beatriz-2026 | `MANAGER_SEED_PASSWORD_BEATRIZ` |

Plaintext passwords in this table are intentional — this is local/demo data, matching the
same transparency `MANAGER_ACCESS_CODE=zelo-demo-2026` had in `.env.example` before this
migration. Passwords are hashed (scrypt, salted) before being stored; the table above is
the seed source, not what's in the database.

**Production/real deployments must never rely on the committed plaintext passwords above.**
Each roster entry in `seed-data.ts`'s `MANAGER_SEED_ROSTER` carries a `passwordEnvVar` name;
if that environment variable is set when the seed runs, it overrides the committed
`password` for that manager (see `seed.ts`). Set `MANAGER_SEED_PASSWORD_ANA` /
`MANAGER_SEED_PASSWORD_CARLOS` / `MANAGER_SEED_PASSWORD_PAULO` /
`MANAGER_SEED_PASSWORD_BEATRIZ` (or whatever `passwordEnvVar` names) to a real secret before
seeding a real deployment, so the credential that actually gets hashed and stored is never
the value sitting in git.

The upsert is keyed on `name` and **only ever sets a password when creating a brand-new
manager row** (`update: {}` — a re-seed never touches `passwordHash` for a manager that
already exists). This means re-running the seed never duplicates managers, never changes an
existing manager's password (even if the roster's committed/env-sourced password value
differs from what's live — e.g. someone rotated the password out-of-band), and only a truly
new name in `MANAGER_SEED_ROSTER` ever gets a password set from seed data. No signup
endpoint exists — new manager accounts are added by adding an entry to that array and
re-running the seed.

## Seeding the platform super-admin account

The same `prisma:seed` run also upserts `SUPER_ADMIN_SEED_ROSTER` (in `seed-data.ts`) into
the `super_admins` table — the one platform-level account that can log in at `/admin/login`
and create new institutions (`POST /admin/institutions`). There is no self-service super-admin
signup anywhere in the app; new super-admin accounts are added the same way new managers are:
add an entry to `SUPER_ADMIN_SEED_ROSTER` and re-run the seed.

| Name | Password | Override env var |
|---|---|---|
| Zelo Ops | zelo-ops-2026 | `SUPER_ADMIN_SEED_PASSWORD` |

Same plaintext-is-intentional caveat as the manager roster above: set `SUPER_ADMIN_SEED_PASSWORD`
to a real secret before seeding a real deployment.

## Re-seeding before a live demo

> **⚠️ Re-seeding now deletes real check-in data too, not just fabricated demo data.**
> Since the institution-linking branch, real médicos can link their device to either
> seeded institution via its invite code (`zelo-demo-2026` / `sao-lucas-2026`) and generate
> real check-ins through `POST /signals/checkin` — and those check-ins land in the exact
> same `Signal` rows that this seed script deletes and regenerates
> (`prisma.signal.deleteMany({ where: { institutionId: ... } })` in `seed.ts`). Before
> re-seeding against any environment where a real device might have linked to "Zelo Demo"
> or "Hospital São Lucas (Demo)" using those invite codes, confirm that discarding their
> accumulated check-in history is actually acceptable. For real pilot usage, prefer
> creating a dedicated, non-seeded institution rather than having real médicos link to
> either of these two demo institutions.

Migrations and seeding are never run automatically against the deployed Fly.io/Neon
database (see `docker/api.Dockerfile`) — both are manual steps. Since the seed is
generated relative to "today," data seeded a few days before a demo will show a stale
"current week." Re-run the seed against the production database on the morning of any
live demo so the current week's numbers are fresh:

```bash
DATABASE_URL="<neon pooled connection string>" \
DIRECT_DATABASE_URL="<neon direct connection string>" \
pnpm --filter @zelo/api exec tsx prisma/seed.ts
```

Both connection strings are already in `apps/api/.env`. Run `prisma migrate status` first
with the same env vars if a schema change shipped since the last deploy, to confirm
migrations are applied before seeding.
