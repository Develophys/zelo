# CI Pipeline Remote Cache & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the follow-up hardening identified during review of `2026-07-26-ci-pipeline-split-by-app.md`: add `permissions`/`concurrency` parity to `api.yml`, replace hand-maintained per-package `--filter` lists with the self-maintaining `<pkg>...` shorthand, drop the unnecessary `CI_DB_*` secrets in favor of literal ephemeral credentials, and enable Turborepo Remote Caching (Vercel) across both workflows so the web app's duplicate `build` (once in `test`, once in `build`/deploy) becomes a cache hit instead of a full recompute.

**Architecture:** Four independent, mechanically-scoped edits to the two existing workflow files (`api.yml`, `web.yml`) plus the two new repo secrets Remote Caching requires. No application code changes. Each edit is reviewable and revertible on its own — a reviewer could accept the filter cleanup while rejecting Remote Caching, for example — so they stay as separate tasks/commits rather than one combined diff.

**Tech Stack:** GitHub Actions YAML, pnpm/Turborepo filter syntax (`--filter=<pkg>...`), Turborepo Remote Caching (Vercel), `gh` CLI for secrets and verification.

## Global Constraints

- **Prerequisite:** This plan assumes `2026-07-26-ci-pipeline-split-by-app.md` has already been fully executed and merged to `main`. `.github/workflows/api.yml` and `.github/workflows/web.yml` must already exist with the contents defined in that plan's Task 1 Step 3 and Task 2 Step 2 before starting Task 1 below. If they don't yet match (e.g. still mid-review), stop and wait — do not merge the two plans' changes out of order.
- Because this plan is written before that prerequisite merges, exact line numbers aren't known yet. Every "Modify" step below gives an exact before/after YAML snippet to locate via `Grep`/search rather than a line number — confirm the "before" snippet is present verbatim before editing.
- Do not touch `web.yml`'s existing `concurrency: {group: pages, cancel-in-progress: false}` — it's already safe (GitHub Pages deploys queue rather than race) and is not part of the reported gap. Only `api.yml` is missing `permissions`/`concurrency`.
- `api.yml`'s `deploy` job runs a real Fly.io deploy on `main`. Its concurrency group must not cancel an in-progress run on `main` — only PR/branch runs should be cancelable. Use `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`, not a bare `true`.
- The `...` filter suffix (pnpm and Turborepo share this syntax) means "this package plus everything it depends on." It is already proven working in this exact repo — `deploy-pages.yml`'s current `Build web (and its workspace deps)` step uses `--filter=@zelo/web...`. `packages/config` has no `build`/`lint`/`test`/`lint:boundaries` scripts (confirmed by reading `packages/config/package.json`), so including it via `...` is behavior-neutral — Turborepo silently skips tasks a package doesn't define.
- `CI_DB_USER`/`CI_DB_PASSWORD`/`CI_DB_NAME` only ever authenticate the ephemeral Postgres service container to itself over `localhost` inside a single job — nothing outside that job can reach it. There is no real secret to protect here; GitHub's own Postgres-service-container docs use plain literals. Task 3 reverts to literals and deletes the three secrets.
- Turborepo Remote Caching requires a human-performed browser login (`npx turbo login`) and a Vercel access token — this cannot be scripted end-to-end by an agentic worker. Task 4 Step 1 is explicitly a manual step; do not attempt to automate it or fabricate placeholder credentials.
- Verification must be done by pushing to a real branch and observing actual GitHub Actions runs via `gh`, per the established precedent in `2026-07-26-ci-pipeline-split-by-app.md` (local YAML syntax checks alone are insufficient in this repo).

---

## File Structure

- Modify: `.github/workflows/api.yml` — add `permissions`/`concurrency`; consolidate `--filter` lists to `@zelo/api...`; replace `CI_DB_*` secret references with literal ephemeral Postgres credentials; add `TURBO_TOKEN`/`TURBO_TEAM` to the `test` job's `env:`.
- Modify: `.github/workflows/web.yml` — consolidate `--filter` lists to `@zelo/web...`; add `TURBO_TOKEN`/`TURBO_TEAM` to the `test` and `build` jobs' `env:`.
- Repo secrets: delete `CI_DB_USER`, `CI_DB_PASSWORD`, `CI_DB_NAME`; add `TURBO_TOKEN`, `TURBO_TEAM`.

---

### Task 1: Add `permissions` and `concurrency` to `api.yml`

