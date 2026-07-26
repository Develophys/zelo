# CI Pipeline Split by App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `.github/workflows/ci.yml` (backend build/lint/test/deploy) and `.github/workflows/deploy-pages.yml` (frontend build/deploy) into two fully independent, path-gated flows — `api.yml` and `web.yml` — each running its own lint/test before its own deploy, and fix the bug where deploying the web app runs `apps/api`'s `postinstall` (`prisma generate`) because of an unfiltered `pnpm install`.

**Architecture:** Two workflow files, one per app, each triggered only by `on.push`/`on.pull_request` `paths:` scoped to that app plus the shared packages it depends on (`packages/domain`, `packages/config`) and workspace-wide config files. Each workflow has a `test` job (lint/build/test, scoped via `pnpm install --filter`/`turbo run --filter` to that app + shared packages only) and a `deploy` job that `needs: test` and only runs on `push` to `main` (or, for web, `workflow_dispatch`). The existing `dorny/paths-filter` "changes" job is removed — GitHub Actions' native `paths:` trigger filter now gates whether the workflow dispatches at all, which supersedes it.

**Tech Stack:** GitHub Actions YAML, pnpm workspace filtering (`--filter`), Turborepo (`turbo run --filter`), `gh` CLI for verification.

## Global Constraints

- Root cause of the reported bug: `deploy-pages.yml` runs a full, unfiltered `pnpm install --frozen-lockfile`, which installs every workspace package including `apps/api` and therefore runs `apps/api`'s `"postinstall": "prisma generate"` script — unrelated to deploying the web app. Every install step in both new workflows must use `pnpm install --filter=<app> --filter=@zelo/domain --filter=@zelo/config --frozen-lockfile` (a pnpm partial/filtered install) instead, so only the packages actually needed are installed and only their lifecycle scripts run.
- Do not automate production database migrations. `prisma migrate deploy` in CI only ever targets the ephemeral Postgres service container used for testing that migrations apply cleanly — it must never be pointed at Neon/production. Production migrations stay a deliberate manual step (`pnpm --filter @zelo/api exec prisma migrate deploy` against `DIRECT_DATABASE_URL`), exactly as documented in `README.md`'s Deployment section and the comment in `docker/api.Dockerfile`. Do not add a migrate step to either `deploy` job.
- Do not reintroduce `dorny/paths-filter` or a runtime `changes` job. The new design gates entire workflow dispatch via native `on.push.paths`/`on.pull_request.paths`, which makes a job-level filter step redundant for this use case.
- Verification must be done by pushing to a real branch and observing actual GitHub Actions runs via `gh` — per [[feedback_turborepo_ci_verification]], local YAML syntax checks alone are not sufficient in this repo (established in `docs/superpowers/plans/2026-07-11-ci-pipeline-path-filters.md`).
- Keep `lint:boundaries`/`lint`/`test`/`build` as four separate steps per job rather than collapsing into root `pnpm build`/`pnpm lint`/`pnpm test` — those root scripts run `turbo run <task>` with no filter, i.e. every package, which is exactly the coupling this plan removes.
- Step order within each `test` job is `lint:boundaries` → `lint` → `test` → `build`, not the original `ci.yml`'s `build` → `lint` → `lint:boundaries` → `test`. `turbo.json` only declares `dependsOn: ["^build"]` for the `lint` and `test` tasks — meaning they need *upstream* dependencies (`@zelo/domain`) built so imports resolve, which Turbo triggers automatically; they do **not** need the app's own `build` to run first, and `lint:boundaries` has no `dependsOn` at all. Running the cheapest, dependency-free checks first gives faster failure feedback; the full production `build` (the slowest step, and not required for `lint`/`test` correctness) runs last purely to confirm the app still compiles.
- CI's Postgres credentials must not be hardcoded literals. Three new repo secrets — `CI_DB_USER`, `CI_DB_PASSWORD`, `CI_DB_NAME` — back the service container's `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` and are interpolated into both `DATABASE_URL`/`DIRECT_DATABASE_URL`. Nothing about the ephemeral CI database appears as a literal anywhere in the YAML. These secrets must exist in the repo before Task 4's verification will pass (`gh secret set` or via repo Settings → Secrets and variables → Actions — any values work, they only ever authenticate to the ephemeral per-job container, never a real database).

