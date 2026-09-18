# Priorities — ranked backlog

This file is *what to do next*. `docs/superpowers/specs/technical-debt.md` remains *why we
accepted a given trade-off and when to revisit it*. The two are linked, not merged: this list
absorbs `technical-debt.md`'s still-open entries as ranked, actionable items (`TD-003` is
below; `TD-001` is below via item #10 — see its status note there; `TD-002` is resolved and is
intentionally excluded), while `technical-debt.md` keeps the full decision record — risk
accepted, compensating control, revisit trigger — for entries that are a deliberate scope
choice rather than a queued fix. If you're deciding whether something is safe to defer, read
`technical-debt.md`. If you're deciding what to work on next, read this file.

Ranking is by (impact on correctness or on a user) × (cost of leaving it) ÷ effort. Twenty-six
items, deduplicated across nine audit domains plus two maintainer-flagged items placed on
their merits rather than given automatic top billing (see #9, #14, #23). This is a record, not
a queue with owners or dates — no code, config, or dependency change was made as part of
producing it (see the design spec, `docs/superpowers/specs/2026-09-15-ai-conventions-documentation-design.md`
§9).

---

## 1. Production seed script targets the wrong database — GUARDED

`seed.ts` and `create-super-admin.ts` now call `assertSameDatabaseTarget()`
(`src/shared/config/assert-database-target.ts`) before connecting. It refuses to run when
`DIRECT_DATABASE_URL` is set and `DATABASE_URL` is not, and when one resolves to a loopback
host while the other is remote — the exact split described below. `prisma/README.md`'s claim
that "both connection strings are already in `apps/api/.env`" is corrected.

**What the guard deliberately does not catch:** two *different remote* databases. Comparing
hostnames strictly would false-positive on legitimate pooled-vs-direct setups (Prisma
Accelerate, Neon's `-pooler` endpoint), so the check is the local/remote boundary only.

**Operational note worth keeping.** `apps/api/.env.production.local` on at least one machine
carries a UTF-8 BOM (`ef bb bf`) before the first variable. That hides `DATABASE_URL` from an
anchored `grep -E "^\s*DATABASE_URL="`, and it produced a *wrong conclusion twice* during this
work — once reported as "the var is missing" and once as "the earlier report was a false
positive." Read the file or use `sed 's/=.*//'`; do not settle this question with an anchored
grep. On the machine checked, both variables resolve to `db.prisma.io` under
`NODE_ENV=production` — the mechanism below is real, but it was not live there.

The original entry, kept because the mechanism is what matters:

- **Why:** `apps/api/.env.production.local` is gitignored (`.gitignore:203`) — untracked,
  machine-local — so nothing in the repo guarantees that `DATABASE_URL` is present there
  alongside `DIRECT_DATABASE_URL`, and git history cannot confirm it either way for any given
  machine. *If* it is missing on the machine running the script, then under `NODE_ENV=production`
  the load-env cascade falls through to `apps/api/.env`'s localhost value: the Prisma CLI (which
  reads `DIRECT_DATABASE_URL`) targets production while `seed.ts` and `create-super-admin.ts`
  (which go through `PrismaService`, reading `DATABASE_URL`) target the local database.
  `seed.ts` is destructive by design — it deletes and regenerates a rolling 6-week signal
  window — so a pre-demo re-seed under that condition wipes the LOCAL database while printing a
  success message an operator reads as "production refreshed", in the same session where
  `prisma migrate deploy` really did hit production. This item is the *mechanism*, not an
  assertion about the current contents of any one operator's file: the two vars are read by two
  entirely separate code paths with no check that they agree, so it has to be verified per
  machine before every prod run rather than assumed.
  `docs/conventions/monorepo-tooling.md:170-193` states the same guard where an operator doing a
  re-seed will actually hit it. The one flatly wrong instruction sits in
  `apps/api/prisma/README.md:205`, which still says "Both connection strings are already in
  `apps/api/.env`" — untrue since the dev/prod split landed.
- **Effort:** small
- **Kind:** security
- **Files:** `apps/api/.env.production.local`, `apps/api/.env`, `apps/api/prisma/seed.ts`,
  `apps/api/prisma/create-super-admin.ts`, `apps/api/prisma/README.md`

## 2. Dead dependency-cruiser rule: `application-no-prisma-imports` never fires — FIXED

The rule now targets `^generated/prisma|node_modules/@prisma/client`. The generated path is
what every repository actually imports and what dependency-cruiser resolves to (verified by
cruising with `--output-type json`: 32 distinct modules under `generated/prisma`); the
`node_modules` path is kept so installing and importing the package cannot bypass the boundary
either.

**Proven to fire, not just changed.** A rule that never fires cannot be fixed by inspection —
the fix was verified by planting an import of `generated/prisma/client.ts` inside
`notification/application/ports/`, confirming `depcruise` reports
`error application-no-prisma-imports` and **exits 1** (so CI fails), then removing the probe and
confirming it returns to green. No `application/` file violates the rule today, so the corrected
rule is a guard for future work rather than a fix for a current breach.

**Recurrence guarded.** The rule's target is coupled to `schema.prisma`'s
`generator client { output }`. Moving that output would silently make the rule stop matching —
the same failure, again. `src/shared/config/prisma-boundary-rule.test.ts` asserts the two agree,
and was itself verified to fail when the generator output is moved.

The original entry:

- **Why:** The rule forbids importing `node_modules/@prisma/client`, which zero files do — the
  real client is reached via the relative `generated/prisma/client.ts` path, which no rule
  covers. This is the load-bearing enforcement behind three backend-modules rules and the whole
  application/infrastructure split. An agent importing `generated/prisma` into `application/`
  would watch `pnpm lint:boundaries` pass green and discover the coupling only when persistence
  is swapped. One config line; also fix the stale comment that tells the next reader the guard
  already works.
- **Effort:** small
- **Kind:** tooling-gap
- **Files:** `apps/api/.dependency-cruiser.cjs`,
  `apps/api/src/modules/notification/application/ports/notification.port.ts:1-3`

## 3. `vi.spyOn` never restored in 24 of 54 test files — FIXED

`restoreMocks: true` is set in all three vitest configs. The 427 spies installed inside `it`
blocks across those 24 files no longer survive into the next test in their file.

**Proven to fire, not just changed.** `apps/api/src/shared/testing/mock-isolation.test.ts` and
`apps/web/src/testing/mock-isolation.test.ts` each install a `vi.spyOn` inside one `it` and
assert in the next `it` that the original method is back. Both were verified to fail (exit 1)
with `restoreMocks` removed from their config, and the failure message names the missing line.

**The entry's "backward-compatible" claim was wrong, and the reason is worth keeping.** Turning
the flag on broke 6 tests across 3 files, and none of them was a test leaning on a leaked stub.
`restoreMocks` calls `mockRestore` on *every* mock, including the module-scope `vi.fn()` inside
a `vi.mock(...)` factory — the third-party-SDK pattern `testing.md` §2 sanctions. `mockRestore`
restores a mock to its *original* implementation, and `vi.fn().mockImplementation(fn)` has no
original. That restore runs **before every test, the first one included** — measured, not
inferred — so such a factory starts returning `undefined` and every construction of the SDK
behind it blows up. `vi.fn(fn)` does have an original — `fn` itself — so it survives; a
`beforeEach` that re-arms the mock works too, since user hooks run after the restore. The fix was to
convert the five module-scope factories to `vi.fn(fn)`; the five `vi.fn().mockImplementation()`
calls inside `it` blocks (`useBulkDelete`, `useBulkStatusUpdate`) are built fresh per test and
were left alone.

The original entry:

- **Why:** Set `restoreMocks: true` in all three vitest configs. 24 of 54 files calling
  `vi.spyOn` never restore it, several installing the spy inside a single `it` rather than a
  `beforeEach`, so it leaks into every later test in that file — a test can pass on a stub it
  never asked for. With no coverage gate, no e2e, and no formatter check, a false green is this
  repo's widest-blast-radius failure mode. Three lines, backward-compatible with the 30 files
  that already restore correctly.
- **Effort:** small
- **Kind:** technical-debt
- **Files:** `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`,
  `packages/domain/vitest.config.ts`

## 4. `prisma generate` isn't wired into Turborepo — stale client on local build/test — FIXED

`turbo.json` gained a `prisma:generate` task (inputs `prisma/schema.prisma` +
`prisma/migrations/**`, outputs `generated/prisma/**`), and both `build` and `test` depend on
it. Turbo skips that dependency for packages without a matching script — `@zelo/web` and
`@zelo/domain`'s `prisma:generate` resolve to `<NONEXISTENT>` (confirmed with
`turbo run build --dry=json`) — so only `@zelo/api` actually runs `prisma generate`.

