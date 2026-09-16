# Testing — Vitest conventions across the monorepo

Three Vitest configs (`apps/api`, `apps/web`, `packages/domain`), 276 test files, no other
test runner. `globals` is off everywhere: import `describe`/`it`/`expect`/`vi`/hooks
explicitly from `"vitest"` — never rely on auto-globals. There is no Playwright, Cypress, or
`@vitest/coverage-*` dependency anywhere in the repo; nothing measures coverage and nothing
runs a browser.

## 1. The passthrough exemption — stated precisely

**Do not write a unit test for a `prisma-*.repository.ts` or for an `http-*.adapter.ts` that
is a one-line passthrough** — cover them through the controller's supertest integration test
(backend) or the page test (frontend) instead.

**Use-cases are never exempt, however thin.** This is the one place an earlier draft of this
convention got backwards, so it is worth stating flatly: a use-case gets a unit test against
fakes even when its whole body is `return this.port.x(...)`.

The documented source of the exemption, re-read fresh at the cited lines:

- `general-documentations/architecture-reference.md:263` — the layer table's own row: `` `use-
  cases/` | Orchestration classes, constructor-injected with ports, unit-tested against fakes.
  ``
- `general-documentations/architecture-reference.md:511-513` — the "Adding a new frontend
  flow" recipe, step 2: `` `Http*Adapter` in `infrastructure/http/`, use-case in `use-cases/`,
  both unit-tested (adapter usually isn't — thin passthroughs follow the same untested-by-
  convention rule as backend Prisma repositories). ``

Both lines name the adapter/repository as the untested-by-convention side and the use-case as
unit-tested. Read literally, "adapter usually isn't" is descriptive of current coverage, not a
second exemption class for use-cases.

**The gap this produces is real and is tracked separately, not folded into the exemption.**
29 of 47 `apps/web/src/use-cases/*.ts` files have a matching `.test.ts` (re-counted fresh: `ls
apps/web/src/use-cases/*.ts | grep -v test | wc -l` → 47; `ls apps/web/src/use-cases/*.test.ts
| wc -l` → 29). The 18 untested ones are ordinary create/update/delete/list use-cases for
managers, sectors, peer partners and institutions — structurally identical to tested siblings
like `LoginManagerUseCase` and `CreateSectorUseCase`, not a distinguishable "passthrough"
category. If you're adding a use-case and reach for "it's thin, skip the test" as a reason,
that reasoning does not hold — write the test. The ambiguity itself is `priorities.md` #20's
neighbor concern in spirit but not its subject; the untested-use-case gap has no numbered
`priorities.md` entry of its own — it's recorded here and in
`docs/superpowers/specs/2026-09-15-ai-conventions-documentation-design.md` §6's "Use-cases get
a unit test against fakes however thin" line.

The same exemption, and the same non-exemption, apply on the backend: 10 of 11
`prisma-*.repository.ts` files have no test (the exception, `prisma-sector.repository.ts`, has
branching invite-code/conflict logic and is the only API test allowed to touch a real
database — see §4), and every `*.use-case.test.ts` under `apps/api/src` exists.

**Mirror files:** `apps/api/src/modules/institution/infrastructure/institution.controller.ts`
+ its `.controller.test.ts` for the "cover the repository through the controller" side;
`apps/web/src/use-cases/create-sector.usecase.ts` + `.test.ts` (or any tested use-case under
`apps/web/src/use-cases/`) for "test the use-case anyway."

## 2. Port doubles vs. spies vs. `vi.mock`

Three different tools, used for three different things — not one "no mocking library" rule.

**Port doubles — hand-written `class FakeX implements X`.** This is the default for testing a
use-case against its ports: every unexercised method `throw new Error("not used in this
test")`, so a port gaining a new method fails loudly in the fake instead of silently returning
`undefined`. Re-counted fresh: 122 `class Fake*` declarations across `apps/api/src` and
`apps/web/src` test files, 110 of them `implements` the port interface directly, 211
`throw new Error("not used in this test")` occurrences across 35 files.

**5 known exceptions cast an object literal to the port type instead of implementing it** —
all 5 in `apps/api`, none in `apps/web` (re-verified: `delete-manager.use-case.test.ts`,
`delete-peer-partner.use-case.test.ts`, `delete-sector.use-case.test.ts` all use `as unknown as
<PortName>`; `sweep-notification-retention.use-case.test.ts` uses `as never`;
`get-sector-by-invite-code.use-case.test.ts` uses `{ findByInviteCode:
vi.fn().mockResolvedValue(row) } as unknown as SectorRepository`). **Don't treat these as
bugs** — each only touches 2-3 methods of a wide port, and the cast is a legitimate shortcut
for that. **Do prefer the class form for anything new**: the cast is what lets a new port
method go unnoticed by the test that should have caught it.

**`vi.fn()` as a spy for call assertions on a non-port collaborator is separately fine, and
more common than the cast shortcut above.** Re-verified fresh: `grep -rn "vi\.fn()"
apps/api/src apps/web/src --include=*.test.ts | grep -v "as unknown as\|as never"` surfaces
this shape repeatedly — `apps/api/src/modules/manager/infrastructure/manager-admin.controller.
test.ts:275` (`forceDisconnect = vi.fn();`, a gateway method assertion, not a port), and
`apps/web/src/presentation/ui/DataTable/useBulkDelete.test.ts` (a callback passed into the
hook under test, asserted via `toHaveBeenCalled`). `apps/api/src/modules/peer-chat/
infrastructure/peer-chat.gateway.test.ts:45-46` (`emit: vi.fn(), disconnect: vi.fn()`) is the
same pattern on a hand-rolled fake socket object, not a port. `docs/conventions/backend-
modules.md`'s own "Test doubles" section counts this shape at 7 files repo-wide — re-grep
before citing that number elsewhere, since it moves as files are added.

**`vi.mock` is reserved for third-party SDK boundaries.** Re-verified fresh —
`grep -rn "vi\.mock(" apps/api/src apps/web/src --include=*.test.ts` returns exactly 12 call
sites: `groq-sdk` (×2, `chat/infrastructure/ai-providers/groq.adapter.test.ts` and
`manager/infrastructure/ai-providers/groq-insight.adapter.test.ts`) and `resend`
(`shared/email/resend-email.adapter.test.ts`) in `apps/api`; `jspdf` (×2), `qr-scanner` (×2),
`qrcode`, `socket.io-client` (×2) in `apps/web`, plus two application-module mocks
(`./ChatEmptyState`, `@/presentation/lib/has-camera`) that are the only exceptions to "third-
party only." **Do not `vi.mock()` an application module (a use-case, a port, `@/app/container`)
to replace a dependency** — in web page/component/hook tests, stub behavior with
`vi.spyOn(container.someUseCase, "execute")` after `import * as container from "@/app/
container"` instead (see `docs/conventions/frontend-architecture.md` for the container shape
this spies on). That's a distinct mechanism from the port-double pattern above: it stubs a
use-case's `execute` method for a test one layer up (a page or hook), not a port for a use-
case's own test.

**Mirror files:** `apps/api/src/modules/manager/application/use-cases/create-manager.use-
case.test.ts` for the port-double default; `apps/api/src/modules/sector/application/use-cases/
get-sector-by-invite-code.use-case.test.ts` for a sanctioned cast exception;
`apps/api/src/shared/email/resend-email.adapter.test.ts` for a sanctioned `vi.mock`;
`apps/web/src/presentation/pages/AdminLoginPage.test.tsx` for the container-spy pattern.

## 3. `describe` naming — the permissive version

Name the top-level `describe` after the exported symbol as it's spelled in code, with real
variation depending on what kind of symbol it is:

- **PascalCase for classes and components** — `CreateManagerUseCase`,
  `ManagerAdminManagersPage`.
- **camelCase for plain functions** — re-verified fresh:
  `describe("bandFor", ...)` and `describe("bandForSeverityFraction", ...)` in
  `apps/web/src/presentation/lib/band-for.test.ts:4,42`.
- **SCREAMING_SNAKE for constants** — re-verified fresh:
  `describe("NAV_TABS", ...)` (`apps/web/src/presentation/layout/nav-tabs.test.ts:5`),
  `describe("PEER_PARTNER_NAV_ITEM", ...)` (same file, line 33), `describe("PEER_PARTNER_NAV",
  ...)` (`apps/web/src/presentation/layout/peer-partner-nav.test.ts:6`).
- **A trailing scope clause is common and welcome**, not a deviation — re-verified fresh:
  `describe("HttpSignalCheckinAdapter abandon", ...)`, `"HttpSignalCheckinAdapter chatDraft"`,
  `"HttpSignalCheckinAdapter followUp"` (`apps/web/src/infrastructure/http/http-signal-
  checkin.adapter.test.ts:8,35,62`).
- **A file may have several sibling top-level describes** — re-verified fresh:
  `apps/web/src/app/router.test.tsx` has four: `"onboarding router flow"` (:37), `"consent
  gate"` (:284), `"last-resort screens"` (:309), `"manager route tree"` (:324) — the first and
  last of those four are also examples of the next point.
- **Lowercase prose is fine for cross-cutting / topic files** that have no single matching
  source symbol — re-verified fresh: `describe("ui primitives", ...)`
  (`apps/web/src/presentation/ui/primitives.test.tsx:53`), `describe("automated accessibility
  pass (axe-core)", ...)` (`apps/web/src/presentation/pages/a11y.test.tsx:102`).
- **API controllers use `"<METHOD> /<path>"` or `"<name> controller"`** — `GET /health`, `POST
  /chat/stream`, `manager admin controller — sectors`, etc.

**What this rule is not:** it is not "match the exported spelling exactly, always." An earlier
draft of this convention said exactly that and it's wrong — it would flag every one of the
examples above (a camelCase function name, a SCREAMING_SNAKE constant name, a trailing scope
clause, a lowercase-prose topic file) as a violation, when all of them are the normal, current
shape of this suite.

**Mirror file:** `apps/web/src/app/router.test.tsx` for sibling describes and a trailing scope
clause on the tree-invariant block; `apps/web/src/presentation/pages/a11y.test.tsx` for
lowercase topic prose.

## 4. CI gates — what runs, and what doesn't

`.github/workflows/web.yml` and `.github/workflows/api.yml`, re-read end to end. Both are
path-filtered (an `apps/web`-only change never triggers `api.yml` and vice versa; both trigger
on `packages/domain/**` and `packages/config/**` changes, so a shared-package edit runs both
suites).

**`web.yml`** — one job, `web-test`, four steps run with `--filter=@zelo/web...`: `Lint
boundaries` (`lint:boundaries`), `Lint` (`lint`), `Test` (`test`), `Build` (`build`). No deploy
job — `apps/web/vercel.json`'s `buildCommand` runs `pnpm turbo run build` only, independently
of this workflow, so a red web CI run does not block the Vercel deploy.

**`api.yml`** — `api-test` runs the same four tasks against a real `postgres:16-alpine`
service container, with `prisma generate` and `prisma migrate deploy` as explicit steps before
`Test`. Two deploy jobs follow, both gated `needs: api-test`: `deploy` (main → `fly.toml`,
then a `/health` curl) and `deploy-dev` (develop → `fly.dev.toml`).

**`build` is the typecheck — there is no separate typecheck job.** `apps/web`'s `build` script
is `tsc -p tsconfig.json --noEmit && vite build`; `apps/api`'s is `tsc -p tsconfig.json &&
tsc-alias -p tsconfig.json`. A green `build` step means the type-checked surface passed, but
that surface is smaller than "the whole app" — see the next paragraph.

**What neither workflow gates:**

- **No formatter.** `packages/config/prettier.base.mjs` sets `singleQuote: true`, but no
  package has a `format` script and neither workflow runs `prettier --check`. Don't reformat
  an existing test file to "fix" its quotes — apps/api and packages/domain are de-facto
  double-quoted throughout; apps/web is genuinely mixed. For a new apps/web test file, match
  the sibling files in the directory you're adding to.
- **`apps/api` and `packages/domain` test files are excluded from `tsc` entirely** —
  `tsconfig.json`'s `exclude` is `["src/**/*.test.ts"]` in both packages, so `build`'s
  typecheck never opens a test file in either package. `apps/web` has no such exclusion — all
  192 of its test files are type-checked as part of `build`. This is `priorities.md` #20
  ("Large parts of the repo are never typechecked") — re-confirmed accurate against the current
  file at the time of writing: the entry still names both `tsconfig.json` exclusions plus the
  untyped `apps/web/vitest.environment.ts`/`vitest.config.ts` pair.