---

## File Structure

- Rename (git mv) + rewrite: `.github/workflows/ci.yml` → `.github/workflows/api.yml` — backend-only flow: path-gated on `apps/api/**` + `packages/domain/**` + `packages/config/**` + shared workspace files; `test` job (Postgres service, Prisma generate/migrate against the ephemeral DB, build/lint/lint:boundaries/test scoped to `@zelo/api` + `@zelo/domain`); `deploy` job (Fly.io) needing `test`, gated to `push` on `main`.
- Rename (git mv) + rewrite: `.github/workflows/deploy-pages.yml` → `.github/workflows/web.yml` — frontend-only flow: path-gated on `apps/web/**` + `packages/domain/**` + `packages/config/**` + shared workspace files; `test` job (build/lint/lint:boundaries/test scoped to `@zelo/web` + `@zelo/domain`, no Postgres); `build` job (Pages artifact build with prod env vars) needing `test`, gated to `push`/`workflow_dispatch`; `deploy` job (GitHub Pages) needing `build`.
- Modify: `README.md` — fix the stale `.github/workflows/ci.yml` reference in the Deployment section to `.github/workflows/api.yml`, and add a one-line pointer to `.github/workflows/web.yml` for how the web app deploys (this doc currently only documents the API deploy path).

---

### Task 1: Split the backend flow into `api.yml`

