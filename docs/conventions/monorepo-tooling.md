# Monorepo tooling — workspace, build, CI/CD, Prisma, and deploy topology

A pnpm workspace with four packages (`apps/api`, `apps/web`, `packages/domain`,
`packages/config`) driven by Turborepo. Every `file:line` citation below was re-checked against
the live repo while writing this file — treat each one as the thing to re-run, not a summary to
trust.

## 1. Workspace + Turborepo

Every internal dependency is declared `"workspace:*"` — never a semver range, never a `file:`
path (5 declarations: `apps/api/package.json:36,53`, `apps/web/package.json:24,48`,
`packages/domain/package.json:22`). A version range would try to resolve these private packages
from the registry, where they don't exist. Every workspace package also carries `"version":
"0.0.0"`, `"private": true`, `"license": "UNLICENSED"` — nothing here is ever published; don't
add `publishConfig`, changesets, or a real version bump.

`turbo.json` declares exactly 5 tasks — `build`, `dev`, `lint`, `lint:boundaries`, `test` —
mirroring the 5 root `package.json` scripts exactly. **Register a task in `turbo.json` only if
it's meant to run across the workspace via `turbo run`.** Package-local scripts are deliberately
*not* turbo tasks: `apps/api`'s `postinstall`, `start`, `prisma:generate`, `prisma:seed`,
`admin:create`, and `apps/web`'s `build:native`, `android:sync` all stay outside `turbo.json`.
There is exactly one `turbo.json` in the repo — no per-package overrides — so the `build` task's
shape (`dependsOn: ["^build"]`, `outputs: ["dist/**"]`, `turbo.json:4-8`) is a single root
definition, not a pattern to replicate per package.

**Any env var a build or test reads must be declared on that task's `env` array before it's used
in code**, or a Turborepo cache hit can silently serve a build compiled against a different
value. `turbo.json:7` declares `VITE_API_BASE_URL` and `VITE_BASE_PATH` on `build`; `turbo.json:19`
declares `DATABASE_URL` on `test` (the `api-test` CI job needs it to reach the ephemeral
Postgres). Both were dedicated fixes, not there from the start (commits `5f061e7`, `f2a3c7d`) —
so treat a new `import.meta.env.VITE_*` read the same way. One gap survives today:
`apps/web/vite.config.ts:38` reads `VITE_DISABLE_PWA` to disable the service worker, and it is
not declared anywhere in `turbo.json`'s `build.env` — the same class of bug the two fixes above
already closed once, just not for this variable.

**Mirror:** `turbo.json`.

## 2. `packages/domain` vs `packages/config`

**`packages/domain`** holds shared Zod schemas, types, and pure functions consumed by both
`apps/api` and `apps/web` — its only dependency is `zod` (`packages/domain/package.json:18-20`).
Export everything from `src/index.ts` with a `.ts` specifier (7 `export * from "./….ts"` lines)
and import the package only as the bare `@zelo/domain` — never a deep subpath. Its `exports` map
has a single `"."` entry (`packages/domain/package.json:9-11`), so a deep import wouldn't
resolve anyway: re-verified fresh, `@zelo/domain` has 34 consumers (17 files under
`apps/api/src`, 17 under `apps/web/src`) and zero deep (`@zelo/domain/…`) imports across
`apps/api` and `apps/web`. Never put React, NestJS, Prisma, or a browser API here —
dependency-cruiser enforces the app-side layering that depends on this package staying
framework-free.

**`packages/config`** holds shared *tool* configuration — it ships raw `.json`/`.mjs`/`.cjs`
files addressed by their exact `exports` key, has no `main`, no `types`, and no `scripts` block
at all (`packages/config/package.json`), so a config file added here without a matching
`exports` entry is unresolvable as `@zelo/config/…`. Two different consumption patterns coexist
by design:

- **ESLint and TypeScript configs are re-exported verbatim.** All three `eslint.config.mjs`
  files are `import base from "@zelo/config/eslint.base"; export default base;`, and all three
  workspace `tsconfig.json` files `"extends": "@zelo/config/tsconfig.base.json"`
  (`apps/api/tsconfig.json:2`, `apps/web/tsconfig.json:2`, `packages/domain/tsconfig.json:2`).
  Each workspace still overrides locally what it genuinely differs on — `module`/
  `moduleResolution`, `lib`, `jsx`, `types`, emit settings, `baseUrl`/`paths`, and even a
  targeted strictness relaxation (`apps/api/tsconfig.json:12`,
  `"strictPropertyInitialization": false`) — but never restates `target`, `strict`, or
  `noUncheckedIndexedAccess`, which stay whatever `tsconfig.base.json` says.
- **dependency-cruiser is the opposite: the shared base is an intentionally empty shell** —
  `packages/config/dependency-cruiser.base.cjs` declares `forbidden: []` and only
  `tsPreCompilationDeps: true`. Every real architecture-boundary rule lives in the package's own
  `.dependency-cruiser.cjs` (three exist: `apps/api`, `apps/web`, `packages/domain`), spreading
  `...base.forbidden` / `...base.options` rather than restating the mechanism. This is
  deliberate, not the shared config "silently" losing a rule — each package has a different
  layer shape (Clean Architecture in `apps/api`, presentation/use-case/infrastructure in
  `apps/web`, a flat barrel in `packages/domain`), so the rules can't be shared.

**Mirror files:** `packages/domain/src/index.ts`; `apps/web/.dependency-cruiser.cjs`.

## 3. Two build strategies — a deliberate split, not an inconsistency

`apps/api`'s build is `tsc -p tsconfig.json && tsc-alias -p tsconfig.json`
(`apps/api/package.json:9`). `apps/web`'s build is `tsc -p tsconfig.json --noEmit && vite build`
(`apps/web/package.json:8`). **These differ because the two apps ship fundamentally different
kinds of output, not because one needs to be brought in line with the other:**

- `apps/api` ships as plain Node ESM, executed directly — `docker/api.Dockerfile:31` runs
  `CMD ["node", "apps/api/dist/src/main.js"]`, and `apps/api/package.json:10`'s `start` script
  does the same. `tsc` has to actually emit here (NestJS's decorator metadata needs real
  compiled output), and `tsc-alias` runs immediately after to rewrite `"@/…"` alias specifiers
  into relative paths inside `dist/` — Node has no bundler to resolve a bare alias at runtime,
  so skipping this step would crash on the first aliased import.
- `apps/web` ships as a bundled browser artifact. Its `tsc --noEmit` exists purely as a typecheck
  gate in front of `vite build`, which does the actual emitting and bundling. There is nothing
  for `tsc` to hand off here — Vite resolves and bundles independently.

**Do not** replace the API's `tsc && tsc-alias` build with a bundler (esbuild/tsup/SWC/`nest
build`), and do not make the web build emit via `tsc`. The import-extension conventions follow
the same split and are inverted from what looks natural: in `apps/api`, relative imports end in
`.ts` (`rewriteRelativeImportExtensions` rewrites these to `.js` on emit — 481 do, 0 use `.js`)
while `"@/"` alias imports end in `.js` (190 do, since `tsc-alias` expects the extension already
resolved); in `apps/web`, every import — relative and `"@/"` alike — is extensionless (0 of 1415
imports carry any extension), because Vite's bundler resolution never uses one.

**Mirror files:** `apps/api/package.json`; `apps/web/package.json`.

## 4. CI split — `api.yml` vs `web.yml`

Two independent, path-filtered workflows, each gated by a YAML anchor reused for both `push` and
`pull_request` — `&api-paths` (`.github/workflows/api.yml:6-19`, reused at `:21`) and
`&web-paths` (`.github/workflows/web.yml:6-16`, reused at `:18`). Both anchors include
`packages/domain/**` and `packages/config/**`, so a shared-package edit runs both suites; an
`apps/api`-only change never triggers `web.yml` and vice versa. **When a new root-level file
affects one app's build or deploy, add its path to that app's anchor in the same commit** (the
precedent: commit `367e598` added `docker/api.Dockerfile` and `.dockerignore` to `&api-paths`).
One existing gap: `fly.dev.toml` is *not* in `&api-paths` even though `fly.toml` is, despite
`deploy-dev` consuming it at `api.yml:138` — a dev-only Fly config change merges without
triggering the workflow that would deploy it.

Both workflows resolve Node via `node-version-file: '.nvmrc'` (pinned to `24`) and pnpm via
`pnpm/action-setup@v4` with no version input, reading `packageManager: "pnpm@9.12.0"` from the
root `package.json` — never hardcode a `node-version` in a workflow step.

**Install with `pnpm install --frozen-lockfile --filter=@zelo/<app>...`** in every CI job and in
`apps/web/vercel.json:3` — never a bare `pnpm install` in CI or on a deploy host. This is the
fix for a real bug: an unfiltered install runs `apps/api`'s `prisma generate` postinstall during
web builds (`apps/api/package.json:8` is the only `postinstall` in the repo; commit `e8e1763`
fixed it). Every `turbo run <task>` step downstream carries the identical
`--filter=@zelo/<app>...`, not just the install step (`api.yml:72,75,81,84`,
`web.yml:50,53,56,59` — all eight invocations, plus `apps/web/vercel.json:4`). **This rule
flips inside a Dockerfile**: install bare, but only *after* `turbo prune` has already reduced the
workspace to the target package (`docker/api.Dockerfile:13` adds `--ignore-scripts` and an
explicit `prisma generate` step; `docker/web.Dockerfile:12` installs plain).

**`api.yml`**'s `api-test` job runs against a real `postgres:16-alpine` service container, with
`DATABASE_URL` and `DIRECT_DATABASE_URL` both set at job level (`api.yml:48-49`) and `prisma
generate` then `prisma migrate deploy` run as explicit steps before `Test`. Two deploy jobs
follow, each gated `needs: api-test`: `deploy` (push to `main` → `flyctl deploy --config
fly.toml`, app `zelo-api`, `FLY_API_TOKEN`) and `deploy-dev` (push to `develop` → `fly.dev.toml`,
app `zelo-api-dev`, `FLY_API_TOKEN_DEV`) — both end with a `curl .../health` assertion. Any new
deploy job must keep that curl gate; it's the only automated check that the released machine
actually booted.

**`web.yml` has one job, `web-test`, ending at `Build` — there is no deploy step, and none
should be added.** Vercel deploys through its own git integration reading
`apps/web/vercel.json`'s `installCommand`/`buildCommand` (both `cd ../.. &&` a filtered
`turbo`/`pnpm` invocation), independent of this workflow — a red `web.yml` run does not block a
Vercel deploy.

**Mirror files:** `.github/workflows/api.yml`; `.github/workflows/web.yml`; `apps/web/vercel.json`.

## 5. Prisma — schema, env split, and the #1 priority danger

Schema lives at `apps/api/prisma/schema.prisma`, `generator client` with `provider =
"prisma-client"` and `output = "../generated/prisma"`; the `datasource` block deliberately
carries only `provider = "postgresql"`, no `url` field. The connection string is injected by
`apps/api/prisma.config.ts:11`, `datasource.url = env("DIRECT_DATABASE_URL")` — **do not add
`url = env("DATABASE_URL")` back into `schema.prisma`**; that would route migrations through the
pooled connection instead of the direct one. Import the generated client and its types from the
relative `…/generated/prisma/client.ts` path (6 files do: `prisma.service.ts:8` plus 5
repositories) — never from `"@prisma/client"` (0 imports repo-wide) — while still importing
`@prisma/adapter-pg` / `@prisma/adapter-neon` from `node_modules` as ordinary packages
(`prisma.service.ts:4-5`).

**Two env vars, two different readers, and they must agree.** `PrismaService` reads
`process.env.DATABASE_URL` directly and switches to the `PrismaNeon` adapter only when that
host contains `.neon.tech` (`prisma.service.ts:18-29`); the Prisma CLI — `prisma generate`,
`prisma migrate deploy`, `prisma db seed` — reads `DIRECT_DATABASE_URL` via `prisma.config.ts:11`.
Both must be set in every env file this cascade can reach, because they are read by two entirely
separate code paths.

**Flag this before every production re-seed or admin-create run — this is `priorities.md` #1,
and it belongs here because this is the file an operator doing a re-seed will actually open.**
`apps/api/.env.production.local` is gitignored (`.gitignore:203`) — untracked, machine-local —
so nothing in the repo enforces that `DATABASE_URL` is actually present there alongside
`DIRECT_DATABASE_URL`. If it's ever missing, the `.env.$NODE_ENV.local > .env.local >
.env.$NODE_ENV > .env` cascade in `apps/api/src/shared/config/load-env.ts:16-25` falls through
silently to `apps/api/.env`'s `localhost` value: `prisma migrate deploy` still reaches
production (it only needs `DIRECT_DATABASE_URL`), while `apps/api/prisma/seed.ts` and
`create-super-admin.ts` — both routed through `PrismaService`, both entry points that import
`load-env.ts` only transitively — silently target the *local* database instead. `seed.ts` is
destructive by design: it `deleteMany`s and regenerates a rolling 6-week `Signal` window per
institution (see the seed-roster note below), and `apps/api/prisma/README.md`'s own "Re-seeding before a live demo"
section (`:179-191`) warns that real médicos can link real devices to the seeded institutions and
generate real check-ins that land in those same rows. The operator sees a success message either
way, with no way to tell from the output which database was actually touched. **Before running
either script against production, verify — don't assume — that the `DATABASE_URL` you're
sourcing points at the same host as `DIRECT_DATABASE_URL`.** Do not trust
`apps/api/prisma/README.md:205`'s "Both connection strings are already in `apps/api/.env`" —
still there verbatim at the time of writing, and false since the dev/prod env split landed:
`apps/api/.env` now holds localhost credentials for local dev, not production ones.

(`apps/api/.env.production.local` is a machine-local secrets file, not something this repo's
git history can confirm one way or the other — this is a documented pattern to guard against on
every machine that runs a prod seed, not a claim about any one operator's current file.)

Migrations are committed, timestamped folders under `apps/api/prisma/migrations` (17 today, plus
`migration_lock.toml`) — never `prisma db push`. "Never auto-run migrations" is true only for the
production path: the image's own `CMD` stays migration-free by design
(`docker/api.Dockerfile:24-31`'s comment: "so Fly.io's machine config matches a known-working
reference app exactly"), and `deploy`'s prod job runs no migration step at all — but CI *does*
run `prisma migrate deploy` automatically, both in `api-test` (against the ephemeral Postgres)
and in `deploy-dev` (against the dev database, `api.yml:131-132`). Local Docker Compose overrides
the container `command:` to auto-migrate on boot for convenience only
(`docker/docker-compose.yml:28`).

Seed rosters in `apps/api/prisma/seed-data.ts` don't all use the same idempotency strategy —
don't collapse this to one rule: credentialed rosters (manager, peer-partner, super-admin) upsert
on email with `update: {}` and a `passwordEnvVar` override, so a re-seed never rotates a live
password; invite rows (`MANAGER_INVITE_SEED_ROSTER`) upsert on email with a deliberate
*non-empty* `update` that resets the invite token and are passwordless by design; Signal demo
rows are not upserted at all — `seed.ts` `deleteMany`s them per institution and recreates them,
which is the intended way to regenerate the rolling window, and is exactly the mechanism behind
the #1 danger above.

**Mirror files:** `apps/api/prisma/schema.prisma`; `apps/api/prisma.config.ts`;
`apps/api/prisma/seed.ts`.

## 6. Deploy topology

**Fly.io (api) + Vercel (web) + Prisma Postgres (db), two fully independent environments.**
`main` deploys the API to Fly app `zelo-api` (`fly.toml`) and the web app to `zelohealth.app`
(Vercel); `develop` deploys to `zelo-api-dev` (`fly.dev.toml`) and `dev.zelohealth.app`
(`README.md:118-136`, the Deployment section). Each Fly app has its own database and its own
token secret. The API is
deployed *only* through `api.yml`'s flyctl jobs (§4) — never add a second deploy path. The web
app is deployed *only* through Vercel's git integration — never add one to `web.yml`.

`PrismaService`'s Neon-adapter branch (`prisma.service.ts:18-29`, switches on a `.neon.tech`
host) is probably unexercised today: both configured remote databases
(`apps/api/.env.production.local`, `.env.dev-remote.local`) point at `db.prisma.io` (Prisma
Postgres), not `*.neon.tech`. Recorded, not something to delete without first checking the live
`DATABASE_URL` via `fly secrets`.

**GitHub Pages is retired — commit `ad28d12`** ("the build/deploy jobs publish to GitHub Pages,
which CORS already blocks... dead weight now that a real dev environment exists too") removed
the Pages job from `web.yml`; Vercel is the only live frontend. Two pieces of leftover plumbing
from that era are `priorities.md` #13, and both are still present, re-verified fresh:

- `apps/web/vite.config.ts:7-14` still normalizes `VITE_BASE_PATH` (comment: "only done in the
  GitHub Pages workflow, from `actions/configure-pages`'s `base_path` output"), and
  `turbo.json:7` still declares it in `build.env` — but no workflow anywhere sets it anymore
  (`grep -rn VITE_BASE_PATH .github/workflows` returns nothing). It's harmless at runtime (falls
  back to `"/"`), but it's live-looking code with no caller — don't read it as evidence Pages is
  coming back, and don't wire a revived Pages job to it without first asking why.
- `README.md:46`'s tech-stack table still lists "Fly.io (API), **GitHub Pages (Web)**, Neon
  Postgres" — contradicting its own Deployment section (`:118-136`), which correctly documents
  Vercel + Prisma Postgres. Read the Deployment section, not the table, for what's actually live.

**`priorities.md` #25 — two operational instructions that misdirect a live deploy, both still
present, re-verified fresh:**

- `docs/android-apk.md:35` instructs `fly secrets set CORS_ALLOWED_ORIGINS="https://zelo-dusky.
  vercel.app,https://localhost" --app zelo-api`. That's a **full replacement**, not an append —
  running it verbatim against production CORS-blocks whatever origins aren't in that literal
  string, and because Fly secrets are write-only, the previous value can't be read back to
  recover. Before running it, `fly secrets list --app zelo-api` won't show the current value
  either — check `main.ts`'s CORS setup or ask whoever set it last, and compose the new value by
  adding to it, never by pasting the doc's line unmodified.
- `apps/web/package.json:9`'s `build:native` script hardcodes `VITE_API_BASE_URL=https://zelo-
  api.fly.dev` — production — with no environment branch, and `android:sync`
  (`apps/web/package.json:10`) calls it unconditionally. An APK built from `develop` still talks
  to the production API and writes real check-ins against the production database; there is no
  way for a native build to reach `zelo-api-dev`. Neither the script, `docs/android-apk.md`'s own
  "How the native build differs" table, nor `apps/web/capacitor.config.ts` flags this — the
  person running `android:sync` has to notice the literal URL themselves.

**Mirror files:** `fly.toml`; `fly.dev.toml`; `apps/web/vercel.json`; `docs/android-apk.md`.

## Traps

Each of these is stated in full in the numbered section beside it; collected here because every
one of them is a thing that looks routine and isn't.

- **Don't run `apps/api/prisma/seed.ts` or `create-super-admin.ts` against production without
  first confirming `DATABASE_URL` and `DIRECT_DATABASE_URL` point at the same host** (§5). They
  are read by two entirely separate code paths, the env file is machine-local and gitignored so
  the repo can't enforce agreement, and `seed.ts` is destructive. The success message looks
  identical either way.
- **Don't trust `apps/api/prisma/README.md:205`** ("Both connection strings are already in
  `apps/api/.env`") — false since the dev/prod env split; `.env` now holds localhost credentials
  (§5).
- **Don't paste `docs/android-apk.md:35`'s `fly secrets set CORS_ALLOWED_ORIGINS=...` line
  verbatim** (§6). It *replaces* the secret rather than appending, Fly secrets are write-only so
  the old value can't be read back, and the omitted origins are CORS-blocked immediately.
- **Don't assume an APK built from `develop` talks to the dev API** (§6).
  `apps/web/package.json:9`'s `build:native` hardcodes the production `VITE_API_BASE_URL` with no
  environment branch, and `android:sync` calls it unconditionally.
- **Don't add a second deploy path for either app** (§6). The API deploys only through
  `api.yml`'s flyctl jobs; the web app deploys only through Vercel's git integration. A deploy
  job added to `web.yml` would be a second, competing publisher.
- **Don't read `VITE_BASE_PATH` as live configuration** (§6). It survives in
  `apps/web/vite.config.ts` and `turbo.json` but no workflow sets it any more; it's GitHub Pages
  residue, tracked on `priorities.md` #13.
- **Don't delete `PrismaService`'s `PrismaNeon` branch as dead code** (§6) without first
  checking the live `DATABASE_URL` via `fly secrets` — it's *probably* unexercised, which is not
  the same as provably unreachable.
- **Don't run `prisma db push`** (§5, `:195`). Migrations are committed, timestamped folders
  under `apps/api/prisma/migrations`. The companion rule for a required column on a table with
  production rows — hand-edit the generated migration into nullable → backfill → `NOT NULL`
  order — lives at `general-documentations/architecture-reference.md:734-737`, not here.

## How to verify

```bash
# workspace deps are all workspace:*, package identity fields match across all 4 packages
grep -rn 'workspace:' apps/api/package.json apps/web/package.json packages/domain/package.json

# turbo tasks mirror root scripts 1:1 — no per-package turbo.json exists
cat turbo.json
find . -name turbo.json -not -path '*/node_modules/*'

# @zelo/domain has no deep-path consumers
grep -rl '@zelo/domain' apps/api/src apps/web/src --include=*.ts --include=*.tsx | wc -l   # 34
grep -rn '@zelo/domain/' apps packages --include=*.ts --include=*.tsx | grep -v node_modules  # 0 hits

# the two build scripts, side by side
grep -n '"build"' apps/api/package.json apps/web/package.json

# CI path filters and the fly.dev.toml gap
sed -n '/&api-paths/,/^  pull_request/p' .github/workflows/api.yml

# the #1 danger — confirm DATABASE_URL is present before a prod seed run (count only, don't
# print the secret; the file has a UTF-8 BOM so don't anchor with ^). 2 = both vars set, 1 =
# only DIRECT_DATABASE_URL is set — the danger case.
grep -c 'DATABASE_URL=' apps/api/.env.production.local

# the stale README instruction #1 depends on
grep -n 'Both connection strings' apps/api/prisma/README.md

# #13 — dead VITE_BASE_PATH plumbing, no workflow sets it
grep -rn VITE_BASE_PATH apps/web/vite.config.ts turbo.json .github/workflows/

# #25 — the two misdirecting operational instructions
grep -n 'CORS_ALLOWED_ORIGINS' docs/android-apk.md
grep -n 'build:native' apps/web/package.json
```

None of these commands proves the whole document — `turbo.json`, both `package.json` build
scripts, both CI workflows, `prisma.config.ts`, and the deploy docs are five different files with
five different failure modes. Re-run the specific one for whatever you're about to touch, rather
than trusting this file as a snapshot.
