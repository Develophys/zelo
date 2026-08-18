<div align="center">

<img src="apps/web/public/zelo_logo.png" alt="Zelo" width="120" />

# Zelo

**Confidential burnout triage and peer support for doctors — built so the employer who pays for it never sees who used it.**

[![API](https://github.com/Develophys/zelo/actions/workflows/api.yml/badge.svg)](https://github.com/Develophys/zelo/actions/workflows/api.yml)
[![Web](https://github.com/Develophys/zelo/actions/workflows/web.yml/badge.svg)](https://github.com/Develophys/zelo/actions/workflows/web.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A59-F69220?logo=pnpm&logoColor=white)
![License](https://img.shields.io/badge/license-proprietary-lightgrey)

🇺🇸 English · [🇧🇷 Português](README.pt-BR.md)

</div>

---

## Why Zelo

57% of Brazilian doctors report burnout symptoms; fewer than 12% ever seek help, and physician suicide rates run more than double the general population (CFM/AMB, 2022). The reason isn't a lack of care — it's the fear that admitting distress reaches an employer or the medical board and damages a career.

Zelo is a mobile-first PWA that gives doctors a validated self-assessment (PHQ-9, GAD-7, MBI-HSS) with **scoring computed on-device**, an AI-assisted, human-backed support chat, anonymous peer matching, and opt-in crisis escalation — while hospitals and cooperatives who fund the tool only ever see anonymized, aggregate risk trends, never an individual's identity.

> Built during the **1ª Jornada Incubintech** open-innovation program (27 Jun – 25 Jul 2026) for the "Saúde do Médico" (Physician Health) challenge.

## How it stays confidential

- **Client-side scoring** — assessment results are computed on the device; raw answers are never persisted server-side in the clear.
- **Employer sees aggregates only** — the institutional dashboard reports anonymized metrics by shift/department, never per-individual data.
- **Identity disclosure is opt-in** — a doctor's identity is only exposed if *they* actively choose to escalate to a human.
- **No AI diagnosis** — the support chat is a humanized triage layer with an always-visible path to a real person, never a diagnostic tool.

See [`general-documentations/documentacao-produto/prd.md`](general-documentations/documentacao-produto/prd.md) for full product requirements and [`docs/superpowers/specs/2026-07-07-pwa-architecture.md`](docs/superpowers/specs/2026-07-07-pwa-architecture.md) for the technical architecture.

## Tech stack

| | |
| --- | --- |
| **Frontend** | React 19 + Vite, TanStack Query, Zustand, Tailwind CSS 4, PWA (installable, offline-capable) |
| **Backend** | NestJS 10, Prisma 7 (Neon serverless Postgres adapter), Groq SDK for LLM inference |
| **Shared** | Zod-based domain schemas (`packages/domain`), shared lint/tsconfig base (`packages/config`) |
| **Tooling** | Turborepo, pnpm workspaces, dependency-cruiser for architecture boundaries, Vitest |
| **Infra** | Fly.io (API), GitHub Pages (Web), Neon Postgres, Docker Compose for local parity |

## Repository map

```text
apps/
  web/      React + Vite PWA frontend
  api/      NestJS backend
packages/
  domain/   Shared Zod schemas + TS types (no business logic)
  config/   Shared tsconfig/eslint/prettier/dependency-cruiser base config
docker/     Local Docker Compose environment (production-like builds)
general-documentations/   Product docs: PRD, personas, roadmap, problem statement
docs/superpowers/         Technical specs and implementation plans
```

## Getting started

**Prerequisites:** Node ≥20 (repo pins 24 via `.nvmrc`), pnpm ≥9.

```bash
pnpm install
```

### Backend (`apps/api`)

Requires `DATABASE_URL`. Copy the example env and point it at a running Postgres instance:

```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter @zelo/api dev
```

See [`docs/superpowers/plans/2026-07-07-02-backend-foundation.md`](docs/superpowers/plans/2026-07-07-02-backend-foundation.md) (Task 2) for a manual Postgres setup, or use the Docker environment below.

### Frontend (`apps/web`)

Requires `VITE_API_BASE_URL`:

```bash
cp apps/web/.env.example apps/web/.env
pnpm --filter @zelo/web dev
```

Run alongside the API to see the live health-check banner.

### Common commands

| Command | Description |
| --- | --- |
| `pnpm build` | Build all packages/apps in dependency order (Turborepo) |
| `pnpm dev` | Run all apps in dev mode |
| `pnpm lint` | Lint all packages/apps |
| `pnpm lint:boundaries` | Enforce Clean Architecture layer boundaries (dependency-cruiser) |
| `pnpm test` | Run all test suites |

## Local Docker environment

Runs actual production builds of `apps/api` and `apps/web` against a containerized Postgres — use this to catch build-only issues before a demo, not for day-to-day development.

```bash
cd docker
cp .env.example .env.docker   # first time only
docker compose up --build -d
```

- API: http://localhost:3000 (health check: `curl http://localhost:3000/health`)
- Web: http://localhost:8080
- Postgres: `localhost:5432` (credentials in `docker/.env.docker`)

Tear down with `docker compose down` (add `-v` to also wipe the Postgres volume).

## Deployment

- **`apps/api`** deploys to Fly.io (`zelo-api`), backed by Neon Postgres.
- **`apps/web`** deploys to GitHub Pages.
- **`apps/web`** also packages as an installable Android APK via Capacitor — see [`docs/android-apk.md`](docs/android-apk.md).

Both auto-deploy from `main` via `.github/workflows/api.yml` / `web.yml`, gated on changes to the relevant app plus `packages/domain`/`packages/config`. Migrations are **not** run on container boot — apply them manually before deploying a schema change:

```bash
pnpm --filter @zelo/api exec prisma migrate deploy   # DIRECT_DATABASE_URL must point at Neon
```

### Secrets (Fly.io)

`MANAGER_TOKEN_SECRET`, `ADMIN_TOKEN_SECRET`, and `PEER_PARTNER_TOKEN_SECRET` sign session
tokens for each account type. `env.validation.ts` fails the boot in production
(`NODE_ENV=production`, declared both in `fly.toml` and `docker/api.Dockerfile`) if any of
these are missing or under 32 characters — this rejects the local-dev placeholder
(`change-me-in-production`) and any other weak value. Rotate them with three independent
values, never one shared secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # run 3x, one per secret
fly secrets set MANAGER_TOKEN_SECRET=<value> ADMIN_TOKEN_SECRET=<value> PEER_PARTNER_TOKEN_SECRET=<value> --app zelo-api
```

`fly secrets set` triggers an automatic rolling restart. Verify afterward with `fly status --app zelo-api` and `curl https://zelo-api.fly.dev/health`.

### Rollback (Fly.io)

Rollback is intentionally manual — treat it as a deliberate decision, not an automated safety net:

```bash
fly releases --app zelo-api                                    # list prior releases
fly deploy --image <previous-image-ref> --app zelo-api         # redeploy a specific image
```

## Documentation

- [`general-documentations/documentacao-produto/`](general-documentations/documentacao-produto/) — PRD, personas, lean canvas, OKRs, ADRs, competitive analysis
- [`general-documentations/jornada-checkpoints/`](general-documentations/jornada-checkpoints) — official Jornada Incubintech checkpoint deliverables
- [`docs/superpowers/specs/`](docs/superpowers/specs) — technical architecture specs
- [`docs/superpowers/plans/`](docs/superpowers/plans) — step-by-step implementation plans
- [`docs/android-apk.md`](docs/android-apk.md) — building, installing, and publishing the Android APK

---

<div align="center">
<sub>Private, proprietary project — not licensed for external use or redistribution.</sub>
</div>