**Proven to fire, not just changed.** Editing `apps/api/prisma/schema.prisma` and running
`turbo run build` cache-missed `@zelo/api#prisma:generate`, regenerated the client, and
cascaded a cache miss to `@zelo/api#build` — while `@zelo/web#build` and `@zelo/domain#build`
stayed cache hits, since neither depends on the api's schema. Reverting the edit and re-running
was `FULL TURBO` (4/4 cached), confirming the task doesn't over-invalidate on unrelated changes.

The original entry:

- **Why:** `prisma generate` runs only from `apps/api`'s postinstall and explicit CI/Docker
  steps, so editing `schema.prisma` and then running `pnpm build` or `pnpm test` locally
  compiles against a stale generated client — a false green, since the old client's types still
  satisfy `tsc` while the new column doesn't exist at runtime. Together with #3, these are the
  two cheapest fixes that stop the local feedback loop from lying, which matters more here than
  usual because an agent trusts a green run absolutely.
- **Effort:** small
- **Kind:** tooling-gap
- **Files:** `turbo.json`, `apps/api/package.json` (postinstall), `apps/api/prisma/schema.prisma`

## 5. `QueryClient` has no `defaultOptions` — the largest unforced re-render source in the app — FIXED

`apps/web/src/app/query-client.ts` now passes `defaultOptions: { queries: { staleTime: 30_000 } }`
to `new QueryClient()`. `refetchOnWindowFocus` is left at its default (`true`) —
`staleTime` is what gates it, so a screen left open for real time away still refreshes on
return, and only the immediate-refocus churn (alt-tab back to `ManagerDashboardPage`, an admin
table) is absorbed. None of the app's 11 `useQuery` call sites set their own `staleTime`, so
all of them now inherit the 30s default; none depended on `staleTime: 0` (full web suite green
before and after).

Considered wrapping `useQuery` in a shared hook instead of centralizing via `defaultOptions`,
and chose `defaultOptions`: it's TanStack Query's own mechanism for exactly this, it matches
how this same file already centralizes mutation error handling via `MutationCache` rather than
a `useMutation` wrapper, and — unlike a wrapper hook, which only works if every future call
site remembers to import it instead of `useQuery` — it can't be silently bypassed, the same
way `'is the only QueryClient the app constructs...'` in `query-client.test.ts` already
guarantees no surface can construct its own client.