- **No coverage.** No `@vitest/coverage-*` dependency, no `coverage` block in any of the three
  vitest configs, no coverage step in either workflow.
- **`@zelo/config` has no `test` script**, so `turbo run test` reports success for it
  unconditionally even though it owns the eslint/prettier/tsconfig/dependency-cruiser bases
  every other package builds on.

**Mirror files:** `.github/workflows/web.yml`, `.github/workflows/api.yml` — read them
directly rather than trusting a summary; they're short.

## 5. Traps

- **The `restoreMocks` gap.** None of the three vitest configs sets `restoreMocks` (re-
  verified fresh: `grep -n restoreMocks apps/api/vitest.config.ts apps/web/vitest.config.ts
  packages/domain/vitest.config.ts` → no matches), so a `vi.spyOn` installed inside a single
  `it` rather than a `beforeEach` can leak into later tests in the same file and produce a
  false green. See `priorities.md` #3 for the fix and the current count (24 of 54 files).
- **`apps/api` relative imports take `.ts`; `@/`-aliased imports take `.js`** — inverted from
  what looks natural, because `rewriteRelativeImportExtensions` rewrites the former on emit
  while `tsc-alias` expects the latter already resolved. Getting it backwards breaks `pnpm
  build`, and because API test files are excluded from `tsc` (§4), nothing local will catch it
  — `prisma-sector.repository.test.ts` is the one file in the repo that has it backwards today.
