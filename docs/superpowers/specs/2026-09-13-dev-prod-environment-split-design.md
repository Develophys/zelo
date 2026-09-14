# Dev/Prod Environment Split

**Date:** 2026-09-13

## Problem

Zelo has always had a single deployed environment: one Fly app (`zelo-api`), one
production database, one live Vercel frontend project, all driven by pushes to `main`.
This was an explicit, documented choice for the hackathon phase (`2026-07-09-fly-neon-
deployment-design.md` scoped staging/preview environments as out-of-scope). Mauricio is
now starting to onboard a real institution, and prod was just cleaned of demo data (only
"Zelo Demo" and one real `SuperAdmin` remain — see the manual prod cleanup performed
2026-09-13). Continuing to push demo/experimental work straight to the same database and
Fly app that a real institution will use is no longer acceptable.

This spec adds a second, fully independent environment ("dev") that mirrors prod's
topology, plus branch protection so neither environment can be pushed to directly.

## Approach

Two independent stacks, isolated at every layer (own Fly app, own database, own Vercel
project, own secrets) so nothing in dev can leak into or corrupt prod:

| | Prod (existing) | Dev (new) |
|---|---|---|
| Fly app | `zelo-api` | `zelo-api-dev` |
| Fly config | `fly.toml` | `fly.dev.toml` |
| Database | current Prisma Postgres | new, separate Prisma Postgres database |
| Frontend | current Vercel project | new Vercel project |
| Domain | `zelohealth.app` | `dev.zelohealth.app` |
| Deploy branch | `main` | `develop` |
| Migrations | manual (`prisma migrate deploy`, run by hand) | automatic in CI |
| `EMAIL_PROVIDER` | `resend` | `resend` (`env.validation.ts` requires `resend` whenever `NODE_ENV=production`, and dev boots with `NODE_ENV=production` too, same as prod — `mock` fails startup; discovered during rollout 2026-09-13) |
| Token secrets | existing Fly secrets | freshly generated, independent values |

Local day-to-day development (docker-compose Postgres via
`apps/api/.env.development.local`) is untouched — it's a third, separate tier (your
machine) from this deployed dev environment.

### 1. Branching & branch protection

- Create `develop` from current `main`.
- Rename `api.yml`'s and `web.yml`'s `test` jobs to `api-test`/`web-test` — both files
  currently name their test job `test`, which collides as an ambiguous status-check name
  once two workflows exist side by side.
- GitHub branch protection on both `main` and `develop`:
  - Require a pull request before merging (no direct pushes to either branch).
  - Do **not** mark `api-test`/`web-test` as required status checks: both workflows are
    `paths:`-filtered at the trigger level, so a PR touching only one app never runs the
    other workflow at all — requiring both would block that PR forever waiting on a check
    that never fires. Making CI genuinely required needs moving the path filter from the
    trigger down to a job-level condition first (so the workflow always runs and always
    posts a status); that refactor is out of scope here. The checks still run and show
    their result on PRs that touch the relevant paths — they're just not merge-blocking.
  - No minimum-approval-count requirement (solo dev) — the PR is the gate, not a second
    reviewer.
  - `enforce_admins: true` on both — GitHub's default exempts repo admins from their own
    branch protection, which would let the owner account keep pushing directly. Confirmed
    the gap for real during rollout (a non-dry-run push to `main` succeeded with a
    "Bypassed rule violations" notice before this was set) and closed it.
- Flow going forward: work lands on `develop` via PR → auto-deploys to dev → once
  validated, PR `develop → main` → auto-deploys to prod.

### 2. Backend: Fly app + database

- New `fly.dev.toml` at repo root: same `docker/api.Dockerfile`, same region (`gru`), `app
  = "zelo-api-dev"`. Same `/health` check.
- New Prisma Postgres database (separate instance from prod). `DATABASE_URL` /
  `DIRECT_DATABASE_URL` set as Fly secrets on `zelo-api-dev` only — never shared with
  prod's values.
- Independent `MANAGER_TOKEN_SECRET` / `ADMIN_TOKEN_SECRET` / `PEER_PARTNER_TOKEN_SECRET`,
  freshly generated (`crypto.randomBytes(32).toString("hex")`, same method the
  2026-08-04 secret-management spec used for prod) — a dev session token must never be
  valid against prod or vice versa.
- `CORS_ALLOWED_ORIGINS` on `zelo-api-dev` contains only the dev Vercel domain.
- `EMAIL_PROVIDER=resend` on dev, with its own `RESEND_API_KEY` — `mock` was the original
  intent but `env.validation.ts` rejects it whenever `NODE_ENV=production`, and dev boots
  with `NODE_ENV=production` too (same Dockerfile/fly.toml pattern as prod, discovered
  when the first dev deploy crash-looped on this exact guard). Invite/reset emails from
  dev are real sends — worth knowing when testing those flows there.