`query-client.test.ts` locks the value down with an assertion on `getDefaultOptions()`.

The original entry:

- **Why:** `apps/web/src/app/query-client.ts` passes only `mutationCache` to `new QueryClient()`,
  so every query runs at TanStack Query 5's defaults (no `staleTime`, refetch on window focus).
  Every alt-tab back to `ManagerDashboardPage` refires and re-renders it; every alt-tab on an
  admin table refires the list query, produces a new `data` identity, busts the
  `useMemo(() => data ?? [])` chain, and re-derives `useDataTableSelection`'s Set — the exact
  cascade the repo's manual stabilization exists to prevent, triggered by a config default. Two
  lines in one file.
- **Effort:** small
- **Kind:** performance
- **Files:** `apps/web/src/app/query-client.ts`

## 6. `eslint-plugin-react-hooks` is not installed — FIXED

`apps/web/eslint.config.mjs` now wires the plugin's recommended preset. Six findings needed a
real code fix rather than a disable comment: `useInlineConfirm()` was destructured at its call
site, `useHotkey`'s latest-ref write moved into `useLayoutEffect`, and `ScaleAssessmentPage`'s
refs findings were resolved directly. Everything else — `useDebouncedSearch`'s refs findings,
`Tooltip`'s refs findings, the remaining set-state-in-effect/exhaustive-deps/globals findings,
and `useFollowUpAnswer`'s purity findings — is a targeted per-site suppression, not a blanket
config-level disable. `react-hooks/incompatible-library` is left as 10 tracked warnings on
purpose (spec §2): it fires on React Hook Form's `watch()`, which genuinely can't be memoized,
so the fix is upstream of this repo.