- **`apps/web/vitest.config.ts` sets a custom `environment`, not `jsdom`.** `environment:
  "./vitest.environment.ts"` captures Node's real `AbortController`/`AbortSignal` before
  jsdom's setup overwrites them and restores them after — react-router's data router needs the
  real one. Don't "simplify" this back to `environment: "jsdom"`; a `RouterProvider`-mounting
  test would start failing with `TypeError: RequestInit: Expected signal ... to be an instance
  of AbortSignal`, and the cause is this file, not the app.
- **Don't stub `window.matchMedia`, `HTMLDialogElement.prototype.showModal/close`, or re-
  register `toHaveNoViolations`** inside a test file — `apps/web/vitest.setup.ts` already does
  all three, plus `afterEach(() => { cleanup(); useChatConversationStore.getState().clear();
  })`. Only `InstallAppRow.test.tsx` and `useInstallPrompt.test.ts` re-stub `matchMedia`,
  deliberately, for a per-test media-query result.
- **Only two API tests may construct a real `PrismaService`**: `prisma.service.test.ts` and
  `prisma-sector.repository.test.ts` — the latter deletes its own rows in `afterEach`. A third
  such test extends a dependency (a live Postgres service container) the other 75 API tests
  are designed to avoid.
- **Don't add `__tests__/`, `tests/`, `*.spec.ts`, snapshot assertions, or `.skip`/`.only`/
  `.todo`.** All three vitest configs glob only `src/**/*.test.ts(x)` (`apps/api` also globs
  `prisma/**/*.test.ts`), so a test placed elsewhere silently never runs; there are zero
  snapshot files and zero skip/only/todo in the current suite.