**Files:**
- Modify: `.github/workflows/api.yml`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `api.yml` gains a workflow-root `permissions` block and a `concurrency` block — no job/step names change, so later tasks in this plan are unaffected by this one.

- [ ] **Step 1: Locate the insertion point**

Confirm this exact block is present (it's the end of the `on:` trigger config, right before `jobs:`):

```yaml
  pull_request:
    paths: *api-paths

jobs:
```

- [ ] **Step 2: Insert `permissions` and `concurrency` between them**

Replace the snippet from Step 1 with:

```yaml
  pull_request:
    paths: *api-paths

permissions:
  contents: read

concurrency:
  group: api-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
```

- [ ] **Step 3: Validate YAML syntax locally**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/api.yml'))" && echo "VALID"
```

Expected: `VALID`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/api.yml
git commit -m "ci(api): add permissions and concurrency, matching web.yml"
```

---

### Task 2: Consolidate `--filter` lists to `<pkg>...` shorthand

**Files:**
- Modify: `.github/workflows/api.yml`
- Modify: `.github/workflows/web.yml`

**Interfaces:**
- Consumes: nothing from Task 1 (independent edit region — Task 1 touched the `on:`/`permissions` area, this touches `steps:`).
- Produces: every `pnpm install`/`pnpm turbo run` invocation in both files now resolves its package set via `@zelo/api...`/`@zelo/web...` instead of a hand-maintained list. Package set installed/linted/tested/built is unchanged (`@zelo/api`+`@zelo/domain`+`@zelo/config` and `@zelo/web`+`@zelo/domain`+`@zelo/config` respectively) — this is a maintainability fix, not a behavior change.

- [ ] **Step 1: Replace the install and four turbo-run lines in `api.yml`**

Find and replace each of these five lines (they appear once each, in the `test` job):

```yaml
        run: pnpm install --frozen-lockfile --filter=@zelo/api --filter=@zelo/domain --filter=@zelo/config
```
→
```yaml
        run: pnpm install --frozen-lockfile --filter=@zelo/api...
```

```yaml
        run: pnpm turbo run lint:boundaries --filter=@zelo/api --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run lint:boundaries --filter=@zelo/api...
```

```yaml
        run: pnpm turbo run lint --filter=@zelo/api --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run lint --filter=@zelo/api...
```

```yaml
        run: pnpm turbo run test --filter=@zelo/api --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run test --filter=@zelo/api...
```

```yaml
        run: pnpm turbo run build --filter=@zelo/api --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run build --filter=@zelo/api...
```

- [ ] **Step 2: Replace the install and turbo-run lines in `web.yml`**

`web.yml` has the same install line twice (once in `test`, once in `build`) — replace both occurrences:

```yaml
        run: pnpm install --frozen-lockfile --filter=@zelo/web --filter=@zelo/domain --filter=@zelo/config
```
→ (both occurrences)
```yaml
        run: pnpm install --frozen-lockfile --filter=@zelo/web...
```

And in the `test` job:

```yaml
        run: pnpm turbo run lint:boundaries --filter=@zelo/web --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run lint:boundaries --filter=@zelo/web...
```

```yaml
        run: pnpm turbo run lint --filter=@zelo/web --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run lint --filter=@zelo/web...
```

```yaml
        run: pnpm turbo run test --filter=@zelo/web --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run test --filter=@zelo/web...
```

```yaml
        run: pnpm turbo run build --filter=@zelo/web --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run build --filter=@zelo/web...
```

And in the `build` job:

```yaml
        run: pnpm turbo run build --filter=@zelo/web --filter=@zelo/domain
```
→
```yaml
        run: pnpm turbo run build --filter=@zelo/web...
```

(This is the same replacement text as the `test` job's build line above — `web.yml` will end up with two identical `pnpm turbo run build --filter=@zelo/web...` lines, one per job, which is correct and matches the current unmodified structure.)

- [ ] **Step 3: Validate YAML syntax locally**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/api.yml'))" && echo "API VALID"
python -c "import yaml; yaml.safe_load(open('.github/workflows/web.yml'))" && echo "WEB VALID"
```

Expected: `API VALID` and `WEB VALID`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/api.yml .github/workflows/web.yml
git commit -m "ci: consolidate per-package --filter lists into <pkg>... shorthand"
```

---

### Task 3: Replace `CI_DB_*` secrets with literal ephemeral Postgres credentials

**Files:**
- Modify: `.github/workflows/api.yml`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (different lines — the `services.postgres.env` and job-level `env` blocks, untouched by either prior task).
- Produces: `api.yml`'s Postgres service and `DATABASE_URL`/`DIRECT_DATABASE_URL` no longer reference `secrets.CI_DB_*`. The three secrets stop being read anywhere in the repo, making them safe to delete.

- [ ] **Step 1: Replace the service container's `env:` block**

Find:

```yaml
        env:
          POSTGRES_USER: ${{ secrets.CI_DB_USER }}
          POSTGRES_PASSWORD: ${{ secrets.CI_DB_PASSWORD }}
          POSTGRES_DB: ${{ secrets.CI_DB_NAME }}
```

Replace with:

```yaml
        env:
          POSTGRES_USER: zelo
          POSTGRES_PASSWORD: devpassword
          POSTGRES_DB: zelo
```

- [ ] **Step 2: Replace the job-level `DATABASE_URL`/`DIRECT_DATABASE_URL`**

Find:

```yaml
    env:
      DATABASE_URL: postgresql://${{ secrets.CI_DB_USER }}:${{ secrets.CI_DB_PASSWORD }}@localhost:5432/${{ secrets.CI_DB_NAME }}?schema=public
      DIRECT_DATABASE_URL: postgresql://${{ secrets.CI_DB_USER }}:${{ secrets.CI_DB_PASSWORD }}@localhost:5432/${{ secrets.CI_DB_NAME }}?schema=public
```

Replace with:

```yaml
    env:
      DATABASE_URL: postgresql://zelo:devpassword@localhost:5432/zelo?schema=public
      DIRECT_DATABASE_URL: postgresql://zelo:devpassword@localhost:5432/zelo?schema=public
```

- [ ] **Step 3: Validate YAML syntax locally**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/api.yml'))" && echo "VALID"
```

Expected: `VALID`.

- [ ] **Step 4: Confirm no other file references the `CI_DB_*` secrets before deleting them**

```bash
grep -rn "CI_DB_USER\|CI_DB_PASSWORD\|CI_DB_NAME" .github/ || echo "NO REFERENCES (safe to delete)"
```

Expected: `NO REFERENCES (safe to delete)`. If anything else references them, stop and investigate before Step 5.

- [ ] **Step 5: Delete the now-unused repo secrets**

```bash
gh secret remove CI_DB_USER
gh secret remove CI_DB_PASSWORD
gh secret remove CI_DB_NAME
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/api.yml
git commit -m "ci(api): use literal ephemeral Postgres credentials instead of secrets"
```

---

### Task 4: Enable Turborepo Remote Caching (Vercel)

**Files:**
- Modify: `.github/workflows/api.yml`
- Modify: `.github/workflows/web.yml`

**Interfaces:**
- Consumes: `TURBO_TOKEN`/`TURBO_TEAM` repo secrets produced by Step 1 (manual) + Step 2 (this task) below.
- Produces: both workflows' Turborepo-running jobs read/write a shared remote cache. This is what makes `web.yml`'s `test` job's `build` step and `build` job's `build` step (same commit, same inputs, same task hash) resolve the second one as a cache hit instead of a full recompute — verified concretely in Task 5.

- [ ] **Step 1 (manual — human only, cannot be automated): Obtain a Vercel Remote Cache token and team ID**

This step must be performed by a human with browser access; an agentic worker cannot complete it.

1. Sign in (or create a free account) at https://vercel.com.
2. From the repo root, run: `npx turbo login` — this opens a browser to authenticate the Turborepo CLI with your Vercel account. The resulting credential is stored in your user-global `~/.turbo/config.json`, not in this repo.
3. From the repo root, run: `npx turbo link` — choose the scope (personal account or a team) to associate this repo's Remote Cache with. This creates `.turbo/config.json` in the repo root containing a `teamId` field. (`.turbo/` is already gitignored — confirmed via `.gitignore:31,169,191` — so this file will not be committed.)
4. Go to https://vercel.com/account/tokens and create a new access token (e.g. named `zelo-ci-remote-cache`). Copy its value — this is `TURBO_TOKEN`.
5. Open the `.turbo/config.json` created in Step 3 and copy the `teamId` value — this is `TURBO_TEAM`.
6. Provide both values to continue with Step 2.

- [ ] **Step 2: Set the repo secrets (values supplied by the human from Step 1)**

```bash
gh secret set TURBO_TOKEN --body "<TURBO_TOKEN value from Step 1>"
gh secret set TURBO_TEAM --body "<TURBO_TEAM value from Step 1>"
```

- [ ] **Step 3: Add `TURBO_TOKEN`/`TURBO_TEAM` to `api.yml`'s `test` job**

Find (this is the job-level `env:` block, already modified by Task 3 but not yet containing Turbo vars):

```yaml
    env:
      DATABASE_URL: postgresql://zelo:devpassword@localhost:5432/zelo?schema=public
      DIRECT_DATABASE_URL: postgresql://zelo:devpassword@localhost:5432/zelo?schema=public
```

Replace with:

```yaml
    env:
      DATABASE_URL: postgresql://zelo:devpassword@localhost:5432/zelo?schema=public
      DIRECT_DATABASE_URL: postgresql://zelo:devpassword@localhost:5432/zelo?schema=public
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

- [ ] **Step 4: Add a job-level `env:` to `web.yml`'s `test` job**

Find:

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
```

Replace with:

```yaml
  test:
    runs-on: ubuntu-latest
    env:
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
```

- [ ] **Step 5: Add a job-level `env:` to `web.yml`'s `build` job**

Find:

```yaml
  build:
    needs: test
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
```

Replace with:

```yaml
  build:
    needs: test
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    env:
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
```

(Leave the existing step-level `env:` on the "Build web (and its workspace deps) for deploy" step — `VITE_API_BASE_URL`/`VITE_BASE_PATH` — untouched; step-level env merges with job-level env in GitHub Actions, both will be present for that step.)

- [ ] **Step 6: Validate YAML syntax locally**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/api.yml'))" && echo "API VALID"
python -c "import yaml; yaml.safe_load(open('.github/workflows/web.yml'))" && echo "WEB VALID"
```

Expected: `API VALID` and `WEB VALID`.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/api.yml .github/workflows/web.yml
git commit -m "ci: enable Turborepo Remote Caching across api.yml and web.yml"
```

---

### Task 5: Verify all changes on real GitHub Actions runs

**Files:** none (verification only — no code changes).

**Interfaces:**
- Consumes: the completed commits from Tasks 1-4, pushed to a real branch.
- Produces: confirmation that each change actually works, including a demonstrated Remote Cache hit.

- [ ] **Step 1: Push Tasks 1-4 to a throwaway branch and open a disposable PR**

```bash
git checkout -b ci/remote-cache-hardening-verify
git push -u origin ci/remote-cache-hardening-verify
gh pr create --title "test: verify remote cache + hardening (throwaway)" --body "Verification PR — will be closed without merging." --base main
```

- [ ] **Step 2: Trigger `api.yml` and confirm it succeeds with literal DB credentials**

```bash
echo "// ci-verify $(date)" >> apps/api/src/main.ts
git add apps/api/src/main.ts
git commit -m "test: trigger api.yml"
git push
gh run watch --exit-status $(gh run list --branch ci/remote-cache-hardening-verify --workflow=API --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: run succeeds — Postgres service starts healthy, `prisma migrate deploy` and the test suite pass using the literal `zelo`/`devpassword`/`zelo` credentials.

- [ ] **Step 3: Confirm the `...` filter still installs/tests the same package set**

```bash
RUN_ID=$(gh run list --branch ci/remote-cache-hardening-verify --workflow=API --limit 1 --json databaseId -q '.[0].databaseId')
gh run view "$RUN_ID" --log | grep -i "@zelo/domain\|@zelo/config" | head -5
```

Expected: log output shows `@zelo/domain` and `@zelo/config` present in the install/build steps, confirming `@zelo/api...` pulled in the same packages the old manual list did.

- [ ] **Step 4: Confirm the concurrency group cancels a superseded PR run but doesn't affect `main`**

```bash
echo "// ci-verify 2 $(date)" >> apps/api/src/main.ts
git add apps/api/src/main.ts
git commit -m "test: second push to trigger concurrency cancellation"
git push
sleep 5
gh run list --branch ci/remote-cache-hardening-verify --workflow=API --limit 3 --json databaseId,status,conclusion
```

Expected: the run from Step 2 (or its successor before this push) shows `conclusion: cancelled`, and only the latest run proceeds — confirming `cancel-in-progress` is active for this non-`main` ref.

- [ ] **Step 5: Trigger `web.yml` and confirm a Remote Cache hit inside the same run**

```bash
echo "// ci-verify $(date)" >> apps/web/src/vite-env.d.ts
git add apps/web/src/vite-env.d.ts
git commit -m "test: trigger web.yml"
git push
RUN_ID=$(gh run watch --exit-status $(gh run list --branch ci/remote-cache-hardening-verify --workflow=Web --limit 1 --json databaseId -q '.[0].databaseId') --json databaseId -q '.databaseId' 2>/dev/null || gh run list --branch ci/remote-cache-hardening-verify --workflow=Web --limit 1 --json databaseId -q '.[0].databaseId')
gh run view "$RUN_ID" --log | grep -i "cache hit\|FULL TURBO\|replaying"
```

Expected: at least one line indicating a cache hit (Turborepo prints something like `cache hit, replaying output` or `>>> FULL TURBO`) for the `build` job's `turbo run build` step — proving it reused the `test` job's build of the same commit instead of recompiling from scratch.

- [ ] **Step 6: Revert the verification-only diffs before merging anything to `main`**

```bash
git checkout main -- apps/api/src/main.ts apps/web/src/vite-env.d.ts
git commit -m "test: revert verification-only changes"
git push
```

- [ ] **Step 7: Close the throwaway verification PR**

```bash
gh pr close ci/remote-cache-hardening-verify --delete-branch
```

---

### Task 6: Open the real PR for review

**Files:** none.

**Interfaces:**
- Consumes: the commits from Tasks 1-4 (cherry-picked onto a clean branch, since Task 5's branch also carries throwaway verification commits that must not be merged).

- [ ] **Step 1: Cherry-pick the real commits onto a clean branch and open a PR**

```bash
git checkout -b ci/remote-cache-hardening main
git cherry-pick <task-1-commit-sha> <task-2-commit-sha> <task-3-commit-sha> <task-4-commit-sha>
git push -u origin ci/remote-cache-hardening
gh pr create --title "ci: remote caching, filter cleanup, and hardening for api.yml/web.yml" --body "$(cat <<'EOF'
## Summary
- Added `permissions`/`concurrency` to `api.yml` for parity with `web.yml`; `cancel-in-progress` is scoped to non-`main` refs so it never cancels an in-flight Fly.io deploy
- Replaced hand-maintained `--filter=@zelo/api --filter=@zelo/domain --filter=@zelo/config`-style lists with the self-maintaining `@zelo/api...`/`@zelo/web...` shorthand (matches the pattern `deploy-pages.yml` already used for web) — no behavior change, removes a manual-sync footgun as the workspace graph grows
- Replaced the `CI_DB_USER`/`CI_DB_PASSWORD`/`CI_DB_NAME` secrets with literal ephemeral Postgres credentials — those secrets only ever authenticated a per-job service container to itself over localhost, protecting nothing
- Enabled Turborepo Remote Caching (Vercel) across both workflows, so `web.yml`'s `build` job reuses the `test` job's build output for the same commit instead of recompiling it

## Verification
Manually verified on a throwaway branch/PR — confirmed `api.yml` still passes with literal DB credentials, the `...` filter installs the same package set as before, the concurrency group cancels a superseded PR run without touching `main`, and `web.yml`'s second build of the same commit shows a Turborepo Remote Cache hit in the logs.
EOF
)"
```

- [ ] **Step 2: Wait for CI to pass on this PR, then hand off to the user for merge approval**

Do not merge without explicit user confirmation — merging to `main` can trigger a real Fly.io deploy and/or GitHub Pages deploy depending on which paths the merge commit touches.

---

## Self-Review Notes

- **Spec coverage:** All four review suggestions are covered 1:1 — Remote Caching → Task 4, `<pkg>...` filter consolidation → Task 2, dropping `CI_DB_*` secrets → Task 3, `permissions`/`concurrency` parity → Task 1. The one refinement beyond the original verbal suggestion (`cancel-in-progress: true` → conditioned on `github.ref != 'refs/heads/main'`) is called out explicitly in Global Constraints so it isn't mistaken for scope creep.
- **Placeholder scan:** Task 4 Step 1 is deliberately marked manual/non-automatable rather than faked with placeholder credentials — this is a real external dependency (Vercel account + browser OAuth), not a plan gap. All YAML before/after snippets are literal, copy-pasteable text, not "similar to above."
- **Type/name consistency:** Job names (`test`, `deploy` in `api.yml`; `test`, `build`, `deploy` in `web.yml`) and secret names (`TURBO_TOKEN`, `TURBO_TEAM`, `CI_DB_USER`/`CI_DB_PASSWORD`/`CI_DB_NAME`) are used identically across all tasks and the Task 5 verification commands. Confirmed `packages/config/package.json` has no `lint`/`test`/`build`/`lint:boundaries` scripts, so Task 2's filter widening is genuinely behavior-neutral, not an unverified assumption.