**Proven to fire, not just changed.** `pnpm --filter @zelo/web lint` exits 0 today. Reverting
`apps/web/eslint.config.mjs` to the commit before this work landed (`git show
5cd23bd:apps/web/eslint.config.mjs > apps/web/eslint.config.mjs`) and re-running the
same lint command turns it red: 20 errors, one `Definition for rule '<react-hooks/rule>' was not
found` per surviving disable comment, across `AssessmentReview.tsx`, `InstitutionLinkCard.tsx`,
`LinkInstitutionQrScanModal.tsx`, `QrCodeModal.tsx`, `useDebouncedSearch.ts`,
`useFollowUpAnswer.ts`, `useInlineConfirm.ts`, `usePeerPartnerConnection.ts` and others — the
disable comments this plan added now reference a plugin nothing registers. Restoring the file
(`git checkout -- apps/web/eslint.config.mjs`) brings it back to exit 0 with the same 10
`incompatible-library` warnings as before the revert. The full web suite stayed green throughout
(193 files / 2360 tests, same count as item #5's baseline), and `lint:boundaries`/`build` both
still exit 0.

One correction worth keeping: fixing `AssessmentReview.tsx` surfaced a real discrepancy in this
plan's own text — the exhaustive-deps disable comment had to land one line below where the
plan's before/after literally showed it, to match the line ESLint actually reports on. The
report-only rollout this entry originally proposed wasn't needed — every finding sorted cleanly
into "real fix" or "deliberate suppression" without a staged phase.

The original entry:

- **Why:** `rules-of-hooks` and `exhaustive-deps` are entirely unenforced across 56 `useEffect`,
  31 `useCallback` and 12 `useMemo` call sites, though the CI lint path (`pnpm turbo run lint
  --filter=@zelo/web...`) already exists and is unused for this. The identity chain that keeps
  chat memoization working end-to-end is invisible to tooling — dropping one dependency still
  lints and builds clean. Roll out in report-only mode first: the claim the codebase "would very
  nearly pass today" is a hand audit, not a measurement, and at least two deliberate mount-only
  effects will need explicit disables.
- **Effort:** small
- **Kind:** tooling-gap
- **Files:** `packages/config/eslint.base.mjs`

## 7. SuperAdmin sessions cannot be revoked

- **Why:** `AdminAuthGuard.canActivate` verifies the token and stops — no DB re-read (see
  `apps/api/src/modules/admin/infrastructure/admin-auth.guard.ts`, the guard body) — and the
  `SuperAdmin` model has no `isActive` column at all, unlike `ManagerAuthGuard`, which re-reads
  both the manager and the institution on every request. Deleting the row leaves the HMAC token
  valid for the remaining 8h against every institution-management route on the platform — the
  widest-scoped role in the product, and the only one whose password is never validated by any
  zod schema (`SUPER_ADMIN_PASSWORD`). `ManagerAuthGuard` already shows exactly what to copy.
- **Effort:** small
- **Kind:** security
- **Files:** `apps/api/src/modules/admin/infrastructure/admin-auth.guard.ts`,
  `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`,
  `apps/api/prisma/schema.prisma` (`SuperAdmin` model)

## 8. Peer-chat gateway accepts tokenless sockets with no input validation

- **Why:** `handleConnection` allows sockets with no token (`if (!token) return;`), and
  `handleRequestPeer` reads `payload.institutionId` straight from that anonymous client — no
  zod, no guard, no throttle, no cross-check. It's the only request surface in the app with zero
  input validation. Any browser can open a socket with no token and enumerate institutions (a
  cuid the public by-code endpoint hands out), occupying a hospital's peer partners 30 seconds at
  a time. It inverts the API's own rule that the tenant key comes from the guard, never the
  payload — on the one surface where a live human in distress is on the other end. The fix is
  authorization, not validation: `accept`/`decline` already check `isCurrentCandidate`; only
  `request-peer` is open. The 25-case gateway test has no payload or authorization case at all.
- **Also:** while touching this file, fix the naming inconsistency in the event vocabulary — `request-peer` is the gateway's only kebab-case event name; every other one (`accept_request`, `decline_request`, `incoming_request`, `leave_conversation`, `no_peer_available`, `peer_left`) is snake_case (see `docs/conventions/realtime-and-streaming.md` §1).
- **Effort:** medium
- **Kind:** security
- **Files:** `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts`,
  `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.test.ts`

## 9. Sector-manager QR permission gap (user-flagged)

The design spec calls this out for honest, non-inflated placement, so the fuller framing is
kept here rather than compressed to one line.

A `SECTOR_MANAGER` has no path to their own sector's invite code today: the only endpoint that
returns `Sector.inviteCode` is `GET /manager/admin/sectors`, gated by the class-level
`HospitalAdminGuard`, while the scoped `GET /manager/sectors` returns only `{id, name}`. This is
merged with its four blockers, because none of them is optional:

1. The fix must be a **new repository method**, not a widened `select` on
   `findActiveByInstitution` — that method is the entire body of the unauthenticated
   `GET /institutions/:id/sectors` (`institution.controller.ts`, no `@UseGuards` anywhere in the
   file). Widening it would publish every sector's QR credential to anyone holding an
   institution cuid.
2. `DataTable` has no read-only mode — `selection`, `rowActions` and `toolbar` are all required
   props.
3. `ManagerAdminSectorsPage` unconditionally calls the admin-only `useAdminManagers`.
4. No seeded `Sector` has an `inviteCode`, so the feature is undemoable locally
   (`apps/api/prisma/seed-data.ts` has no `inviteCode` field on its sector rows; `seed.ts` sets
   `inviteCode` for institutions only).

There is also no per-sector ownership primitive anywhere in the API — zero comparisons of
`sector.managerId` to the authenticated manager exist — so whoever builds this will improvise
the check inline in a controller unless a playbook says where it belongs. Ranked below the
cheap silent-failure fixes above because it is new work with a known-good shape, not a live
defect.

- **Effort:** large
- **Kind:** product-gap
- **Files:** `apps/api/src/modules/institution/infrastructure/institution.controller.ts`,
  `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`
  (`findActiveByInstitution`), `apps/web/src/presentation/ui/DataTable/DataTable.tsx`,
  `apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx`,
  `apps/web/src/presentation/hooks/useAdminManagers.ts`, `apps/api/prisma/seed-data.ts`,
  `apps/api/prisma/seed.ts`

## 10. Enforce TD-001's stated compensating control and add baseline security headers

- **Why:** `technical-debt.md` TD-001 names "no `dangerouslySetInnerHTML`" as the thing standing
  between `sessionStorage`-held Bearer tokens and full session exfiltration for manager,
  hospital-admin, SuperAdmin and peer-partner — and nothing verifies it today (zero occurrences
  is convention only). Add `react/no-danger: error` to the shared eslint config, and add helmet
  or equivalent CSP/HSTS/X-Frame-Options/Referrer-Policy headers — there are none anywhere: no
  helmet on the API, no headers from `docker/nginx.conf` or `apps/web/vercel.json`, no CSP meta
  in `index.html`. One lint rule converts the documented control into an enforced one; a CSP is
  the cheapest control that would blunt exfiltration even if an XSS did land.

  **TD-001 status note:** as of this writing TD-001 in `technical-debt.md` is still `Accepted,
  deferred` (dated 2026-07-12), but that status is worth re-confirming rather than assumed
  stale or current — a September design spec and implementation plan exist for the underlying
  `HttpOnly`-cookie migration
  (`docs/superpowers/specs/2026-09-14-httponly-cookie-session-migration-design.md`,
  `docs/superpowers/plans/2026-09-14-httponly-cookie-session-migration.md`). As of this task,
  only those two documents exist in git history for that migration — `git log --all` shows no
  commits touching guard or session-store code for it, and
  `apps/web/src/stores/manager-session.store.ts:4` and `:34` still read "sessionStorage +
  Bearer token, not an HttpOnly cookie — deliberate" and persist to `sessionStorage`. So the
  migration is spec-and-plan-only, not shipped — check whether it has shipped before treating
  TD-001 as either still fully open or already closed.
- **Effort:** small
- **Kind:** security
- **Files:** `packages/config/eslint.base.mjs`, `apps/api/src/main.ts`, `docker/nginx.conf`,
  `apps/web/vercel.json`, `docs/superpowers/specs/technical-debt.md` (TD-001)

## 11. Missing `aria-invalid`/`aria-describedby` on several react-hook-form-migrated forms

- **Why:** Both forgot-password pages run `zodResolver` with real validation messages and render
  no `aria-invalid`, no `aria-describedby` and no error paragraph; same for 3 of 4
  `AdminInstitutions` create fields, `ManagerFormModal`'s name field, `ManagerAdminPeersPage`'s
  name and specialty fields, and the password field on both login pages. A screen-reader user on
  the forgot-password screen — a single-field page — gets a permanently disabled submit button
  with no announcement of why. This is a regression introduced *by* the react-hook-form
  migration, not a leftover from the hand-rolled era, and the migration is still in progress, so
  every remaining migration task can reproduce it. The fix is the same three-line block already
  present on the email field of every migrated form.
- **Effort:** small
- **Kind:** product-gap
- **Files:** `apps/web/src/presentation/pages/ManagerForgotPasswordPage.tsx`,
  `apps/web/src/presentation/pages/PeerPartnerForgotPasswordPage.tsx`,
  `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`,
  `apps/web/src/presentation/pages/ManagerAdminManagersPage/ManagerFormModal.tsx`,
  `apps/web/src/presentation/pages/ManagerAdminPeersPage.tsx`,
  `apps/web/src/presentation/pages/ManagerLoginPage.tsx`,
  `apps/web/src/presentation/pages/AdminLoginPage.tsx`,
  `apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx`

## 12. a11y test coverage gap: 11 screens missing, no open-`Modal` axe scan

- **Why:** Append the 11 missing screens to `SCREENS` in `a11y.test.tsx` — the entire
  peer-partner surface, both super-admin screens, both finish-setup and both forgot-password
  flows, `LinkInstitutionPage`, `FallbackPage`, and `SettingsPage` at route level — and add at
  least one axe scan of an *open* `Modal` (`Modal.test.tsx` has zero axe references, and the
  route sweep renders every dialog closed). Half the authenticated surfaces ship with no
  automated a11y check, including every screen a peer partner sees and both password-setting
  flows, on a product whose premise is reachability under distress. The modal gap is worse:
  every admin create/edit form and every destructive confirmation lives inside a `Modal`, so the
  forms with the most fields and the only irreversible actions sit entirely outside the net.
- **Effort:** small
- **Kind:** product-gap
- **Files:** `apps/web/src/presentation/pages/a11y.test.tsx`,
  `apps/web/src/presentation/ui/Modal.test.tsx`

## 13. Docs an agent reads first are stale or contradict the deployed stack

- **Why:** `README.md` line 46's tech-stack table still says GitHub Pages and Neon under
  "Infra", contradicting its own Deployment section further down, which documents Vercel +
  Prisma Postgres. The `architecture-reference.md` half of this item is **resolved by this branch**:
  it used to describe `apps/web/src/app/container.ts` as a single file, and `:133-138` now
  describes the 12-file `apps/web/src/app/container/` directory (`index.ts` plus 11 sibling
  files) and says outright "there is no `container.ts` any more" — re-verified: `grep -n
  "container.ts" general-documentations/architecture-reference.md` returns only that line.
  `docs/superpowers/specs/AGENTS.md` also now carries a "Historical" banner. What is still open
  is the README and the remaining spec-era content: `docs/superpowers/specs/` (the July
  build-plan-era specs) describe React 18, a
  `tailwind.config.ts`, Google Fonts CDN links, a `loading` Button prop and `bg-brand
  text-white` — all superseded. Also delete the dead `VITE_BASE_PATH` plumbing left behind by
  the retired GitHub Pages workflow. These files present themselves as "start here" and "source
  of truth"; an agent following them ships a no-op Tailwind config, breaks PWA offline
  precaching with external font links, and passes a prop that silently does nothing. (The
  "wires a second, dead DI surface" consequence this item used to list is gone with the
  `container.ts` description.)
- **Effort:** small (was medium — the `architecture-reference.md` portion is done)
- **Kind:** technical-debt
- **Files:** `README.md` (the tech-stack table), `docs/superpowers/specs/` (React 18 / Tailwind
  config / font-CDN / `loading`-prop / `bg-brand` references, beyond the banner
  `AGENTS.md` already carries), `apps/web/vite.config.ts` + `turbo.json` (`VITE_BASE_PATH`)

## 14. Route-level code splitting — DONE for the staff surfaces

The 18 manager, super-admin and peer-partner routes now load through
`lazy: { Component: lazyPage(...) }`; the 15 doctor-facing routes, the crisis trio,
`ManagerShell` and `FallbackPage` stay eager on purpose. Entry chunk 793,015 → 621,140 bytes
(230,748 → 185,680 gzip). The rule and its four constraints live in
`react-performance.md` § Code splitting. This closes
`2026-07-07-pwa-architecture.md:89`'s per-page code-splitting requirement for the panel.

Two corrections to what this entry originally claimed, recorded because both were repeated
into `react-performance.md` and would have made any design quoting them look unresearched:

- **There is no chart library.** `apps/web/package.json` has no charting dependency; the
  dashboard's trend visuals are hand-rolled TypeScript (`toTrendBarHeights` / `toTrendBars`
  from `@zelo/domain`, ~1.8 KB). The heaviest dependency, `jspdf`, was already dynamically
  imported before this work. The payload a doctor over-downloaded was the staff page modules
  and their component graph, not a third-party chart bundle.