- Migrations: a new CI job runs `prisma migrate deploy` automatically against the dev
  database on every push to `develop`, before the Fly deploy step. This differs from
  prod, where migrations stay manual — dev is lower-stakes and this removes a manual step
  from the inner dev loop.
- After first deploy, seed the dev database (`pnpm --filter @zelo/api prisma:seed`) so the
  demo institutions/managers/signals removed from prod now live here instead.

### 3. Frontend: Vercel + DNS

- New Vercel project — created via CLI (`vercel project add`/`link`/`git connect`), not
  the dashboard as originally planned; Mauricio has the CLI installed and authenticated,
  making this fully automatable — same `apps/web/vercel.json` build config, with:
  - Custom domain `dev.zelohealth.app` bound directly to the `develop` branch's Preview
    deployments via the domain's `gitBranch` field
    (`PATCH /v9/projects/{id}/domains/{domain}` → `{"gitBranch":"develop"}`), **not**
    Production Branch tracking. Production Branch tracking (`link.productionBranch` /
    the newer per-environment `branchMatcher`) turned out to be broken for this
    project on Vercel's side — confirmed via the dashboard and every API write path
    tried — so the domain-level `gitBranch` binding is used instead; it doesn't depend
    on that setting at all and arguably fits a solo-owner project better.
  - SSO deployment protection disabled for the project (`vercel project protection
    disable --sso`) — binding a domain via `gitBranch` doesn't inherit Production's
    protection-exemption for custom domains, so without this the domain redirected to a
    Vercel login page.
  - `VITE_API_BASE_URL` pointed at the dev API.
- The dev API itself is reached at its default `zelo-api-dev.fly.dev` hostname — no custom
  domain or cert needed for the API, only the frontend gets the friendly subdomain.

### 4. Retire the GitHub Pages deploy (keep the web `test` job)

`web.yml`'s `build`/`deploy` jobs publish to GitHub Pages — dead weight, since Vercel is
the only origin the API's CORS list actually allows, so the Pages site has been
unreachable already. Remove those two jobs as part of this change — with two real
environments now live, keeping a third, non-functional deploy target only adds confusion.
The `test` job in the same file (lint + test + build, required as a branch-protection
status check per §1) stays as-is.

### 5. Env file reorg (fixes the inverted `.env` naming)

Today, `apps/api/.env` (the base, lowest-precedence file in the `load-env.ts` cascade)
holds **production** secrets, while `.env.development.local` holds the real local-dev
values — backwards from convention, and the exact kind of footgun that let this get
confusing in the first place. Reorganizing:

- Rename current `apps/api/.env` (prod secrets, `db.prisma.io` prod URL) →
  `apps/api/.env.production.local`. Still gitignored; still only loaded when
  `NODE_ENV=production` is set for a one-off local command (manual prod migrations,
  future prod admin scripts), exactly as today.
- New `apps/api/.env` becomes safe local-dev defaults (mirrors `.env.example` /
  today's `.env.development.local` content) — so any command run without `NODE_ENV` set
  can never accidentally touch prod.
- `apps/api/.env.development.local` keeps its existing role unchanged (per-developer
  local overrides, e.g. the docker Postgres credentials).
- New `apps/api/.env.dev-remote.local` (gitignored) holds the **deployed dev
  environment's** database credentials, for the rare one-off script run against
  `zelo-api-dev`'s database from a developer machine. This is deliberately *not* part of
  the automatic `NODE_ENV` cascade (there's no fourth `NODE_ENV` value) — it's sourced
  explicitly, the same deliberate/manual spirit already used for prod.
- Update `README.md`'s Deployment section to document both environments, the branch
  flow, and where each environment's credentials live.

## Rollout / verification

1. Create `develop` branch, apply branch protection to `main` and `develop`.
2. Provision the new Prisma Postgres database and Fly app `zelo-api-dev`; set secrets.
3. Add the new CI job(s) for dev (migrate + deploy on push to `develop`); delete the
   GitHub Pages workflow.
4. Create the Vercel project for dev, attach `dev.zelohealth.app`, add the DNS record.
5. Push a trivial change to `develop`, confirm: CI green, dev API `/health` OK, dev
   frontend loads, migrations applied, seed data present, login works end-to-end against
   the dev stack.
6. Rename/reorganize the local `.env*` files and update the README.
7. Open the `develop → main` PR path once, confirming the protected-branch merge flow
   works as expected.

## Out of scope

- A separate domain purchase (`zelohealth-dev.app`) — using a subdomain of the existing
  `zelohealth.app` instead.
- Vercel Preview Deployments per-PR — not replacing the persistent dev environment (could
  be added later, independently).
- Automating Vercel project creation or DNS record creation as code — both are manual,
  one-time dashboard/registrar steps documented in the rollout section, not repo files.
- Any further secret-rotation tooling beyond generating dev's initial values (see the
  2026-08-04 production-secret-management spec's own out-of-scope note).
