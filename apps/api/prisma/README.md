# apps/api/prisma

## Seeding simulated manager-dashboard data

`pnpm --filter @zelo/api prisma:seed` populates the `simulated_signals` table with 6 weeks
of fabricated department check-in data, powering `ManagerDashboardPage`. This is
**demo data, not real assessment data** — see
`docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md` for why the
manager dashboard can never read real (encrypted) assessments.

The script is idempotent: it deletes all existing `SimulatedSignal` rows and regenerates
them relative to today's date, so re-running it mid-demo always produces a fresh, current
6-week window with no manual cleanup.

**"Concerning" rule:** a simulated check-in counts as concerning if it would have scored
"Moderado" or worse on the app's existing PHQ-9/GAD-7 severity bands (`apps/web/src/presentation/lib/band-for.ts`).
To change this bar, edit both the design spec (§3) and `seed-data.ts`'s `SCENARIOS` table —
nothing else in the pipeline encodes this rule.

**k-anonymity threshold:** `K_ANONYMITY_THRESHOLD = 5`, defined in
`../src/modules/manager/application/constants.ts`. A department's data is only ever
returned by `GET /api/manager/signals` for weeks where it has at least this many check-ins.

**Seed scenario** (`seed-data.ts`'s `SCENARIOS`):

| Department | checkIns/week | Concerning rate | Purpose |
|---|---|---|---|
| Pronto-socorro | 24 | flat 37.5% | baseline "normal" department |
| Plantão noturno | 18 | flat 50% | baseline "elevated but stable" |
| UTI | 10 | climbing 30% → 60% | demo narrative — visibly worsening trend |
| Ambulatório | 3 | irrelevant | always below k=5, proves suppression works |

## Seeding simulated follow-up KPI data

The same `prisma:seed` run also populates `simulated_follow_ups` with 6 weeks of fabricated
"crisis follow-up" send/response counts — **demo data, not real follow-up records**. It exists
so a follow-up response-rate KPI has believable history to render without needing real crisis
protocol usage yet.

Like `simulated_signals`, the script is idempotent: it deletes all existing
`SimulatedFollowUp` rows and regenerates them relative to today's date via
`buildFollowUpSeedRows` in `seed-data.ts`.

**Seed scenario** (`seed-data.ts`'s `FOLLOW_UP_SCENARIO`): 6 weeks, oldest first, with the
sent/responded counts climbing from 20 sent / 9 responded (45%) to 30 sent / 21 responded
(70%) — a believable, improving-but-imperfect response rate for the demo. Edit only that
table to change the scenario.

## Seeding manager accounts

The same `prisma:seed` run also upserts two named manager accounts into the `managers`
table, replacing the old single shared `MANAGER_ACCESS_CODE`:

| Name | Password |
|---|---|
| Ana Konder | zelo-ana-2026 |
| Carlos Mendes | zelo-carlos-2026 |

Plaintext passwords in this table are intentional — this is local/demo data, matching the
same transparency `MANAGER_ACCESS_CODE=zelo-demo-2026` had in `.env.example` before this
migration. Passwords are hashed (scrypt, salted) before being stored; the table above is
the seed source, not what's in the database.

The upsert is keyed on `name`, so re-running the seed never duplicates managers or
changes an existing manager's password unless the roster in `seed-data.ts`'s
`MANAGER_SEED_ROSTER` changes. No signup endpoint exists — new manager accounts are added
by editing that array and re-running the seed.

## Re-seeding before a live demo

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