- **The count was wrong.** It read "20 of 34 route components are manager/admin/peer-only."
  It is 18 staff pages plus `ManagerShell`, against 34 page *modules* — `FallbackPage.tsx`
  exports two components, so modules and components are not the same count.

**What is still open**, and why this is not fully closed: the entry chunk remains 621 kB, over
Rollup's 500 kB warning, with ~63% of it shared vendor (`react-router` ~88 KB, `zod`, `socket.io`).
Getting under 500 kB needs vendor splitting, which carries its own request-waterfall risk and
deserves its own brief. And the doctor's *total* bytes are unchanged: workbox's `globPatterns`
precaches every new chunk (41 → 83 entries, ~2.2 MiB either way), so the win is first-paint
critical path and parse/exec, not total download. Narrowing the precache is a separate product
call — it trades a manager's offline access for a doctor's mobile data.

- **Effort:** medium
- **Kind:** performance
- **Files:** `apps/web/src/app/router.tsx`, `apps/web/src/app/lazy-route.ts`,
  `apps/web/src/app/router.test.tsx`, `apps/web/vite.config.ts` (precache, still open),
  `docs/superpowers/specs/2026-07-07-pwa-architecture.md:89`

## 15. Admin and peer-partner panels lack a layout route with a session-expiry guard