**Files:**
- Rename: `.github/workflows/ci.yml` → `.github/workflows/api.yml`
- Modify: `.github/workflows/api.yml` (full rewrite of the renamed file's contents)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a workflow named `API` that only dispatches for `apps/api`/`packages/domain`/`packages/config`/shared-config-file changes, with jobs `test` and `deploy` — referenced by name in Task 4's verification.

- [x] **Step 1: Create the `CI_DB_USER`, `CI_DB_PASSWORD`, `CI_DB_NAME` repo secrets, if they don't already exist**

These secrets only ever authenticate to the ephemeral, per-job Postgres service container below — none of them are real database credentials. Any values work.

```bash
gh secret list | grep -q CI_DB_USER || gh secret set CI_DB_USER --body "zelo"
gh secret list | grep -q CI_DB_PASSWORD || gh secret set CI_DB_PASSWORD --body "$(openssl rand -hex 20)"
gh secret list | grep -q CI_DB_NAME || gh secret set CI_DB_NAME --body "zelo"
```

- [ ] **Step 2: Rename the file, preserving git history**

```bash
git mv .github/workflows/ci.yml .github/workflows/api.yml
```

- [ ] **Step 3: Replace the entire contents of `.github/workflows/api.yml`**

```yaml
name: API

on:
  push:
    branches: [main]
    paths: &api-paths
      - 'apps/api/**'
      - 'packages/domain/**'
      - 'packages/config/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - 'turbo.json'
      - '.nvmrc'
      - 'fly.toml'
      - 'docker/api.Dockerfile'
      - '.dockerignore'
      - '.github/workflows/api.yml'
  pull_request:
    paths: *api-paths

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: ${{ secrets.CI_DB_USER }}
          POSTGRES_PASSWORD: ${{ secrets.CI_DB_PASSWORD }}
          POSTGRES_DB: ${{ secrets.CI_DB_NAME }}
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://${{ secrets.CI_DB_USER }}:${{ secrets.CI_DB_PASSWORD }}@localhost:5432/${{ secrets.CI_DB_NAME }}?schema=public
      DIRECT_DATABASE_URL: postgresql://${{ secrets.CI_DB_USER }}:${{ secrets.CI_DB_PASSWORD }}@localhost:5432/${{ secrets.CI_DB_NAME }}?schema=public
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
        run: pnpm install --frozen-lockfile --filter=@zelo/api --filter=@zelo/domain --filter=@zelo/config

      - name: Generate Prisma Client
        run: pnpm --filter @zelo/api exec prisma generate

      - name: Lint boundaries
        run: pnpm turbo run lint:boundaries --filter=@zelo/api --filter=@zelo/domain

      - name: Lint
        run: pnpm turbo run lint --filter=@zelo/api --filter=@zelo/domain

      - name: Apply database migrations
        run: pnpm --filter @zelo/api exec prisma migrate deploy

      - name: Test
        run: pnpm turbo run test --filter=@zelo/api --filter=@zelo/domain

      - name: Build
        run: pnpm turbo run build --filter=@zelo/api --filter=@zelo/domain

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup flyctl
        uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to Fly.io
        run: flyctl deploy --remote-only --config fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Verify deployment
        run: curl -sf https://zelo-api.fly.dev/health | grep -q '"status":"ok"'
```

- [ ] **Step 4: Validate YAML syntax locally**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/api.yml'))" && echo "VALID"
```

Expected: `VALID`. This only confirms the file parses as YAML, not that GitHub Actions accepts the schema — that's confirmed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/api.yml
git commit -m "ci: split backend build/lint/test/deploy into its own path-gated workflow"
```

---

### Task 2: Split the frontend flow into `web.yml`

**Files:**
- Rename: `.github/workflows/deploy-pages.yml` → `.github/workflows/web.yml`
- Modify: `.github/workflows/web.yml` (full rewrite of the renamed file's contents)

**Interfaces:**
- Consumes: nothing from Task 1 (independent file).
- Produces: a workflow named `Web` that only dispatches for `apps/web`/`packages/domain`/`packages/config`/shared-config-file changes, with jobs `test`, `build`, `deploy` — referenced by name in Task 4's verification. This is also where the reported bug (api's `postinstall` running during a web deploy) gets fixed, via the filtered `pnpm install`.

- [ ] **Step 1: Rename the file, preserving git history**

```bash
git mv .github/workflows/deploy-pages.yml .github/workflows/web.yml
```

- [ ] **Step 2: Replace the entire contents of `.github/workflows/web.yml`**

```yaml
name: Web

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
      - '.github/workflows/web.yml'
  pull_request:
    paths: *web-paths
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  test:
    runs-on: ubuntu-latest
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

      - name: Install dependencies (web + shared packages only)
        run: pnpm install --frozen-lockfile --filter=@zelo/web --filter=@zelo/domain --filter=@zelo/config

      - name: Lint boundaries
        run: pnpm turbo run lint:boundaries --filter=@zelo/web --filter=@zelo/domain

      - name: Lint
        run: pnpm turbo run lint --filter=@zelo/web --filter=@zelo/domain

      - name: Test
        run: pnpm turbo run test --filter=@zelo/web --filter=@zelo/domain

      - name: Build
        run: pnpm turbo run build --filter=@zelo/web --filter=@zelo/domain

  build:
    needs: test
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
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

      - name: Install dependencies (web + shared packages only)
        run: pnpm install --frozen-lockfile --filter=@zelo/web --filter=@zelo/domain --filter=@zelo/config

      - name: Configure Pages
        id: pages
        uses: actions/configure-pages@v5

      - name: Build web (and its workspace deps) for deploy
        run: pnpm turbo run build --filter=@zelo/web --filter=@zelo/domain
        env:
          VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
          VITE_BASE_PATH: ${{ steps.pages.outputs.base_path }}

      - name: SPA fallback for deep-link refreshes
        run: cp apps/web/dist/index.html apps/web/dist/404.html

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: apps/web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Validate YAML syntax locally**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/web.yml'))" && echo "VALID"
```

Expected: `VALID`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/web.yml
git commit -m "ci: split frontend build/lint/test/deploy into its own path-gated workflow, fix unfiltered install triggering api postinstall"
```

---

### Task 3: Update README's stale workflow reference

**Files:**
- Modify: `README.md:55`

**Interfaces:**
- Consumes: the file renames from Tasks 1-2 (`api.yml`, `web.yml` must already exist under those names).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the stale reference**

Find this line in the "Deployment" section:

```markdown
`apps/api` deploys to Fly.io (`zelo-api`), backed by Neon Postgres. `main` pushes that pass CI auto-deploy via `.github/workflows/ci.yml`'s `deploy` job. Migrations are **not** run on container boot — apply them manually before deploying a schema change:
```

Replace it with:

```markdown
`apps/api` deploys to Fly.io (`zelo-api`), backed by Neon Postgres. `main` pushes touching `apps/api` or `packages/domain`/`packages/config` that pass CI auto-deploy via `.github/workflows/api.yml`'s `deploy` job. `apps/web` deploys to GitHub Pages the same way via `.github/workflows/web.yml`, gated on `apps/web`/`packages/domain`/`packages/config` changes instead. Migrations are **not** run on container boot — apply them manually before deploying a schema change:
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: point README at the split api.yml/web.yml workflows"
```

---

### Task 4: Verify real behavior on GitHub Actions

**Files:** none (verification only — no code changes).

**Interfaces:**
- Consumes: the completed workflows from Tasks 1-3, pushed to a real branch.
- Produces: confirmation that each of the four path-gating scenarios below holds in practice, and that the reported bug is actually fixed.

Per [[feedback_turborepo_ci_verification]], this must be done against real GitHub Actions runs, not local simulation.

- [ ] **Step 1: Push Tasks 1-3 to a throwaway branch and open a disposable PR**

```bash
git checkout -b ci/split-by-app-verify
git push -u origin ci/split-by-app-verify
gh pr create --title "test: verify split api.yml/web.yml (throwaway)" --body "Verification PR for the CI split — will be closed without merging." --base main
```

- [ ] **Step 2: Scenario A — doc-only change dispatches neither workflow**

```bash
echo "verify doc-only skip $(date)" >> docs/superpowers/plans/2026-07-26-ci-pipeline-split-by-app.md
git add docs/superpowers/plans/2026-07-26-ci-pipeline-split-by-app.md
git commit -m "test: doc-only change (should not trigger either workflow)"
git push
```

```bash
gh run list --branch ci/split-by-app-verify --limit 5
```

Expected: no new run for either `API` or `Web` appears for this commit's SHA.

- [ ] **Step 3: Scenario B — `apps/web`-only change runs `Web`'s `test` job only**

```bash
echo "// ci-verify $(date)" >> apps/web/src/vite-env.d.ts
git add apps/web/src/vite-env.d.ts
git commit -m "test: apps/web-only change (Web test should run, API should not dispatch, build/deploy should not run on a PR)"
git push
```

(If `apps/web/src/vite-env.d.ts` doesn't exist, use `Read` to find any existing trivial file under `apps/web/src` to append a comment to instead.)

```bash
gh run watch --exit-status $(gh run list --branch ci/split-by-app-verify --limit 1 --json databaseId -q '.[0].databaseId')
gh run list --branch ci/split-by-app-verify --limit 3 --json name,databaseId,headSha
gh run view <the-web-run-id> --json jobs -q '.jobs[] | {name, conclusion}'
```

Expected: a `Web` run appears with its `test` job `success`; `build` and `deploy` either don't appear or show `skipped` (this is a PR, not a push to `main`). No `API` run appears at all for this commit.

- [ ] **Step 4: Scenario C — `apps/api`-only change runs `API`'s `test` job only**

```bash
echo "// ci-verify $(date)" >> apps/api/src/main.ts
git add apps/api/src/main.ts
git commit -m "test: apps/api-only change (API test should run, Web should not dispatch)"
git push
```

(Append the comment after any existing line so the file still parses; if `apps/api/src/main.ts`'s top-level shape makes a trailing comment risky, use `Read` to confirm a safe insertion point first.)

```bash
gh run list --branch ci/split-by-app-verify --limit 3 --json name,databaseId,headSha
gh run view <the-api-run-id> --json jobs -q '.jobs[] | {name, conclusion}'
```

Expected: an `API` run appears with its `test` job `success` (Postgres service up, Prisma generate/migrate against the ephemeral DB, build/lint/test all passing). No `Web` run appears for this commit.

- [ ] **Step 5: Scenario D — `packages/domain` change runs both**

```bash
echo "// ci-verify $(date)" >> packages/domain/src/index.ts
git add packages/domain/src/index.ts
git commit -m "test: packages/domain change (both API and Web should run)"
git push
```

(Use `Read` first to find a safe append point in `packages/domain/src/index.ts`.)

```bash
gh run list --branch ci/split-by-app-verify --limit 3 --json name,databaseId,headSha
```

Expected: both an `API` run and a `Web` run appear for this commit's SHA, each with a successful `test` job.

- [ ] **Step 6: Confirm the root-cause bug is fixed — api's postinstall does not run during a web-only job**

```bash
gh run view <the-web-run-id-from-step-3> --log | grep -i "postinstall\|prisma generate" || echo "NOT FOUND (expected)"
```

Expected: `NOT FOUND (expected)` — the `Web` workflow's install step must not invoke `apps/api`'s `postinstall`/`prisma generate` at all, confirming the filtered install fixed the reported bug.

- [ ] **Step 7: Revert the verification-only diffs before merging anything to `main`**

```bash
git checkout main -- apps/web/src/vite-env.d.ts apps/api/src/main.ts packages/domain/src/index.ts docs/superpowers/plans/2026-07-26-ci-pipeline-split-by-app.md
git commit -m "test: revert verification-only changes"
git push
```

- [ ] **Step 8: Close the throwaway verification PR**

```bash
gh pr close ci/split-by-app-verify --delete-branch
```

---

### Task 5: Open the real PR for review

**Files:** none.

**Interfaces:**
- Consumes: the commits from Tasks 1-3 (cherry-picked onto a clean branch, since Task 4's branch also carries throwaway verification commits that must not be merged).

- [ ] **Step 1: Cherry-pick the real commits onto a clean branch and open a PR**

```bash
git checkout -b ci/split-by-app main
git cherry-pick <task-1-commit-sha> <task-2-commit-sha> <task-3-commit-sha>
git push -u origin ci/split-by-app
gh pr create --title "ci: split API and Web into independent, path-gated workflows" --body "$(cat <<'EOF'
## Summary
- Split `.github/workflows/ci.yml` into `.github/workflows/api.yml` (backend build/lint/test + Fly.io deploy), gated on `apps/api`/`packages/domain`/`packages/config` changes only
- Split `.github/workflows/deploy-pages.yml` into `.github/workflows/web.yml` (frontend build/lint/test + GitHub Pages deploy), gated on `apps/web`/`packages/domain`/`packages/config` changes only
- Fixed the root cause of the "API gets touched during a web-only deploy" bug: both workflows now use a filtered `pnpm install --filter=...` instead of a full workspace install, so `apps/api`'s `postinstall` (`prisma generate`) never runs unless `apps/api` is actually part of the job's scope
- Removed the now-redundant `dorny/paths-filter` "changes" job — native `on.push.paths`/`on.pull_request.paths` gates whole-workflow dispatch instead
- Updated `README.md`'s Deployment section to reference the new workflow file names

## Verification
Manually verified on a throwaway branch/PR — confirmed doc-only changes dispatch neither workflow, `apps/web`-only changes run only `Web`'s test job, `apps/api`-only changes run only `API`'s test job, `packages/domain` changes run both, and the `Web` workflow's install log no longer shows `apps/api`'s postinstall/`prisma generate` running.
EOF
)"
```

- [ ] **Step 2: Wait for CI to pass on this PR, then hand off to the user for merge approval**

Do not merge without explicit user confirmation — merging to `main` can trigger a real Fly.io deploy and/or GitHub Pages deploy depending on which paths the merge commit touches.

---

## Self-Review Notes

- **Spec coverage:** "backend and database migrations in a separated flow, triggered only when apps/api or packages/domain change" → Task 1 (`api.yml`, `paths:` scoped to `apps/api`+`packages/domain`+`packages/config`). "web app should live in another flow" → Task 2 (`web.yml`). "make sure related lints and tests for each layer are triggered in the right place" → both workflows now run their own scoped `lint`/`lint:boundaries`/`test` gated before their own `deploy`, instead of one unfiltered job covering everything regardless of what changed. The reported bug (api's postinstall running during a web deploy) → fixed in Task 2 Step 2 via filtered `pnpm install`, explicitly confirmed in Task 4 Step 6.
- **Placeholder scan:** No TBD/TODO. Task 4's file-append steps include a concrete fallback instruction ("use `Read` first to find a safe append point") rather than "handle appropriately," matching the precedent in the prior CI plan.
- **Type/name consistency:** Job names `test`/`deploy` (api.yml) and `test`/`build`/`deploy` (web.yml) are used consistently between the workflow YAML in Tasks 1-2 and the `gh run view --json jobs` checks in Task 4. Path anchors `&api-paths`/`&web-paths` are defined and aliased (`*api-paths`/`*web-paths`) within the same file each, no cross-file reuse assumed.
