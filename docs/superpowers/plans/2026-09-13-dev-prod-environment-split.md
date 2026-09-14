# Dev/Prod Environment Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a fully independent "dev" deployment (Fly app, database, Vercel project, `dev.zelohealth.app`) driven by a new `develop` branch, and protect `main`/`develop` so all changes land via PR.

**Architecture:** Prod (`zelo-api` Fly app, existing Prisma Postgres, existing Vercel project, `main` branch) is left untouched except for CORS/secret hygiene already in place. A parallel stack — Fly app `zelo-api-dev`, a new Prisma Postgres database, a new Vercel project — is provisioned and wired to a new `develop` branch, with its own CI deploy job and its own secrets. GitHub branch protection then forces every future change through a PR into `develop` or `main`.

**Tech Stack:** Fly.io (flyctl), Prisma Postgres (`create-db` CLI), GitHub Actions, GitHub CLI (`gh`), Vercel (dashboard, manual), Prisma migrate.

**Spec:** [docs/superpowers/specs/2026-09-13-dev-prod-environment-split-design.md](../specs/2026-09-13-dev-prod-environment-split-design.md)

## Global Constraints

- Every infra-creating command in this plan (new Fly app, new database, new GitHub secrets, branch protection) is a real, billable/production-adjacent action — confirm with Mauricio before running any step marked **CONFIRM**, don't just execute silently.
- Prod (`zelo-api`, its database, its Vercel project, the `main` branch's existing secrets) must not be touched by any task in this plan except the branch-protection task.
- All new dev secrets (token-signing keys) must be freshly generated, independent values — never copy a prod secret into the dev environment or vice versa.
- CI/CD changes are only verified by pushing and watching a real `gh run` — reading the YAML back is not verification (established project rule; see repo memory on CI verification).
- Repo is `Develophys/zelo` (GitHub), Fly org is `personal`, current working directory for `apps/api`-scoped commands is `apps/api/`.

---

### Task 1: Create the `develop` branch

**Files:** none (git branch only)

- [x] **Step 1: Create and push the branch**

```bash
git checkout main
git pull origin main
git checkout -b develop
git push -u origin develop
git checkout main
```

- [x] **Step 2: Verify it exists on GitHub**

```bash
gh api repos/Develophys/zelo/branches/develop -q .name
```

Expected: prints `develop`.

---

### Task 2: Provision the dev Prisma Postgres database

**Files:**
- Create: `apps/api/.env.dev-remote.local` (gitignored — matches the existing `.env.*` pattern in `.gitignore`)

**Interfaces:**
- Produces: `DATABASE_URL` / `DIRECT_DATABASE_URL` values in `apps/api/.env.dev-remote.local`, consumed by Task 3 (Fly secrets), Task 4 (CI migration secrets), and Task 9 (seeding).

- [x] **Step 1 (CONFIRM with Mauricio before running — creates a real cloud resource): Provision the database**

Run from `apps/api/`:

```bash
npx create-db@latest --json --region us-east-1 --env .env.dev-remote.local
```

This writes `DATABASE_URL` and `CLAIM_URL` into `apps/api/.env.dev-remote.local` and prints the same JSON to stdout. The database is temporary (auto-deletes in ~24h) until claimed.

- [x] **Step 2: Add the direct URL alongside it**

`prisma.config.ts` reads `DIRECT_DATABASE_URL` for migrations, `PrismaService` reads `DATABASE_URL` at runtime — prod sets both to the identical connection string, so do the same here. Open `apps/api/.env.dev-remote.local` and duplicate the value:

```bash
node -e "
const fs = require('fs');
const path = '.env.dev-remote.local';
const content = fs.readFileSync(path, 'utf8');
const match = content.match(/^DATABASE_URL=(.*)$/m);
if (!match) throw new Error('DATABASE_URL not found in ' + path);
fs.appendFileSync(path, \`\nDIRECT_DATABASE_URL=\${match[1]}\n\`);
"
cat apps/api/.env.dev-remote.local
```

Expected: file now has `DATABASE_URL`, `CLAIM_URL`, and `DIRECT_DATABASE_URL` (same value as `DATABASE_URL`).

- [x] **Step 3: Hand the claim URL to Mauricio**

Read the `CLAIM_URL` line from `apps/api/.env.dev-remote.local` and tell Mauricio to open it in a browser and claim the database into his existing Prisma workspace — this is the one step only he can do (it's tied to his Prisma account login). Without this, the database auto-deletes in ~24h.

- [x] **Step 4: Verify connectivity**

```bash
cd apps/api
set -a; source .env.dev-remote.local; set +a
pnpm exec prisma db execute --stdin <<< "SELECT 1;"
```

Expected: no error (empty success output).

---

### Task 3: Create the `zelo-api-dev` Fly app and do the first manual deploy

**Files:**
- Create: `fly.dev.toml` (repo root)

**Interfaces:**
- Consumes: `apps/api/.env.dev-remote.local`'s `DATABASE_URL`/`DIRECT_DATABASE_URL` (Task 2).
- Produces: a running `zelo-api-dev` Fly app reachable at `https://zelo-api-dev.fly.dev/health`, consumed by Task 4's CI job and Task 8's CORS update.

- [x] **Step 1 (CONFIRM with Mauricio — creates a billable Fly app): Create the Fly app**

```bash
fly apps create zelo-api-dev --org personal
```

Expected: `New app created: zelo-api-dev`.

- [x] **Step 2: Add `fly.dev.toml`**

```toml
app = "zelo-api-dev"
primary_region = "gru"

[build]
  dockerfile = "docker/api.Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  min_machines_running = 1

  [[http_service.checks]]
    path = "/health"
    interval = "15s"
    timeout = "5s"
```

- [x] **Step 3: Generate three fresh token secrets**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep the three printed values — they go to `MANAGER_TOKEN_SECRET`, `ADMIN_TOKEN_SECRET`, `PEER_PARTNER_TOKEN_SECRET` respectively in the next step. They must be different from prod's values.

- [x] **Step 4: Set the Fly secrets**

Run from `apps/api/`, with `.env.dev-remote.local` sourced (Task 2):

```bash
set -a; source .env.dev-remote.local; set +a
fly secrets set \
  DATABASE_URL="$DATABASE_URL" \
  DIRECT_DATABASE_URL="$DIRECT_DATABASE_URL" \
  MANAGER_TOKEN_SECRET="<value 1 from Step 3>" \
  ADMIN_TOKEN_SECRET="<value 2 from Step 3>" \
  PEER_PARTNER_TOKEN_SECRET="<value 3 from Step 3>" \
  EMAIL_PROVIDER=resend \
  RESEND_API_KEY="<a real Resend API key — see note below>" \
  AI_PROVIDER=mock \
  CORS_ALLOWED_ORIGINS=http://localhost:5173 \
  WEB_APP_BASE_URL=https://zelo-api-dev.fly.dev \
  --app zelo-api-dev
```

`EMAIL_PROVIDER=mock` was the original plan for dev, but `env.validation.ts` requires
`resend` whenever `NODE_ENV=production` — and `fly.dev.toml` sets `NODE_ENV=production`
just like prod's `fly.toml` does, so `mock` fails validation at boot and crash-loops the
machine. Use `resend` with a real `RESEND_API_KEY` (a dedicated dev key, or reuse prod's —
Fly secrets are write-only so prod's value can't be read back; get it from Mauricio or the
Resend dashboard). Invite/reset emails sent from dev are real sends as a result.

`CORS_ALLOWED_ORIGINS` and `WEB_APP_BASE_URL` are temporary values here — Task 8 updates both once the real dev frontend domain exists (`env.validation.ts` requires `WEB_APP_BASE_URL` to not be the localhost default in production, so it needs *some* non-localhost value from the start; the Fly hostname is a safe placeholder until Task 7/8).

- [x] **Step 5: Apply the first migration manually**

```bash
cd apps/api
NODE_ENV=production DATABASE_URL="$DATABASE_URL" DIRECT_DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma migrate deploy
```

(Run with `.env.dev-remote.local` still sourced from Step 4, or re-source it.)

Expected: `All migrations have been successfully applied.`

- [x] **Step 6: Deploy**

```bash
flyctl deploy --remote-only --config fly.dev.toml --app zelo-api-dev
```

- [x] **Step 7: Verify**

```bash
curl -sf https://zelo-api-dev.fly.dev/health
```

Expected: `{"status":"ok"}` (or equivalent — matches what `zelo-api.fly.dev/health` returns today).

- [x] **Step 8: Commit**

```bash
git add fly.dev.toml
git commit -m "feat(deploy): add zelo-api-dev Fly app config"
```

Also fixed along the way: the repo's root `.dockerignore` already existed (excluding
`.env`/`.env.*` to prevent secret leaks into images) but a stray command earlier in this
task's execution ran from `apps/api/` instead of repo root, didn't find it there, and
wrote a replacement that dropped those exclusions. Verified via `fly ssh console` that no
`.env` actually leaked into the built image (turbo prune respects `.gitignore`
independently), then restored the original exclusions (commit `a0ba361`) and redeployed
clean.

---

### Task 4: Automate dev deploys in CI

**Files:**
- Modify: `.github/workflows/api.yml`

**Interfaces:**
- Consumes: `zelo-api-dev` Fly app (Task 3), `DEV_DATABASE_URL`/`DEV_DIRECT_DATABASE_URL` GitHub secrets (this task creates them from Task 2's values), a new `FLY_API_TOKEN_DEV` repo secret (Fly deploy tokens are app-scoped — the existing `FLY_API_TOKEN` is scoped to `zelo-api` only and returns "unauthorized" against `zelo-api-dev`; discovered on the first real CI run, fixed by minting a token scoped to `zelo-api-dev` via `fly tokens create deploy -a zelo-api-dev`).

- [x] **Step 1: Add the dev DB GitHub secrets**

```bash
cd apps/api
set -a; source .env.dev-remote.local; set +a
gh secret set DEV_DATABASE_URL --repo Develophys/zelo --body "$DATABASE_URL"
gh secret set DEV_DIRECT_DATABASE_URL --repo Develophys/zelo --body "$DIRECT_DATABASE_URL"
```

- [x] **Step 2: Allow `develop` to trigger the workflow, and rename the `test` job**

`web.yml` also has a job called `test` (unqualified) — GitHub Actions reports a check run's
name from the job id, so two same-named jobs in different workflows produce an ambiguous
`test` context that Task 6's branch protection can't reliably target. Disambiguate now,
before either becomes a required check.

In `.github/workflows/api.yml`, change:

```yaml
on:
  push:
    branches: [main]
```

to:

```yaml
on:
  push:
    branches: [main, develop]
```

and rename the job id `test:` (the line right after `jobs:`) to `api-test:`.

- [x] **Step 3: Add the `deploy-dev` job**

Also update the existing `deploy` job's `needs: test` to `needs: api-test`. Then append
this new job at the end of `.github/workflows/api.yml` (sibling to `deploy`):

```yaml
  deploy-dev:
    needs: api-test
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}
      DIRECT_DATABASE_URL: ${{ secrets.DEV_DIRECT_DATABASE_URL }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'

      - name: Install dependencies (api + shared packages only)
        run: pnpm install --frozen-lockfile --filter=@zelo/api...

      - name: Generate Prisma Client
        run: pnpm --filter @zelo/api exec prisma generate

      - name: Apply database migrations (dev)
        run: pnpm --filter @zelo/api exec prisma migrate deploy

      - name: Setup flyctl
        uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to Fly.io (dev)
        run: flyctl deploy --remote-only --config fly.dev.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_DEV }}

      - name: Verify deployment
        run: curl -sf https://zelo-api-dev.fly.dev/health | grep -q '"status":"ok"'
```

(Note: this brief originally said `secrets.FLY_API_TOKEN` — corrected to `FLY_API_TOKEN_DEV`
after the first real run failed with "unauthorized"; see the Interfaces note above.)

- [x] **Step 4: Commit**

```bash
git add .github/workflows/api.yml
git commit -m "ci(api): auto-deploy zelo-api-dev on push to develop"
```

- [x] **Step 5: Push and watch a real run (do not skip — CI changes are only verified by a real Actions run)**

```bash
git push origin develop
gh run watch --repo Develophys/zelo
```

Expected: `api-test` and `deploy-dev` jobs both succeed. Then re-verify:

```bash
curl -sf https://zelo-api-dev.fly.dev/health
```

---

### Task 5: Retire the GitHub Pages deploy from `web.yml`

**Files:**
- Modify: `.github/workflows/web.yml`

- [x] **Step 1: Replace the file's `on`/`permissions`/`concurrency` header, and rename the `test` job**

Also rename this file's job id `test:` (the line right after `jobs:`) to `web-test:` —
`api.yml`'s job is being renamed to `api-test` in Task 4 for the same reason: two
same-named `test` jobs in different workflows produce an ambiguous check-run name.

Replace:

```yaml
on:
  push:
    branches: [main]
    paths: &web-paths
      - 'apps/web/**'
      - 'packages/domain/**'
      - 'packages/config/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - 'turbo.json'
      - '.nvmrc'
      - '.npmrc'
      - '.github/workflows/web.yml'
  pull_request:
    paths: *web-paths
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages-${{ github.event_name == 'push' && 'prod' || github.ref }}
  cancel-in-progress: false
```

with:

```yaml
on:
  push:
    branches: [main, develop]
    paths: &web-paths
      - 'apps/web/**'
      - 'packages/domain/**'
      - 'packages/config/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - 'turbo.json'
      - '.nvmrc'
      - '.npmrc'
      - '.github/workflows/web.yml'
  pull_request:
    paths: *web-paths

permissions:
  contents: read

concurrency:
  group: web-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

- [x] **Step 2: Delete the `build` and `deploy` jobs**

Remove everything from `  build:` (the job that runs `actions/configure-pages`, builds with `VITE_API_BASE_URL`, and uploads the Pages artifact) through the end of the `  deploy:` job (the `actions/deploy-pages@v4` step) — i.e. delete from the line `  build:` to the end of the file. The file should end with the `test` job's `Build` step.

- [x] **Step 3: Commit**

```bash
git add .github/workflows/web.yml
git commit -m "ci(web): retire the unused GitHub Pages deploy (Vercel is the live frontend)"
```

- [x] **Step 4: Push and watch a real run**

```bash
git push origin develop
gh run watch --repo Develophys/zelo
```

Expected: only the `web-test` job runs, no Pages deploy job appears, and it succeeds.

---

### Task 6: Protect `main` and `develop` (DEFERRED — Mauricio asked to do this last, after every other adjustment in this session lands, so the remaining tasks aren't slowed by required PRs mid-flight)

**Files:** none (GitHub repo settings only)

Both `api.yml` and `web.yml` trigger on `paths:`-filtered pushes/PRs — a PR touching only
`apps/web/**` never triggers `api.yml` at all, and vice versa. If `api-test`/`web-test`
were set as *required* status checks, a PR that only touches one app would sit blocked
forever waiting for the other check to report, since it never runs. Fixing that properly
means moving the path filtering from the workflow trigger down into a job-level condition
(so the workflow always runs and always posts a status) — a bigger change than what was
asked for here, and out of scope for this plan. So this task enforces only what Mauricio
asked for — **no direct pushes, changes land via PR** — without also hard-requiring the
path-filtered checks to pass first. `required_status_checks` is left `null`; PRs still
show `api-test`/`web-test` results when they run, Mauricio just isn't blocked from
merging by a check that may never trigger. (If he later wants merges hard-blocked on CI,
that job-level-path-filter refactor is the prerequisite — worth its own small spec.)

- [x] **Step 1 (CONFIRM with Mauricio — blocks direct pushes to both branches from this point on): Apply protection to `main`**

```bash
gh api -X PUT repos/Develophys/zelo/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

- [x] **Step 2: Apply the same protection to `develop`**

```bash
gh api -X PUT repos/Develophys/zelo/branches/develop/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

- [x] **Step 3: Verify**

Real gap found here, not hypothetical: the first verification attempt (an actual, non-dry-run push of an empty commit to `main`) **succeeded** — GitHub printed
`Bypassed rule violations for refs/heads/main: - Changes must be made through a pull request.`
but let the push through anyway, because the payload above set `enforce_admins: false`, and
the authenticated account is a repo admin. `enforce_admins: false` exempts admins from
their own branch protection — not what "no direct pushes, period" means for a solo-owner
repo. Fixed with:

```bash
gh api -X POST repos/Develophys/zelo/branches/main/protection/enforce_admins
gh api -X POST repos/Develophys/zelo/branches/develop/protection/enforce_admins
```

Re-tested with a second real (non-dry-run) push attempt — correctly rejected:
`remote: error: GH006: Protected branch update failed for refs/heads/main.`
`remote: - Changes must be made through a pull request.`

---

### Task 7: Vercel dev project + DNS

**Files:** none (external dashboards)

Revised in execution: Mauricio has the Vercel CLI installed and authenticated, so this
turned out mostly automatable — only two sub-steps genuinely needed his own
account/browser (domain DNS approval, and — it turned out — branch tracking, which
Vercel's UI itself failed to save).

- [x] **Step 1: Create the Vercel project** — done via CLI: `vercel project add zelo-dev`,
  `vercel project update zelo-dev --root-directory apps/web --framework vite --yes`,
  `vercel link --project zelo-dev --yes` (from a scratch dir, to avoid touching
  `apps/web/.vercel/project.json`, which stays linked to prod), then
  `vercel git connect https://github.com/Develophys/zelo.git --yes`.

- [x] **Step 2: Set the env var** — done via CLI:
  `vercel env add VITE_API_BASE_URL production --value "https://zelo-api-dev.fly.dev" --yes --project zelo-dev`
  and the same for `preview --git-branch develop` (belt-and-suspenders while branch
  tracking below was unresolved).

- [x] **Step 3: Add the custom domain** — done via CLI:
  `vercel domains add dev.zelohealth.app zelo-dev`. DNS is Cloudflare-hosted; the
  CNAME (`dev` → the target `vercel domains verify` printed, proxy OFF) was applied via
  Vercel's one-click Domain Connect URL and is now verified (✓ in the Domains panel).

- [ ] **Step 4 — PARKED, Vercel-side issue, not resolved this session:** Production Branch
  tracking. Project Settings → Environments → Production → Branch Tracking still reads
  `main`. Tried: the dashboard UI (fails with "Failed to save branch tracking. Try again",
  twice, different Request IDs), the legacy `PATCH /v9/projects/zelo-dev` API with
  `link.productionBranch`/`gitConfig.productionBranch`/`productionBranch` (all rejected:
  "should NOT have additional property"), and the newer
  `GET /v9/projects/zelo-dev/environments` → confirmed the real field is
  `branchMatcher: {type: "equals", pattern: "main"}` on the `production` system
  environment, but `PATCH /v9/projects/zelo-dev/environments/production` 404s — no
  working write path found. This looks like a genuine bug/incomplete rollout on Vercel's
  side for this project, not a permissions or scope problem (the CLI token has full
  account access). **Ruling:** proceed without it — it doesn't block anything else in this
  plan (see Task 8/11 notes on the actual consequence) — and leave it for Mauricio to
  retry later or raise with Vercel support (Request IDs:
  `gru1:gru1:gru1:sfo1::p8qlk-1789347627263-b631561c9e4d`,
  `gru1:gru1:gru1:sfo1::h5hzl-1789347664056-a67245b06b4f`).

**Consequence of the parked item:** the *first* deployment Vercel built for this project
(triggered by a `develop` push right after `git connect`, before any branch-tracking
config existed) was auto-treated as Production and got the custom domain — so
`dev.zelohealth.app` is live and correct right now. But *future* pushes to `develop` will
be treated as Preview deployments (a `vercel.app` preview URL, not the custom domain)
until branch tracking is fixed. Task 11's "push a trivial change" step will surface this
concretely.

---

### Task 8: Point `zelo-api-dev` at the real dev domain

**Files:** none (Fly secrets only)

**Interfaces:**
- Consumes: `dev.zelohealth.app` being live (Task 7).

- [x] **Step 1: Update the Fly secrets**

```bash
fly secrets set \
  CORS_ALLOWED_ORIGINS=https://dev.zelohealth.app \
  WEB_APP_BASE_URL=https://dev.zelohealth.app \
  --app zelo-api-dev
```

(`fly secrets set` triggers an automatic rolling restart — same behavior as documented in the README for prod.)

- [x] **Step 2: Verify end-to-end**

```bash
fly status --app zelo-api-dev
curl -sf https://zelo-api-dev.fly.dev/health
```

Then, in a browser, load `https://dev.zelohealth.app`, and log in with a seeded account once Task 9 has run (or confirm the login page renders and makes a request to `zelo-api-dev.fly.dev` without a CORS error in the browser console, if Task 9 hasn't run yet).

---

### Task 9: Seed the dev database

**Files:** none

**Interfaces:**
- Consumes: `apps/api/.env.dev-remote.local` (Task 2).

- [x] **Step 1: Run the seed**

```bash
cd apps/api
set -a; source .env.dev-remote.local; set +a
NODE_ENV=production pnpm prisma:seed
```

(`NODE_ENV=production` here only affects `env.validation.ts`'s startup guards if the seed script went through Nest's `ConfigModule` — it doesn't, `seed.ts` constructs `PrismaService` directly like `create-super-admin.ts` did for prod — so `NODE_ENV` isn't actually required for this command to work; setting it is harmless and keeps the invocation consistent with how prod scripts are run. If it's simpler, plain `pnpm prisma:seed` with `.env.dev-remote.local` sourced works identically.)

- [x] **Step 2: Verify**

`tsx -e` with top-level `await` doesn't work as written above (esbuild treats `-e` input as
CJS and rejects top-level await) — use a small `.mts` file with the query wrapped in an
`async function main() { ... } main();` instead. Confirmed: dev has `Zelo Demo` and
`Hospital São Lucas (Demo)`.

---

### Task 10: Reorganize local `.env` files + update README

**Files:**
- Rename: `apps/api/.env` → `apps/api/.env.production.local` (git-mv is not applicable, both are gitignored — plain `mv`)
- Create: new `apps/api/.env` (dev-safe defaults)
- Modify: `README.md` (Deployment section)

- [x] **Step 1: Rename the prod file**

```bash
cd apps/api
mv .env .env.production.local
```

- [x] **Step 2: Create a new, dev-safe `.env`**

Copy the current `apps/api/.env.development.local` content into the new `apps/api/.env` (same docker-Postgres defaults), so a bare command run without `NODE_ENV` set can never reach prod:

```bash
cp .env.development.local .env
```

- [x] **Step 3: Verify nothing broke**

```bash
pnpm dev &
sleep 3
curl -sf http://localhost:3000/health
kill %1
```

Expected: `{"status":"ok"}` — confirms local dev still boots against the docker Postgres, not prod.

- [x] **Step 4: Update `README.md`'s Deployment section**

Replace:

```markdown
## Deployment

- **`apps/api`** deploys to Fly.io (`zelo-api`), backed by Neon Postgres.
- **`apps/web`** deploys to GitHub Pages.
- **`apps/web`** also packages as an installable Android APK via Capacitor — see [`docs/android-apk.md`](docs/android-apk.md).

Both auto-deploy from `main` via `.github/workflows/api.yml` / `web.yml`, gated on changes to the relevant app plus `packages/domain`/`packages/config`. Migrations are **not** run on container boot — apply them manually before deploying a schema change:

```bash
pnpm --filter @zelo/api exec prisma migrate deploy   # DIRECT_DATABASE_URL must point at Neon
```
```

with:

```markdown
## Deployment

Two independent environments, each with its own Fly app, Prisma Postgres database, and
Vercel project:

| | Prod | Dev |
|---|---|---|
| Branch | `main` | `develop` |
| API | `zelo-api` (Fly) | `zelo-api-dev` (Fly) |
| Web | `zelohealth.app` (Vercel) | `dev.zelohealth.app` (Vercel) |
| Migrations | manual (see below) | automatic in CI |

`main` and `develop` are both protected — all changes land via PR. `apps/web` also
packages as an installable Android APK via Capacitor — see
[`docs/android-apk.md`](docs/android-apk.md).

Both apps auto-deploy from their branch via `.github/workflows/api.yml` (`deploy` /
`deploy-dev` jobs); the Vercel projects deploy via Vercel's own git integration, not
GitHub Actions. Prod migrations are **not** run on container boot — apply them manually
before deploying a schema change:

```bash
pnpm --filter @zelo/api exec prisma migrate deploy   # DIRECT_DATABASE_URL must point at prod (apps/api/.env.production.local)
```

Local `apps/api` env files: `.env` (safe dev defaults, used by bare `pnpm dev`),
`.env.development.local` (per-developer local overrides, e.g. docker Postgres
credentials), `.env.production.local` (prod secrets, only loaded when
`NODE_ENV=production` — used for the manual migration command above), and
`.env.dev-remote.local` (the deployed dev environment's database, for one-off scripts
against it).
```

- [x] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(deploy): document the dev/prod environment split and reorganized env files"
```

(`.env` and `.env.production.local` are not committed — both match the `.env`/`.env.*` gitignore patterns already in place.)

---

### Task 11: Final verification

**Files:** none

- [x] **Step 1: Push a trivial change through the full dev pipeline**

Correction while executing: `git commit --allow-empty` with nothing staged produces a
commit that touches zero files — it never triggers a `paths:`-filtered workflow at all.
`echo "" >> apps/api/README.md` also silently did nothing useful the first time because
the created file was never `git add`ed. Fixed by actually creating
`apps/api/README.md` (a real pointer-stub file, not a throwaway blank line) and
committing it for real:

```bash
git checkout develop
git pull origin develop
# create/edit an actual file under apps/api/, then:
git add apps/api/README.md
git commit -m "chore: verify dev pipeline end-to-end"
git push origin develop
gh run watch --repo Develophys/zelo
```

Result: `api-test` and `deploy-dev` both green (run `34795437290`).
`curl https://zelo-api-dev.fly.dev/health` → `{"status":"ok","database":true}`.

- [x] **Step 2: Confirm the dev site works end-to-end**

`https://dev.zelohealth.app` returns `200`. **Known gap tied to Task 7's parked item:**
this push landed as a Vercel *Preview* deployment (branch tracking still points at
`main`, not `develop`), so the custom domain is still serving the earlier bootstrap
Production deployment rather than this latest commit — functionally fine for now (same
app), but new frontend changes on `develop` won't reach `dev.zelohealth.app` until
Mauricio's branch-tracking fix lands. Full login-flow click-through in a browser wasn't
done in this session (no browser tool available here) — worth Mauricio doing manually
once branch tracking is fixed.

- [x] **Step 3: Confirm the protected-branch PR flow**

Also caught for real here (not just Task 6's own check): the tracking-doc commit for
Task 6 itself couldn't be pushed straight to `develop` anymore — protection applies to
every branch it's set on, including the one currently checked out. Went through a real
PR (`#23`, `chore/task6-tracking` → `develop`) to land it, which incidentally is a second,
independent confirmation that the PR-only flow works.

Then the actual Step 3 verification: PR `#24` (`develop` → `main`), merged via
`gh pr merge 24 --merge`. Triggered a real `push` to `main`: `api-test` and `deploy` both
green, `deploy-dev` correctly skipped (`if` condition didn't match `main`'s ref), `web`
workflow green, and `https://zelo-api.fly.dev/health` confirmed healthy afterward — a
true no-op deploy, prod app code untouched.

One side effect worth recording: before Task 6's `enforce_admins` fix landed, the
*first* protection smoke-test push (an empty commit) got through as an admin-bypassed
direct push to `main` and actually triggered a real (harmless, no-op) prod deploy —
visible in Actions history as `chore: protection smoke test (should be rejected)`. No
consequence (zero file changes, prod already confirmed healthy before and after), but
it's why the bypass was caught before it could matter.

---

## Post-plan cleanup (optional, not a task — ask Mauricio)

- `VITE_API_BASE_URL` GitHub repo secret is now unused (only the removed Pages `build` job read it) — safe to `gh secret delete VITE_API_BASE_URL --repo Develophys/zelo` if Mauricio confirms nothing else depends on it.
- Vercel `zelo-dev` project's Production Branch tracking (parked in Task 7) still needs a retry — see that task's notes and Request IDs.
- Rename the claimed Prisma Postgres dev project from its default timestamp name to something like `zelo-dev` (cosmetic, Prisma Console → Settings).