- **Why:** `useManagerSessionExpiry` is imported in exactly one place. The admin panel is a lone
  guarded route and the peer-partner panel repeats its guard on two routes, redoes chrome per
  page, and duplicates logout inside `PeerPartnerBottomNav`. An admin or peer-partner token
  expiring mid-session leaves a dead screen with a retry that can never succeed — the precise
  failure `ManagerShell.tsx:19-22` documents as the reason the manager watcher was lifted into a
  shell in the first place. That fix regressed for the other two panels; this is the same
  refactor that already paid off once.
- **Effort:** medium
- **Kind:** product-gap
- **Files:** `apps/web/src/presentation/layout/ManagerShell.tsx`,
  `apps/web/src/presentation/hooks/useManagerSessionExpiry.ts`, `apps/web/src/app/router.tsx`

## 16. Signal pipeline fire-and-forget calls fail silently

- **Why:** Five call sites (`useSubmitAssessment`, `useFollowUpAnswer` twice, `ChatComposer`,
  `ScaleAssessmentPage`) all swallow with `.catch(() => {})` — no counter, no dev warning, no
  breadcrumb. These calls are the sole source of the manager dashboard's check-in, abandonment,
  unsent-draft and follow-up numbers; if the endpoint, CORS origin, or link snapshot breaks,
  every doctor's device fails silently and the dashboard simply reads low — indistinguishable
  from a quiet week, on data used for psychosocial risk management. When fixing, note the five
  sites are not identical: three guard with `if (link)` and two rely on
  `RecordFollowUpUseCase`'s internal null check, so don't unify them by deleting one side of
  that distinction. Add at least a `console.warn` behind `import.meta.env.DEV`.
- **Effort:** small
- **Kind:** product-gap
- **Files:** `apps/web/src/presentation/hooks/useSubmitAssessment.ts`,
  `apps/web/src/presentation/hooks/useFollowUpAnswer.ts`,
  `apps/web/src/presentation/pages/ChatPage/ChatComposer.tsx`,
  `apps/web/src/presentation/pages/ScaleAssessmentPage.tsx`,
  `apps/api/src/modules/signal-checkin/application/use-cases/record-follow-up.use-case.ts`

## 17. `ChatController.stream` turns every exception into a silent 200

- **Why:** Every exception becomes `{"error":"ai_unavailable"}` inside a 200 response, with no
  rethrow and no logging. This is the one route where the repo's own convention — rethrow the
  unknown case so genuine bugs stay 500s — is inverted, on the route that carries the product's
  core interaction. A regression in the tone guard or prompt assembly presents to a doctor as an
  AI outage and to operators as total silence: there is no `APP_FILTER`, no interceptor and no
  request logging anywhere to catch it downstream. Distinguish "already streaming" (write the
  frame, but log the error) from "nothing sent yet" (rethrow).
- **Effort:** small
- **Kind:** technical-debt
- **Files:** `apps/api/src/modules/chat/infrastructure/chat.controller.ts`

## 18. Login endpoints lack per-route throttling; weak password floor

- **Why:** Login carries only the global 100 req/60s budget — the same as a dashboard read —
  against an 8-character password minimum with no complexity rule, no lockout, no attempt
  counter, and a SuperAdmin password never validated by any zod schema. Each login attempt
  deliberately runs a full scrypt derivation for timing safety, so 100 guesses/minute/IP is
  simultaneously a practical brute-force budget and 100 scrypt derivations/minute/IP of CPU on a
  single Fly machine — `app.module.ts`'s own comment names this route as the CPU-flood concern
  and stops at the global cap. Add a per-route `@Throttle` to the three login endpoints,
  matching the 5/900_000ms already used on the two forgot-password routes, using the nested v6
  `@Throttle({ default: { ... } })` shape (the flat form silently applies nothing).
- **Effort:** small
- **Kind:** security
- **Files:** `apps/api/src/app.module.ts`,
  `apps/api/src/modules/manager/infrastructure/manager.controller.ts`,
  `apps/api/src/modules/admin/infrastructure/admin.controller.ts`,
  `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`

## 19. Revoking consent clears only 1 of 12 device storage keys

- **Why:** `RevokeConsentSection` calls only `revoke()`, which sets `{ hasConsented: false,
  consentedAt: null }`. Revoking leaves `zelo.institution-link` on the device — including
  `deviceSignalId`, the identifier the whole signal pipeline dedupes on — plus `zelo.followup`
  (a partially-answered PHQ-9 including the self-harm item) and a stored score with its
  `riskSignal` flag. `aggregateOptIn` stays true, so re-consenting silently resumes the same
  device identity. Whether or not that's intended, no file states it and no test asserts it.
  Introduce a single exported `clearDeviceData()` enumerating every `zelo.*` key — the 8
  persisted stores plus 4 hand-rolled helpers (`zelo.assessment-draft`, `zelo.last-result`,
  `zelo.theme`, `zelo.sidebar-collapsed`).