- **`fireEvent` is not banned, just scoped.** `userEvent.setup()` is the default for pointer
  and typing interaction, but three uses of `fireEvent` are deliberate and settled:
  `fireEvent.keyDown(document, { key })` for a global hotkey (the listener binds to
  `document`, which `userEvent`'s focused-element dispatch can't reach), `fireEvent.change` on
  a controlled input when the assertion targets the change handler rather than the typing
  sequence, and `fireEvent.scroll`/`wheel`/`focus`/`error` for events `userEvent` has no
  equivalent for.

## How to verify

There is no single command that proves this whole document — it spans three configs and two
apps. Useful individual checks:

```bash
# globals really are off, and test placement really is enforced
grep -n "globals" apps/api/vitest.config.ts apps/web/vitest.config.ts packages/domain/vitest.config.ts

# restoreMocks gap (should currently be empty in all three)
grep -n "restoreMocks" apps/api/vitest.config.ts apps/web/vitest.config.ts packages/domain/vitest.config.ts

# vi.mock call sites — should stay confined to third-party SDKs (plus the 2 named exceptions)
grep -rn "vi\.mock(" apps/api/src apps/web/src --include=*.test.ts

# web use-case test coverage — re-run before citing the 29/47 figure elsewhere
ls apps/web/src/use-cases/*.ts | grep -v test | wc -l
ls apps/web/src/use-cases/*.test.ts | wc -l

# what CI actually runs
cat .github/workflows/web.yml .github/workflows/api.yml
```

A green `build` step in CI means the typed surface passed `tsc --noEmit` (web) or `tsc &&
tsc-alias` (api) — it does not mean every test file was typechecked (§4), and it does not mean
coverage moved at all, because none is measured.
