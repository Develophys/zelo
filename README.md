# Zelo

Mobile-first PWA for confidential medical burnout triage and support. See `general-documentations/documentacao-produto/prd.md` for product requirements and `docs/superpowers/specs/2026-07-07-pwa-architecture.md` for the technical architecture.

## Repository Map

- `general-documentations/` — product docs: PRD, personas, roadmap, problem statement, source briefing PDFs
- `jornada-checkpoints/` — official Jornada Incubintech checkpoint submission deliverables
- `imported-skills/` — vendored pm-skills plugin, used to produce the documents above
- `docs/superpowers/specs/` — technical architecture spec(s)
- `docs/superpowers/plans/` — step-by-step implementation plans for the application
- `apps/`, `packages/`, `docker/` — the application itself (see "Monorepo Structure" below)

## Monorepo Structure

- `apps/web` — React + Vite PWA frontend
- `apps/api` — NestJS backend
- `packages/domain` — shared Zod schemas + TS types (no business logic)
- `packages/config` — shared tsconfig/eslint/prettier/dependency-cruiser base config

## Commands

- `pnpm install` — install all workspace dependencies
- `pnpm build` — build all packages/apps in dependency order (Turborepo)
- `pnpm lint` — lint all packages/apps
- `pnpm lint:boundaries` — enforce Clean Architecture layer boundaries (dependency-cruiser)
- `pnpm test` — run all test suites

## Backend local setup

`apps/api` requires a `DATABASE_URL` — copy `apps/api/.env.example` to `apps/api/.env` and point it at a running Postgres instance (see Plan 04 for the Docker Compose setup, or run one manually as shown in `docs/superpowers/plans/2026-07-07-02-backend-foundation.md` Task 2).

## Frontend local setup

`apps/web` requires `VITE_API_BASE_URL` — copy `apps/web/.env.example` to `apps/web/.env`. Run `pnpm --filter @zelo/web dev` with `apps/api` (Plan 02) running to see the live health-check banner.

## Local Docker Environment

Runs actual production builds of `apps/api` and `apps/web` against a containerized Postgres — use this to catch build-only issues before a demo, not for day-to-day development (use `pnpm --filter @zelo/api dev` / `pnpm --filter @zelo/web dev` for that).

```bash
cd docker
cp .env.example .env.docker   # first time only
docker compose up --build -d
```

- API: http://localhost:3000 (health check: `curl http://localhost:3000/health`)
- Web: http://localhost:8080
- Postgres: localhost:5432 (credentials in `docker/.env.docker`)

Tear down with `docker compose down` (add `-v` to also wipe the Postgres volume).

## Deployment

`apps/api` deploys to Fly.io (`zelo-api`), backed by Neon Postgres. `main` pushes touching `apps/api` or `packages/domain`/`packages/config` that pass CI auto-deploy via `.github/workflows/api.yml`'s `deploy` job. `apps/web` deploys to GitHub Pages the same way via `.github/workflows/web.yml`, gated on `apps/web`/`packages/domain`/`packages/config` changes instead. Migrations are **not** run on container boot — apply them manually before deploying a schema change:

```bash
pnpm --filter @zelo/api exec prisma migrate deploy   # DIRECT_DATABASE_URL must point at Neon
```

## Rollback (Fly.io)

If a deploy breaks production:

1. `fly releases --app zelo-api` — lists prior releases with their image references.
2. `fly deploy --image <previous-image-ref> --app zelo-api` — redeploys a specific prior image.

Rollback is intentionally a manual command, not automated — treat it as a deliberate decision, especially close to the demo (2026-07-25).