- **Effort:** medium
- **Kind:** product-gap
- **Files:** `apps/web/src/presentation/pages/YouPage/RevokeConsentSection.tsx`

## 20. Large parts of the repo are never typechecked

- **Why:** `apps/api` and `packages/domain` exclude `src/**/*.test.ts` from `tsconfig.json`
  (84 files), and every `.ts` file outside `src/` is outside every include:
  `prisma.config.ts`, `apps/api/prisma/seed.ts`, `apps/api/prisma/create-super-admin.ts`,
  `apps/api/prisma/seed-data.ts`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`,
  `apps/web/vitest.environment.ts`, `apps/web/capacitor.config.ts`. The file that chooses which
  database migrations hit (`prisma.config.ts`) and the two scripts most capable of destroying
  data are the least-checked files in the repo — a typo compiles nowhere and fails only at
  runtime against a live database. It's also how live import-extension violations survive: they
  sit in test files `tsc` never opens, and the same two lines in a compiled file crash `node
  dist/src/main.js` at boot. `apps/web/vitest.environment.ts`, which makes every
  `RouterProvider` test possible, is neither linted nor typechecked.
- **Effort:** medium
- **Kind:** tooling-gap
- **Files:** `apps/api/tsconfig.json`, `packages/domain/tsconfig.json`,
  `apps/api/prisma.config.ts`, `apps/api/prisma/seed.ts`,
  `apps/api/prisma/create-super-admin.ts`, `apps/api/prisma/seed-data.ts`,
  `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/vitest.environment.ts`,
  `apps/web/capacitor.config.ts`

## 21. Triplicated password/token/timing-safe-equal crypto across three roles

- **Why:** `AdminPasswordService`, `ManagerPasswordService` and `PeerPartnerPasswordService` are
  byte-identical apart from the class name; the three `*TokenService` classes are ~85%
  identical; `timing-safe-equal.ts` is copied three times, and the copies have already drifted —
  the manager copy carries a rationale comment the other two lost, and it now misdescribes the
  threat model ("a single shared demo credential" no longer exists). A security fix to the
  password or token scheme has to land three times, and it's easy to miss one — exactly the
  failure mode these primitives exist to prevent. Related and cheap: the three `*TokenService`
  classes read their HMAC secret lazily inside a private `sign()` rather than in the
  constructor, so a staging deploy boots happily on a 4-character token secret (the 32-char
  refine only gates on `NODE_ENV === "production"`).
- **Effort:** medium
- **Kind:** technical-debt
- **Files:** `apps/api/src/modules/admin/application/services/admin-password.service.ts`,
  `apps/api/src/modules/manager/application/services/manager-password.service.ts`,
  `apps/api/src/modules/peer-partner/application/services/peer-partner-password.service.ts`,
  `apps/api/src/modules/admin/application/services/admin-token.service.ts`,
  `apps/api/src/modules/manager/application/services/manager-token.service.ts`,
  `apps/api/src/modules/peer-partner/application/services/peer-partner-token.service.ts`,
  `apps/api/src/modules/admin/application/services/timing-safe-equal.ts`,
  `apps/api/src/modules/manager/application/services/timing-safe-equal.ts`,
  `apps/api/src/modules/peer-partner/application/services/timing-safe-equal.ts`

## 22. No schema-drift guard or `AppModule` boot test in the deploy pipeline

- **Why:** The prod deploy job runs `flyctl` plus a `/health` curl that never touches the
  database (migrations are deliberately manual), and nothing ever instantiates `AppModule` —
  `peer-chat.module.test.ts` is the sole `*.module.test.ts` among 11 modules.
  `apps/api/prisma/README.md` documents that this already caused a Manager-login outage: a merge
  whose migration wasn't applied by hand deploys green and then 500s on every route touching the
  new table. Separately, a DI wiring mistake (a use-case added to a controller but not to
  providers) passes CI — controller tests supply their own providers — and first appears as a
  Nest resolution error at process start, caught only by that same post-deploy curl, i.e. after
  the Fly deploy has already been attempted.
- **Effort:** medium
- **Kind:** tooling-gap
- **Files:** `.github/workflows/api.yml`, `apps/api/prisma/README.md`,
  `apps/api/src/modules/peer-chat/peer-chat.module.test.ts`

## 23. `hospital` → `institution` terminology drift (known to the maintainer)

The design spec calls this out for honest, non-inflated placement, so the fuller framing is
kept here rather than compressed to one line.

Split honestly into four classes of very different cost; only the cheap two (a, b) are proposed
now:

a. Write the actual rule down — the organisation is an `institution`; the **role** is a
   `hospital admin`. `HOSPITAL_ADMIN` (the `ManagerRole` enum value) and the `HospitalAdmin*`
   identifier family are correct and must not be "fixed".
b. Fix `AdminInstitutionsPage`, whose heading, caption, empty state and toasts say "instituição"
   while its own form labels three lines below say "Nome do hospital" and its zod messages say
   "Informe o nome do hospital."

Deferred (c, d), because they're genuinely more expensive and buy little now:

c. The `hospitalAdmin*` wire fields (`hospitalAdminName`/`Email`/`Names`, 145 occurrences across
   10 files) need a coordinated api+web deploy.
d. The `ManagerRole` enum rename needs a hand-written `ALTER TYPE ... RENAME VALUE` — `prisma
   migrate dev` generates a drop-and-recreate against a NOT NULL column — and it logs out every
   live manager.

Ranked low because nothing is broken and the expensive slices buy nothing. Ranked at all because
an earlier read of this had the direction backwards: it concluded the codebase is ~30:2 in
favour of "hospital" and said to standardize on it, when the super-admin surface has already
standardised on "instituição" — 19 non-test hits, 15 of them user-visible copy inside
`AdminInstitutionsPage.tsx` alone, plus a `plural()` helper that exists solely to pluralise
"instituição". The real convention is audience-scoped, not global: super-admin screens say
"instituição"; médico and manager screens say "hospital". Left unwritten, the next agent picks
whichever word it read last — which is exactly how this drift was produced.

- **Effort:** medium
- **Kind:** inconsistency
- **Files:** `apps/api/prisma/schema.prisma` (`ManagerRole` enum),
  `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`,
  `apps/web/src/presentation/ui/DataTable/plural.ts`,
  `apps/web/src/ports/admin-institution.port.ts`, `apps/web/src/ports/manager-admin.port.ts`

## 24. Formatter (Prettier) is configured but never enforced

- **Why:** `packages/config/prettier.base.mjs` sets `singleQuote: true` and `.vscode` enables
  format-on-save, but no package has a `format` script, there's no git hook, and no CI check.
  `apps/api` is de-facto double-quoted; `apps/web` is split roughly 60/40, with disagreeing
  siblings in the same folder (`DataTable.tsx` single-quoted vs. `DataTableError.tsx`
  double-quoted). Whether a file gets rewritten depends on whether its author had the extension
  installed, so an agent has no signal and matches whatever file it happened to read last — a
  permanent, self-renewing source of exactly the inconsistency this whole effort exists to fix.
  Either wire Prettier into CI and take the one-time ~40% sweep as its own commit, or flip
  `singleQuote` to `false` to match the majority and the API. Both are cheap; the cost is
  entirely in leaving it undecided.
- **Effort:** small
- **Kind:** inconsistency
- **Files:** `packages/config/prettier.base.mjs`,
  `apps/web/src/presentation/ui/DataTable/DataTable.tsx`,
  `apps/web/src/presentation/ui/DataTable/DataTableError.tsx`

## 25. Two operational docs and one build script misdirect deploys

- **Why:** `docs/android-apk.md` instructs `fly secrets set
  CORS_ALLOWED_ORIGINS="https://zelo-dusky.vercel.app,https://localhost"` — a full replacement
  of the live origin list; following it verbatim CORS-blocks the live web app and the peer-chat
  websocket, and Fly secrets are write-only, so the previous value can't be read back to
  recover. Separately, `apps/web/package.json`'s `build:native` script hardcodes
  `VITE_API_BASE_URL=https://zelo-api.fly.dev` with no environment branch, so an APK built from
  `develop` still writes to the production API — every test APK handed out writes real check-ins
  and links real devices against production regardless of branch, and a separate dev API
  (`zelo-api-dev`) exists that the native build can never reach. Neither the script, the docs
  table, nor `capacitor.config.ts` flags this; the operator has to notice the literal URL.
