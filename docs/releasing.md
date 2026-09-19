# Releasing to production

Production is deployed from a **tag**, not from a branch. Merging into `main` deploys nothing.

```text
develop  ──►  dev.zelohealth.app        (every merge, automatic)
   │
   └─ PR ─►  main                       (approved code; no deploy)
                │
                └─ tag vX.Y.Z ─►  release workflow ─►  API on Fly ─►  `production` branch ─►  web on Vercel
```

The release workflow (`.github/workflows/release.yml`) runs on a `vMAJOR.MINOR.PATCH` tag, or by hand
for a rollback. It checks that the tag's commit is reachable from `main`, deploys the API to Fly
(`zelo-api`) and checks `/health`, then moves the `production` branch to that commit, which is what
Vercel deploys the web app from. The web app only changes **after** the API deploy succeeded, so a
new web build never talks to an older API.

## One-time setup

1. **Vercel, prod project:** Settings, Git, Production Branch = `production`. Without this the web
   app still deploys from `main` on merge, which defeats the ordering above.
2. **GitHub, Settings, Environments:** create `production` and add yourself as a required reviewer.
   The API deploy waits for that approval, which is the moment to confirm the migration step below.
3. **Optional:** a ruleset restricting who can create `v*` tags. Do not protect `production` against
   force pushes: a rollback moves it backwards.

The repository secret `FLY_API_TOKEN` is already used by the deploy.

## Cutting a release

1. Confirm `develop` is green and that `dev.zelohealth.app` has been checked.
2. Write the release notes as `docs/releases/vX.Y.Z.md`, grouped by security, features, fixes and
   docs. The workflow publishes that file as the GitHub Release. Without it, GitHub generates a
   plain list of PR titles.
3. **Apply pending database migrations to production first.** The API deploy never runs them. List
   what is new since the last tag:

   ```bash
   git diff --name-only <last-tag> origin/main -- apps/api/prisma/migrations
   ```

   Then, from a machine whose `apps/api/.env.production.local` points at prod:

   ```bash
   NODE_ENV=production pnpm --filter @zelo/api exec prisma migrate status
   NODE_ENV=production pnpm --filter @zelo/api exec prisma migrate deploy
   ```

   Check that `DATABASE_URL` and `DIRECT_DATABASE_URL` in that file point at the same production
   database (see `monorepo-tooling.md`). A migration must be safe for the API version that is still
   running while it is applied, since the new API deploys afterwards: add a column, deploy code that
   uses it, and only later remove the old one.
4. Open a PR from `develop` into `main` and merge it. Nothing deploys.
5. Tag the merge commit and push the tag:

   ```bash
   git fetch origin && git tag -a vX.Y.Z origin/main -m "vX.Y.Z" && git push origin vX.Y.Z
   ```

6. In the Actions run, approve the `production` environment. Watch the API deploy, then the
   `production` branch move, then the Vercel deployment.
7. Check production: `curl -I https://api.zelohealth.app/health` and `curl -I https://www.zelohealth.app/`
   for the security headers, and one manager login.

## Versions

Tags are `vMAJOR.MINOR.PATCH`. A patch is a fix, a minor is a compatible feature or a batch of
them, a major is something that breaks a client or needs a coordinated cutover (for example moving
sessions to cookies logs everyone out).

## Rolling back

Actions, Release, Run workflow, with `tag` set to the previous version (for example `v1.0.0`).
It redeploys that version's API and moves `production` back to it. **Migrations are not undone.**
A rolled-back API must therefore be able to run against the current schema, which is what the
add-then-remove rule in step 3 is for.

`Run workflow` also has a `dry_run` option that only verifies the tag and deploys nothing.