- **Effort:** small
- **Kind:** security
- **Files:** `docs/android-apk.md`, `apps/web/package.json` (`build:native` script),
  `apps/web/capacitor.config.ts`

## 26. Small silent-failure cluster (six one-to-three-line fixes)

- **Why:** Grouped because each is individually below the threshold for its own slot, but they
  share a shape — a user-visible failure that produces no error anywhere:
  - `retry: false` is set on only 4 of 11 token-gated query hooks, so an expired token produces
    ~7s of doomed retries before logout on three admin tables.
  - `useManagerNotifications`' rollback-only `onError` suppresses the global failure toast, so
    marking a notification read against a dead API visibly un-reads the row with no message.
  - Its `invalidateBoth` closure captures `token` and invalidates exact keys, silently matching
    nothing across a re-login, unlike the 13 write hooks that use bare prefixes.
  - `ManagerInsightHistoryPage` filters with raw `toLowerCase().includes()` instead of
    `useDebouncedSearch`, so "analise" finds nothing in "análise".
  - The two finish-setup `token` fields are uncapped `z.string().min(1)` on unauthenticated
    credential-setting routes, while every sibling identity string is capped at 200.
  - Email is never normalized anywhere — three case-sensitive `findUnique` lookups and zero
    `toLowerCase()` — so `Ana@x` and `ana@x` are two accounts, and the mismatch is
    undiagnosable because both login and forgot-password refuse to disclose account existence.

  The email case is the nastiest: two individually correct decisions (a unique constraint, a
  no-disclosure auth policy) combine into a support black hole where the user sees a generic 401
  and the operator sees nothing.
- **Effort:** small
- **Kind:** product-gap
- **Files:** `apps/web/src/presentation/hooks/useManagerNotifications.ts`,
  `apps/web/src/presentation/pages/ManagerInsightHistoryPage.tsx`,
  `apps/web/src/presentation/hooks/useDebouncedSearch.ts`

---

## TD-003 (not separately ranked above)

`technical-debt.md`'s TD-003 — `followUpResponseRate` in `GET /manager/signals` is not
institution-scoped (`apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`,
`computeFollowUpResponseRate()`) — is not one of the 26 ranked items above; it's accepted and
deferred on its own terms in `technical-debt.md`, safe today because the underlying
`SimulatedFollowUp` rows are fabricated demo data with no real institutional attribution to
leak. Revisit trigger and full reasoning: `technical-debt.md`'s TD-003 entry.
