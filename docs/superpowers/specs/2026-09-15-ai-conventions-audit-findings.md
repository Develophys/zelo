# AI conventions audit — distilled findings (2026-09-15)

This is the evidence trail behind [`docs/conventions/`](../../conventions/README.md) and
[`CLAUDE.md`](../../../CLAUDE.md). Every rule in those playbooks came out of a read-only audit of
this repo run on 2026-09-15: nineteen subagents across nine domains, each domain run twice — an
extraction pass that proposed rules from the code, then an adversarial pass that re-opened every
cited file and tried to refute them, followed by a completeness critic over the whole map.
**197 candidate rules → 107 confirmed, 92 corrected, 11 refuted**, plus 56 rules the first pass
missed entirely and nine cross-domain contradictions resolved against the code. The full
methodology writeup, and the argument for why the ratio justifies the exercise, is in
[`2026-09-15-ai-conventions-documentation-design.md`](./2026-09-15-ai-conventions-documentation-design.md)
§2; this file is the companion that §2 and §4 promise — the per-rule evidence, kept here so the
design spec doesn't have to carry it.

**What's in scope.** Confirmed and corrected rules only. The 11 refuted rules are deliberately
absent: they were wrong, nothing in the playbooks rests on them, and listing them would only give
a future reader plausible-sounding text to cite by mistake. Two of them are described in §10 below
where the adversarial pass's resolution is itself the lesson.

**How to use this file.** If you're asking "why does playbook X say Y," find the domain section,
find the rule, and read whether it was confirmed as first stated or corrected — and if corrected,
what specifically was wrong with the original phrasing. A **mirror file** is the file the audit
named as showing what compliance looks like; it is the fastest way to re-check a rule against
today's code. Counts and line numbers below are as of 2026-09-15 and are *not* maintained — see
§11.

---

## 1. `backend-modules` — NestJS module structure and Clean Architecture on the API

20 candidate rules: 6 confirmed, 13 corrected, 1 refuted. Feeds
[`backend-modules.md`](../../conventions/backend-modules.md).

### Confirmed as first stated

- **Relative import specifiers end `.ts`; `@/`-aliased ones end `.js`.** 481 relative `.ts` / 0
  relative `.js`; 190 alias `.js` / 2 alias `.ts` (both in a test file, which `tsc` excludes).
  Mirror: `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.ts`.
- **Every constructor parameter carries `@Inject(...)`, including plain class providers.** A
  brace-matching parse of all non-test `.ts` in `src` found 148 constructor parameters, 0 without
  it — gateways, guards, schedulers and use-case-injecting-use-case included.
  Mirror: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`.
- **Expected failures are `export class SomethingError extends Error {}`, never a Nest
  `HttpException` from `application/`.** 21 such classes (the extraction pass said 22), placed in
  the throwing use-case file, in the port file when a repository throws, or in a shared
  `<area>-errors.ts` when several use-cases share them.
  Mirror: `apps/api/src/modules/manager/application/use-cases/manager-admin-errors.ts`.
- **Adapter selection is a module-scope `process.env.X === "..." ? Fake : Real` constant, not
  `useFactory` + `inject: [ConfigService]`.** Three identical sites with their rationale comments
  (`chat.module.ts`, `manager.module.ts`, `shared/email/email.module.ts`); `grep useFactory` over
  `src` returns zero hits anywhere, tests included.
  Mirror: `apps/api/src/shared/email/email.module.ts`.
- **`src/shared/` holds only what two or more modules need.** It contains exactly `config/`,
  `date/`, `email/`, `prisma/`, `tokens/` — each genuinely multi-consumer (e.g.
  `hash-set-password-token` imported by 7 use-cases across 4 modules).
- **No barrel `index.ts` anywhere under `apps/api/src`.** `find src -name index.ts` returns nothing
  across 209 `.ts` files; every import names a concrete file.

### Corrected before use

- **Module layout.** Only `application/` and `infrastructure/` are mandatory, plus
  `<name>.module.ts` at the root. `ports/`/`use-cases/` appear when the feature has either (10 of
  11 modules; `peer-chat` has neither); `services/` holds stateless module-owned helpers.
- **Port declaration.** Same rule, two facts added: the DI token goes at the *bottom* of the port
  file, after the interfaces, and any error classes the port's implementations throw follow it.
  15 ports live at `application/ports/`; the 16th, `EMAIL_PORT`, is shared infrastructure at
  `src/shared/email/email.port.ts`.
- **Token binding.** `{ provide: TOKEN, useClass: X }` — *except* when the implementation is
  already a provider in the same module, where it is `useExisting` so both names resolve to one
  instance. A module's `exports` carries tokens *and* plain classes.
- **One class per file.** Two exceptions: a use-case implementing a port method takes that
  method's name instead of `execute`; closely-related reads/writes on one aggregate may add a
  second public method rather than a second file.
- **Input objects.** The object-shaped `execute(input: XInput)` majority is real (18 vs 8
  positional), but a time-dependent use-case takes an injected clock as a *second, defaulted*
  parameter — `execute(input, now: Date = new Date())` — never folded into the input object.
- **Controller validation.** Same mechanism, two conditions: the schema is controller-local only
  when the shape is API-local (a shape shared with the web app is imported from `@zelo/domain`);
  and the rule covers `@Body()` only — `@Query()`/`@Param()` are hand-parsed.
- **Error mapping.** Applies to JSON handlers. A *streaming* handler cannot rethrow after headers
  are sent (`ChatController.stream` writes an NDJSON error frame instead), and a handler with no
  domain error throws the Nest exception inline with no try/catch.
- **Prisma repositories.** The `implements` + placement + `@Inject(PrismaService)` half is 11/11.
  The error-translation half applies to only 4 of 11 — those where a write can hit a unique
  constraint. Don't add an empty try/catch to a repository with no constraint to violate.
- **Generated-client import path.** Relative, with depth varying by location
  (`../../../../../` from `modules/<m>/infrastructure/persistence/`, `../../../` from
  `shared/prisma/`). The reason is stronger than first stated: `@prisma/client` doesn't merely
  violate convention, it doesn't contain this project's models.
- **`ConfigService` reads.** `getOrThrow<string>("KEY")` is right, but "in the constructor" holds
  for only 3 of 6 classes — the three `*TokenService` classes read lazily inside `sign()`, so a
  missing secret surfaces at first login, not at boot.
- **`env.validation.ts`.** Right rule, wrong mechanism: the schema is `.passthrough()`, so an
  unlisted variable is not rejected — it flows through untouched, which is exactly why omitting
  one fails silently. 7 `.refine` guards, 5 production-only and 2 provider-conditional.
- **Guards split in two kinds.** An *authentication* guard is `<role>-auth.guard.ts`, injects that
  role's `TokenService`, throws `UnauthorizedException`, attaches `request.<role>` (declared in
  `src/types/express.d.ts`). An *authorization* guard is `<capability>.guard.ts`, takes no
  constructor dependencies, attaches nothing, throws `ForbiddenException`.
- **Test doubles.** Fake-double and colocation halves are exactly right; "only 3 files touch
  `vi.mock`" understates vitest usage and would wrongly ban `vi.fn()` as a spy. See §10,
  contradiction 5.

---

## 2. `backend-validation-errors` — request validation, error handling, HTTP contract

18 candidate rules: 6 confirmed, 11 corrected, 1 refuted. Feeds
[`backend-http.md`](../../conventions/backend-http.md).

### Confirmed as first stated

- **Bodies are validated in-handler with `Schema.safeParse(body)` + `throw new
  BadRequestException(parsed.error.flatten())`.** 21 such blocks across 7 controllers, matching
  the 21 `@Body()` handlers exactly; no `ValidationPipe`, no `useGlobalPipes`, no class-validator.
  Mirror: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts`.
- **Every `@Body()` parameter is typed `unknown`.** All 21 occurrences; no DTO, no `z.infer`, no
  `any`. Mirror: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`.
- **`UnauthorizedException`/`NotFoundException`/`ForbiddenException` are thrown bare.** Verified
  stronger than claimed: 13 bare 401s, 11 bare 404s (the extraction pass said 8), 1 bare 403 in
  `hospital-admin.guard.ts`.
- **Pagination is `@Query("cursor")` + `@Query("limit")` through a file-local `parseLimit()`
  clamped against `DEFAULT_LIMIT`/`MAX_LIMIT`, returning `{ items, nextCursor, total }`**, with
  query and path params *not* zod-validated.
  Mirror: `apps/api/src/modules/notification/infrastructure/notification.controller.ts`.
- **No `Logger` in a controller.** `grep Logger --include="*.controller.ts"` returns nothing;
  exactly 11 `new Logger(X.name)` declarations, all in use-cases, the scheduler, or an adapter.
- **The streaming route sets status on `res` and writes errors as NDJSON inside a 200 body.**
  `chat.controller.ts` is the only `@Res()` in the app; its body-400 is thrown *before*
  `res.status(200)`, and its catch writes `{error: ...}` then `finally { res.end() }`.

### Corrected before use

- **Schema naming.** Location right, prescribed name wrong: the convention is
  `const <Verb><Entity>Schema`; the `...RequestSchema` suffix is used only by the four auth-flow
  schemas. Added condition: schemas are **never** shared between controllers even when
  byte-identical.
- **`parsed.data`.** The `z.infer` prohibition is verified (0 hits in `apps/api/src`). The "pass
  `parsed.data` whole" half is not — several handlers destructure named fields into positional
  arguments instead.
- **Catch blocks.** 24 `} catch (error) {` and 23 `throw error;` rethrows — the extraction pass
  reported 23/23, which cannot both be true. The single rethrow-less catch is the chat stream.
- **Error-class shape.** Placement verified. The empty-body form is 19 of 22, not universal
  (`send-chat-message.use-case.ts` declares two with `super(message)` + `this.name`), and one
  class is deliberately *not* exported because it never crosses the port.
- **`@HttpCode`.** Direction right, counts wrong (21 `@Post`, 5 `@Patch`, 3 `@Delete`, 13 `@Get`),
  and the rule omitted what decides the code: 201 for resource creation, 200 for action-style
  posts.
- **409 payloads.** Correct for *new* code only. Reading it as an instruction to retrofit the four
  existing bare 409s would break `apps/web`.
- **Date-to-string conversion.** Over-generalized from three paginated endpoints. There are two
  conversion sites: the controller's DTO map, and the Prisma repository converting before
  returning (which is what the manager-admin surface uses).
- **Controller test shape.** Verified 10/10 with supertest. Added scope: this is the *controller*
  rule; the WebSocket gateway is the deliberate exception, instantiated directly with hand-built
  fake `Socket`/`Server` objects.
- **Error-path assertions.** Only half true. 24 `toBe(400)` assertions and **not one** asserts the
  400 body — the `flatten()` payload every validation block emits is pinned nowhere.
- **Import extensions.** Confirmed repo-wide, but "zero counter-examples" is wrong: 2 alias-`.ts`
  imports exist in a test file, compiling only because `tsc` excludes test files.
- **`.max()` caps.** Aspirationally right, evidence wrong in a way that matters: two uncapped
  `token: z.string().min(1)` fields sit in the two files the extraction pass named as fully
  capped.

---

## 3. `frontend-architecture` — clean architecture, state and routing on `apps/web`

24 candidate rules: 21 confirmed, 13 corrected, 3 refuted (confirmed count includes confirmed
*divergences*). Feeds [`frontend-architecture.md`](../../conventions/frontend-architecture.md).

### Confirmed as first stated

- **Hand-wired container.** `app/container/<feature>.ts` as `export const x = new X(adapter)`,
  re-exported by `index.ts` — 11 feature files, `index.ts` exactly 11 `export *` lines, no DI
  framework, no context, no factories, no lazy getters.
  Mirror: `apps/web/src/app/container/manager-notifications.ts`.
- **Barrel-only container imports.** `grep '@/app/container/'` returns 0 hits across the whole
  tree, tests included.
- **Bare string-prefix query invalidation in a mutation's `onSuccess`.** 13 of 20
  `invalidateQueries` call sites use a bare prefix; none writes the token into the key.
- **No redundant generic `onError` toast.** `query-client.ts` is 25 lines holding one
  `MutationCache.onError` that bails when the call site declares its own; the four surviving
  mutation-level handlers all carry specific copy or a rollback.
- **The flat `routeChildren` export, wrapped by `createBrowserRouter` at the bottom of
  `router.tsx`**, with `router.test.tsx` importing it so the test router can't silently drift.
- **Field-selector subscriptions inside React, `.getState()` only outside.** Zero bare store-hook
  calls, no `useShallow`, no multi-field object selector anywhere.
  Mirror: `apps/web/src/presentation/lib/institution-link-gate.ts`.
- **`import * as container` + `vi.spyOn(container.x, "execute")`; `vi.mock` for third parties.**
  28 test files use the spy pattern; `vi.mock('@/app/container')` appears 0 times.
- **Dependency-free use-cases are split between the container and module scope** (3 module-scope
  instantiations) — the audit graded this "likely" and the grade was right.

Confirmed divergences (things that are true and wrong, feeding
[`priorities.md`](../../conventions/priorities.md)): peer-chat bypasses ports/use-cases/container
entirely; `lint:boundaries` enforces only two rules because the shared dependency-cruiser base
ships `forbidden: []`; no route-level code splitting (zero `lazy(`/`Suspense` hits); only the
manager panel gets 401 → logout; prettier configured but never run; all 8 persisted stores lack
`version`/`migrate` and one uses a non-conforming storage key; inconsistent adapter instantiation
in the container; the four largest pages are structured two contradictory ways; `theme.store.ts`
is the only persisted preference not using zustand `persist`; one hardcoded route string; the five
fire-and-forget signal calls all swallow with `.catch(() => {})`.

### Corrected before use

- **Use-case constructors take ports *and/or sibling use-cases*.** Composition is legal and used
  (`SubmitAssessmentUseCase`, `GetAssessmentHistoryUseCase`); the original "only port interfaces"
  would have flagged working code.
- **Hook arithmetic.** "48 of 50 hooks go through the container" overstates the baseline — see
  §10, contradiction 9.
- **Token-scoped queries.** Correct as a directive, but two of nine hooks AND extra conjuncts onto
  `enabled`, and the `retry: false` companion was missing from the rule.
- **Route guards.** The loader directive is right for auth and consent guards (16 store-reading
  loaders, zero `<Navigate>`), but "never a redirect inside `useEffect`" is false and following it
  literally would delete working, commented code.
- **`routes.ts` constants.** Correct, with one exception "everywhere" hides: `router.tsx`'s own
  `path:` keys are raw *relative* strings by necessity, because react-router paths are relative to
  the parent while `routes.*` values are absolute.
- **`ManagerShell`.** Split the halves: the session *guard* is a `loader` on the layout route
  object in `router.tsx`; `ManagerShell.tsx` holds only `useManagerSessionExpiry()` plus chrome.
- **Role gating.** Three sites, not two — `ADMIN_ONLY_ROUTES`, `managerNavFor`, and
  `useManagerNavHotkeys.ts`, the third hand-writing the comparison.
- **Store creation.** File/symbol naming is 12/12, but the curried `create<State>()(...)` form is
  10/12 — it exists to satisfy zustand v5 middleware type inference, so it's required only when
  the store wraps middleware.
- **Persist storage.** The session/device lifetime split is right and privacy-relevant, but only
  three stores declare `localStorage` explicitly; two rely on `persist`'s default.
- **"Never mirror server data into Zustand."** Right as a default, but the stated exception was
  misdescribed: `chat-conversation.store.ts` *does* hold server-originated assistant text, kept
  unpersisted for a privacy reason, not because it isn't fetched data.
- **Adapter response parsing.** True for read adapters; 5 of 16 ports import no zod at all and two
  adapters never call `.parse` — they are fire-and-forget writes with no response body.
- **Flow recipe counts.** The recipe is real; every count except the container and hook figures
  was inflated by test files. Actual: 16 ports, 14 HTTP adapters + 2 non-HTTP, 47 use-cases, 11
  container feature files.
- **Page folders.** Rule confirmed; the file counts excluded colocated tests and should say so.

---

## 4. `react-performance` — re-render behaviour, memoization, and the lint gap

14 candidate rules: 8 confirmed, 5 corrected, 0 refuted. Feeds
[`react-performance.md`](../../conventions/react-performance.md).

### Confirmed as first stated

- **Read store state with `useStore.getState()` inside a callback that must stay referentially
  stable**, rather than subscribing with a selector.
  Mirror: `apps/web/src/presentation/hooks/useChatConversation.ts`.
- **One atomic field selector per value; never a bare store-hook call, never an object or array
  returned from a selector.** 88 subscriptions in non-test code; a negative grep for any selector
  not matching the atomic shape returns zero.
- **`DataTable` column arrays are a module-scope `COLUMNS` const.** 4 of 4 tables.
  Mirror: `apps/web/src/presentation/pages/ManagerAdminManagersPage/manager-columns.tsx`.
- **Every sub-component is defined at module scope.** Three independent greps, all zero hits.
- **Lists are keyed by a stable domain id;** `key={index}` reserved for fixed-length skeleton and
  static-copy lists (20 such sites, each checked).
- **Post-re-render focus moves via a flag set in the handler and a `ref.focus()` in an effect
  keyed on that flag.** Mirror: `apps/web/src/presentation/hooks/useInlineConfirm.ts`.
- **Complete `useEffect` dependency arrays, with a comment on any intentionally mount-only
  effect.** 56 call sites; every `[]`-dep effect read individually, no missing-dependency bug
  found.
- **No `forwardRef` — `ref` is a plain prop typed `RefObject<T | null>`.** Zero `forwardRef` hits
  across `apps/web/src`, tests included.

### Corrected before use

- **`memo()` is reserved for two situations, not one:** the streaming-chat render path, *and* a
  zero-prop layout component a parent re-renders for unrelated reasons.
- **A stable function prop is necessary but not sufficient.** Two `useCallback`s in `ChatPage`
  don't cross a memo boundary at all (they go to a plain class `ErrorBoundary`), and
  `memo(MessageBubble)` is defeated on its own path by a freshly constructed `children` element.
- **`useMemo(() => query.data ?? [], ...)` earns its keep only when the array enters another
  hook's or memo's dependency array** — where it only spreads into JSX props, it buys nothing.
- **`await import("pkg")` for the runtime; a top-level `import type` from the same package is
  correct** and is how the deferring file keeps its types.
- **Appearance preferences are read through CSS tokens, with one exception:** the settings control
  that *writes* a preference must subscribe to it to render which option is selected.

---

## 5. `frontend-ui-forms` — forms, primitives, DataTable, tokens and a11y

30 candidate rules: 17 confirmed, 12 corrected, 1 refuted. Feeds
[`forms-and-ui.md`](../../conventions/forms-and-ui.md).

### Confirmed as first stated

- **`useForm({ resolver: zodResolver(schema), defaultValues, mode: "onBlur" })`** at all 9
  call sites measured. Mirror: `apps/web/src/presentation/pages/AdminLoginPage.tsx`.
- **Inputs with no validation rule stay plain `useState` beside the form — never `Controller`.**
  `Controller` = 0 occurrences; `FormProvider`/`useFormContext` = 0.
  Mirror: `apps/web/src/presentation/pages/ManagerAdminManagersPage/useManagerCreateFlow.ts`.
- **`{...form.register("field")}` spread directly onto `TextField`/`PasswordField`/`SelectField`;
  never `forwardRef`.** Zero `forwardRef` hits; each primitive declares `ref?: Ref<T>` as a plain
  prop.
- **`aria-invalid={condition ? true : undefined}`** — never `false`, never a bare boolean. Zero
  exceptions.
- **A distinct `key` per branch once a create-vs-edit ternary or wizard step mixes `register()`
  inputs with `value=`-controlled ones at the same tree position.**
  Mirror: `apps/web/src/presentation/pages/ManagerAdminManagersPage/ManagerFormModal.tsx`.
- **Icon-only controls are `<IconButton label icon={<Icon aria-hidden />} />`,** with the
  `aria-label` set after the spread and a 32px box plus a `before:-inset-1.5` touch bleed.
- **`outline-none` never appears without a `focus-visible:ring-*` in the same string literal** —
  enforced by `focus-visible.test.ts`, including an allowlist-honesty test.
- **44px touch targets** via `min-h-11` or a `before:absolute before:-inset-*` bleed (35
  occurrences).
- **`BulkActionButton` labels are one of exactly five pt-BR strings** — the icon and variant maps
  are indexed unguarded, so any other value renders `icon={undefined} variant={undefined}`.
- **`useDebouncedSearch(rows, toHaystack)` with the toolbar bound to
  `search`/`setSearch`/`hasQuery`/`filtered`,** NFD-normalized on both sides, 300ms debounce, all
  four admin tables.
- **Only `--color-*` tokens through Tailwind utilities.** Zero arbitrary hex, zero default-palette
  utilities, zero `bg-white`/`bg-black`.
- **No `dark:` variant and no `@media (prefers-color-scheme)` in a component** — dark mode is the
  `[data-theme='dark']` attribute redefining the same tokens.
- **`text-on-fill` only onto a `*-fill` background** — enforced by `token-pairing.test.ts`.
- **Every dialog is `<Modal isOpen onClose title footer>`.** `role="dialog"` = 0 occurrences; 13
  non-test importers.
- **Transient outcomes go through `toast.*`; inline `role="alert"` stays for validation** and for
  errors the user must fix in place.
- **New screens render inside `PhoneShell`/`ManagerShell`** so the skip link and
  `<main id={CONTENT_ID}>` come with them.
- **All user-facing strings, error copy, toasts and aria-labels are pt-BR.**

### Corrected before use

- **Schema colocation is per-owner**, not "always in the page folder": beside the page file for a
  flat page, inside the folder for a folder page, beside the component for a shared component.
- **Submit `disabled` comes from a live `safeParse` over watched values**, in two shapes — bare
  `form.watch()` when every field belongs to the schema, and a destructured array watch reassembled
  into an object when it doesn't.
- **The error-message triple is normative shape, not current coverage.** Most non-email fields
  validate silently today; treat it as what a *new* form should wire, and the coverage as the open
  gap.
- **Labelling.** `<label htmlFor>` + matching `id` inside a Card or Modal form; table chrome
  legitimately uses a wrapping `<label>` with an `sr-only` span, or a bare `aria-label`. The rule
  is "never placeholder-only," not "never a wrapping label."
- **Variant classes.** Module-level `Record<Variant, string>` in 11 UI files, but
  `[...].filter(Boolean).join(' ')` only where the class list has conditional segments (5 files).
  Critically, **drop the original rationale** — `className` last does *not* reliably override a
  variant under Tailwind v4 utility ordering.
- **Primitive typing.** Where the primitive *is* one element, spread `...rest` onto it; where it
  wraps a native control in a styling shell, `className` goes on the wrapper and `...rest` on the
  inner native element — that is what keeps `register()` working.
- **`DataTable`'s 8 props.** All are non-optional, so TypeScript already enforces them; the
  doc-worthy parts are `mobileList`'s reason and the expand trio's all-or-nothing wiring.
- **Bulk hooks.** `useDataTableSelection` 4 of 4; `useBulkDelete` and `useBulkStatusUpdate` 3 of 4,
  with `AdminInstitutionsPage`'s hand-rolled version a documented carve-out (the shared hook
  hardcodes masculine participles that don't agree with "instituição").
- **New colour tokens.** Add to both blocks — or to the test's `SHARED_BY_DESIGN` allowlist if
  genuinely theme-independent. Adding to `TEXT_PAIRS`/`GRAPHIC_PAIRS` is a convention, not an
  enforced one; what *is* enforced is the accent-preset completeness check for brand roles.
- **Corner scale.** `--radius-pill` is not redefined by the corners preference, so it moves six
  radii, not seven — and the test net only inspects `button, input` inside one kitchen-sink render.
- **Density padding.** `px-cell-x`/`py-cell-y` is well established (20 + 17 uses); `py-nav-y` (4)
  and `py-control-y` (**one** call site) are not — don't present control padding as established.
- **The a11y `SCREENS` array holds 23 entries, not 24,** and is not the only axe net — five other
  test files run their own scan with the same options object.

---

## 6. `testing` — Vitest conventions across the monorepo

23 candidate rules: 14 confirmed, 8 corrected, 2 refuted. Feeds
[`testing.md`](../../conventions/testing.md).

### Confirmed as first stated

- **Explicit `import ... from "vitest"` in every test file; globals off everywhere.** 276/276
  files; `apps/api` sets `globals: false` explicitly, the other two leave it at the false default.
- **API controllers are tested with `Test.createTestingModule` + supertest, never by calling the
  method.** 10 controllers, 10 controller tests, exactly those 10 import supertest.
- **API test files follow the same `.ts`-relative / `.js`-alias extension rule** (205 / 0 and
  84 / 2, the two exceptions in one file).
- **Each web page/component test declares its own file-local `renderPage()`;** there is no shared
  test-utils module anywhere.
- **Router tests import `routeChildren` and nest it under `createMemoryRouter`** rather than
  redeclaring a route object.
- **Every axe assertion is `axe(container, { rules: { region: { enabled: false } } })`** — exactly
  8 call sites, all with that identical options object.
- **A new full-screen page is appended to `SCREENS` in `a11y.test.tsx`** rather than getting its
  own axe test; the helper's first assertion is a crash guard against
  `/Unexpected Application Error/i`.
- **react-hook-form + zod validation is tested through the page** (type invalid → `user.tab()` →
  assert alert text + `aria-invalid` + the container spy was never called); zero `*-schema.test.ts`
  files exist.
- **Don't re-stub `matchMedia`, `showModal`/`close`, or re-register `toHaveNoViolations`** —
  `vitest.setup.ts` does all three, plus an `afterEach` cleanup.
- **Only `prisma.service.test.ts` and `prisma-sector.repository.test.ts` construct a
  `PrismaService`,** and the latter deletes its own rows in `afterEach`.
- **No snapshots, no `.skip`/`.only`/`.todo`.** Zero across all 276 files; the suite is uniformly
  `it(`, never `test(`.
- **`import "fake-indexeddb/auto";` is the first line of any web test touching IndexedDB.** Exactly
  3 files, all at line 1.
- **HTTP adapters are tested with `vi.spyOn(globalThis, "fetch")`,** asserting off
  `fetchSpy.mock.calls[0]` with `vi.restoreAllMocks()` in `afterEach` (13 files).
- **The absence claims hold:** no Playwright/Cypress/Puppeteer, no `@vitest/coverage-*`, no
  `coverage` block in any config, no coverage step in either workflow.

### Corrected before use

- **Test placement.** Keep the prohibition on `__tests__`/`tests`/`*.spec.*`, but name the two
  sanctioned deviations: a *second* test file for one source (`<Source>.<topic>.test.tsx`), and a
  topic-named file with no matching source. The API glob is `src/**/*.test.ts` **plus**
  `prisma/**/*.test.ts`.
- **`describe` naming.** "PascalCase, exactly" is too narrow: camelCase for plain functions,
  SCREAMING_SNAKE for constants, a trailing scope clause is welcome, a file may have several
  sibling top-level describes, and cross-cutting topic files use lowercase prose.
- **`it()` descriptions.** The "never start with should" half is solid (0 of 2173). The "never
  Portuguese" half needs a condition or it causes damage — descriptions are English sentences that
  quote pt-BR UI strings *verbatim*, because the assertion matches that exact DOM text.
- **Port doubles.** Right as the default, wrong as an absolute: a minority cast an object literal
  to the port when only 2–3 methods of a wide port are touched. Prefer the class form; don't treat
  an existing cast as a bug.
- **The container-spy rule is correct; only the path in its rationale was wrong** —
  `apps/web/src/app/container.ts` does not exist, and hasn't for some time. The container is a
  directory of 11 leaf modules re-exported by `index.ts`; the spy works because it mutates a method
  on the singleton the leaf module exported.
- **`userEvent` vs `fireEvent`.** The query-priority half holds; "every interaction" is
  contradicted 130 times, *including inside the mirror file cited for that very rule*. Three
  `fireEvent` uses are settled: global `keyDown` on `document`, `change` on a controlled input, and
  `scroll`/`wheel`/`focus`/`error`.
- **Quote style.** "Never run prettier" is verified and worth keeping; "use double quotes" is a
  62/38 coin flip in `apps/web` and contradicts four of the audit's own canonical files. `apps/api`
  and `packages/domain` are uniformly double; `apps/web` is genuinely mixed — match the directory.
- **CI gates.** The four-task list is exact, but "no typecheck" reads as "types aren't gated,"
  which is wrong: `build` **is** the typecheck. Add the path filters and `api.yml`'s two deploy
  jobs.

---

## 7. `security-privacy` — auth and the privacy invariants that define the product

26 candidate rules: 15 confirmed, 9 corrected, 2 refuted. Feeds
[`security-privacy.md`](../../conventions/security-privacy.md) and
[`product-invariants.md`](../../conventions/product-invariants.md).

### Confirmed as first stated

- **`AssessmentSchema`'s wire contract is exactly `{id, scaleType, capturedAt, ciphertext}`** —
  no raw answers, no `riskSignal`. The doc comment states the rule verbatim, and three tests assert
  that both fields are stripped. Mirror: `packages/domain/src/entities/assessment.ts`.
- **Session tokens are hand-rolled `base64url(payload).HMAC-SHA256` with an 8h expiry,** read via
  `config.getOrThrow`. No JWT, passport, bcrypt or argon anywhere in `apps/api/package.json`.
- **`verify()` compares the signature with `timingSafeStringEqual` *before* `JSON.parse`,** and
  returns `null` on every failure path including expiry — identical ordering in all three services.
- **Passwords are `scrypt(password, randomBytes(16).toString("hex"), 64)` stored as
  `"<saltHex>:<derivedHex>"`,** verified with a length check plus `timingSafeEqual`. The three
  password services are byte-identical apart from the class name.
- **Guards throw a bare `UnauthorizedException()`** and attach an identity declared in
  `src/types/express.d.ts`. Never a message, never a 403.
- **The manager guard re-reads both the manager row and the institution row per request** and 401s
  when either is inactive, taking `role` from the DB rather than the token.
- **`institutionId` comes only from `request.manager!.institutionId`** on manager-facing endpoints —
  21 of 21 sites. The only client-supplied `institutionId` on an HTTP route is on the four
  unauthenticated check-in schemas.
- **`:id` handlers re-read the row and reject on an institution mismatch.** All 9 enforcement
  points verified at their exact lines.
- **`@UseGuards(ManagerAuthGuard, HospitalAdminGuard)` at the controller class level,** covering all
  14 admin handlers; the frontend router loader is a UX redirect, not enforcement.
- **Sector access is resolved only through `GetAccessibleSectorsUseCase` /
  `ResolveAccessibleSectorIdsUseCase`,** with requested ids intersected against that set.
- **Invite/reset tokens are `randomBytes(32)` hex with a 48h expiry;** only the SHA-256 hash is
  persisted, the raw token is emailed once, and both columns are nulled on redemption.
- **No `inviteCode` from an unauthenticated endpoint.** The public sector list selects
  `{ id, name }` only; the inviteCode-bearing method is reachable only behind a guard.
- **Stricter `@Throttle` on the two unauthenticated email-accepting endpoints,** both
  `{ default: { limit: 5, ttl: 900_000 } }`, with non-disclosing handlers.
- **`escapeHtml()` on admin-entered strings in outbound email;** the system-generated token URL is
  the one deliberately exempt value, and the code comment says why.
- **An explicit CORS allowlist from `CORS_ALLOWED_ORIGINS`** — never `origin: true`, `"*"`, or
  reflection. The gateway carries a byte-identical resolver.

### Corrected before use

- **Name the port, not the adapter.** Encryption goes through the injected `EncryptAssessmentUseCase`
  behind `EncryptionPort`; `SubmitAssessmentUseCase` never imports `WebCryptoEncryptionAdapter`.
- **K-anonymity is per-sector, not per-datapoint.** See §10, contradiction 8.
- **Dedup-key hashing.** The event prefix is *not* universal: `record-signal-checkin` uses the
  unprefixed form, which is the namespace every other signal type must avoid; the other three
  prefix theirs (one with a two-part prefix).
- **Login non-disclosure.** Fold every failure mode *that role has* into one error — the five-item
  list applies to manager and peer-partner only; SuperAdmin has no `isActive` column and no
  pending-invite state, so `login-admin` correctly checks only two things.
- **Bearer-token storage.** Right for `main` and ordinary branches, but the HttpOnly-cookie
  migration is no longer spec-only — an active worktree has landed step 1.
- **Body validation.** Query params are the documented exception (hand-parsed everywhere), and the
  controller count is 7, not 5 — the extraction pass omitted `assessment.controller.ts`, the single
  most privacy-relevant one.
- **Env-var refines.** Add a `NODE_ENV === "production"` refine only when the var has a dev-safe
  default that would be dangerous in production — 5 of 7. Two are provider-conditional with no
  `NODE_ENV` check at all.
- **Anonymization is a code convention, not a privacy guarantee.** The repo's own spec forbids
  calling the output de-identified: text reaching the LLM must be treated as sensitive health data
  about an identifiable person. Never widen the four regex rules' claimed coverage in UI copy or
  docs.
- **The XSS prohibition holds; its evidence didn't.** The `href=` site list was wrong in both
  directions — one cited line builds a `telHref` rather than being an href attribute, and one real
  site was omitted.

---

## 8. `monorepo-tooling` — monorepo, build, CI/CD and database tooling

26 candidate rules: 14 confirmed, 12 corrected, 0 refuted. Feeds
[`monorepo-tooling.md`](../../conventions/monorepo-tooling.md).

### Confirmed as first stated

- **Every internal dependency is `"workspace:*"`.** All 5 declarations, read from all 4
  `package.json` files in full.
- **Package identity fields are uniform:** `@zelo/<dir>`, `0.0.0`, `private: true`,
  `license: UNLICENSED`, 4/4, with no `publishConfig`, changesets config or publish script.
- **Build-read env vars are declared in `turbo.json`'s `build.env`;** both commits cited as
  precedent exist.
- **The two build scripts are as stated verbatim** — api `tsc && tsc-alias`, web
  `tsc --noEmit && vite build`.
- **`packages/domain` is consumed only as `@zelo/domain`.** A single `"."` export, zod as the only
  dependency, 7 `export *` lines, 34 consumers, zero deep imports.
- **The Prisma datasource block carries no `url`;** `prisma.config.ts` supplies
  `env("DIRECT_DATABASE_URL")`.
- **`DATABASE_URL` for `PrismaService`, `DIRECT_DATABASE_URL` for the Prisma CLI,** with the Neon
  adapter selected only when the host contains `.neon.tech`.
- **A root-level file affecting a build or deploy is added to that workflow's YAML anchor in the
  same commit;** the precedent commit exists.
- **CI Node comes from `node-version-file: '.nvmrc'` and pnpm from `pnpm/action-setup@v4` with no
  version input.** 3/3 setup-node steps, `.nvmrc` = 24, both Dockerfiles `FROM node:24-alpine`.
- **Transitive pins live only in the root `pnpm.overrides`,** mirrored verbatim in the lockfile;
  both precedent commits exist.
- **No web deploy step in CI.** `web.yml` is one job ending at Build; Vercel deploys via its own
  git integration using `apps/web/vercel.json`.
- **The API deploys only through `api.yml`'s flyctl jobs,** with the post-deploy `/health` curl on
  both. (Line numbers had drifted from the extraction pass; content matched exactly.)
- **The Android project is committed under `apps/web/android`** and APKs come from `android:sync`;
  `local.properties` is genuinely untracked.
- **Only `*.env.example` files are tracked.** `.gitignore` excludes `.env` and `.env.*` with
  example re-includes; `.dockerignore` strips `.env*` from the build context.

### Corrected before use

- **Turbo tasks.** Register a task **only** if it is meant to run across the workspace — the five
  turbo tasks mirror the five root scripts exactly, and package-local scripts are deliberately not
  turbo tasks.
- **tsconfig inheritance.** 3/3 extend the base and there's no root tsconfig or project references,
  but the repo *does* locally relax and restate where needed (`strictPropertyInitialization: false`
  in api, `lib` restated in web).
- **API import extensions.** Correct for compiled code, but scope it: there are 4 live violations,
  all in files nothing typechecks.
- **Web import style.** The extensionless half is airtight (0 counter-examples in 1415 imports);
  "relative only within the current folder" has a live counter-example and is a strong default, not
  an absolute. Quote style is split — don't assume double.
- **Shared tool config.** True for ESLint only. There are *three* `.dependency-cruiser.cjs` files
  and the shared base is an empty shell (`forbidden: []`), so every architecture rule is
  deliberately package-local — and the original rationale is backwards for dependency-cruiser.
- **Prisma client imports.** 6 files, not 7, and the rule must not widen to `@prisma/*` — the
  driver adapters *are* imported from `node_modules` as normal packages.
- **`load-env.ts`.** Only 3 files import it directly, and notably the two standalone scripts do
  not — they get the cascade transitively through `PrismaService`.
- **"Never auto-run migrations" is too broad.** CI runs `prisma migrate deploy` automatically in
  `api-test` and in `deploy-dev`; only the production path stays manual.
- **Seeding.** Two over-generalizations: signal demo rows are *deleted and recreated*, not
  upserted (that's the intended idempotency strategy for a rolling window), and the manager-invite
  roster upserts with a non-empty `update:` and carries no password env var at all.
- **`pnpm install`.** Correct for GitHub Actions and Vercel, flatly wrong for Dockerfiles — inside
  a Dockerfile you install *bare* after `turbo prune`, because prune has already reduced the
  workspace. The matching anti-pattern as first worded would have broken both images.
- **The two Docker images share a skeleton but are not identical,** and the differences are the
  load-bearing part (`--ignore-scripts` + explicit `prisma generate` + placeholder DB envs on api;
  a `VITE_API_BASE_URL` build ARG and an **nginx** runner on web).
- **dependency-cruiser.** Mechanism confirmed, but the count is three packages, not one — and the
  api's `application-no-prisma-imports` rule **does not actually work**: it forbids
  `node_modules/@prisma/client`, which zero files import. This became `priorities.md` #2.

---

## 9. `divergences-terminology` — terminology drift and permission-model gaps

16 candidate rules: 6 confirmed, 9 corrected, 1 refuted. Feeds
[`priorities.md`](../../conventions/priorities.md) #9 and #23, plus the role-gating sections of
`security-privacy.md` and `frontend-architecture.md`.

### Confirmed as first stated

- **To expose data to a `SECTOR_MANAGER`, extend `ManagerController` behind `ManagerAuthGuard`
  alone — never weaken `HospitalAdminGuard` on `ManagerAdminController`,** which covers 14
  handlers from one class-level decorator.
- **HOSPITAL_ADMIN-only web routes go in the `ADMIN_ONLY_ROUTES` array,** kept as one list "so the
  extra guard cannot drift between the three pages" (the file's own comment).
- **`useManagerSessionStore.role` is presentation state only** — every role-gated screen's data
  must be independently refused by a server guard. The store's comment points at `TD-001`.
- **Sector→manager ownership is `Sector.managerId`, a single nullable FK** — never a join table,
  never multiple managers per sector.
- **New QR codes are thin named wrappers around `QrCodeModal`.** `qrcode` is imported in exactly
  one file, lazily.
- **New web data access is wired port → adapter → use-case → container → hook.** All 39 non-test
  `fetch(` sites live under `src/infrastructure/http/*.adapter.ts` and zero elsewhere.

### Corrected before use

- **`ManagerRole` literals.** Rule text stands; the rationale had to be rewritten — the strings are
  the Postgres enum values, the Prisma default, and the zod enum on both sides, but the *token*'s
  `role` field is only shape-validated, which is why the guard re-reads the row.
- **`institution` vs `hospital`.** Direction confirmed for the entity noun, but the carve-out list
  was incomplete: `HOSPITAL_ADMIN` and the `HospitalAdmin*` identifier family are correct and must
  not be "fixed," and médico-facing pt-BR copy keeps "hospital." See design spec §2's second named
  correction.
- **Role checks.** `HospitalAdminGuard` is the only *authorization* role check in the API. Role is
  compared in eight other non-test places, but every one is a business rule inside a use-case, never
  an access decision.
- **404 vs 400 on a cross-tenant id.** One of the three cited lines is a counter-example. See §10,
  contradiction 6.
- **Sector accessibility.** There is a deliberate, commented exception the rule as written forbids —
  browsing and filtering go through the use-case; the exception is documented in place.
- **Client role gates: three files, not four.** `router.tsx`, `manager-nav.ts` (which both the
  sidebar and bottom nav delegate to), and `useManagerNavHotkeys.ts`. The fourth item on the
  original list is a label map, not a gate.
- **The 403-coverage rule is a prescription, not an observed pattern,** and must be labelled as
  one: only 2 of the 14 admin endpoints have a negative test today.
- **Web DTO schemas are the *response* convention only.** Request and param shapes are plain
  hand-written interfaces — don't add zod schemas for them.
- **API import extensions.** Counts verified exactly; the *mechanism* needed fixing —
  `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` handle relative specifiers,
  while aliased ones are path-mapped by `tsc-alias` and must already read `.js`.

---

## 10. The nine cross-domain contradictions

Two domains asserting incompatible things is the highest-value signal the audit produced: it means
at least one plausible-sounding rule was about to be written down wrong, and no single-domain pass
could have caught it. Each was resolved by re-opening the code.

**1. "`@/` means cross-module, relative means same-module."**
*A:* `backend-modules` and `backend-validation-errors` both asserted it, the latter claiming zero
counter-examples across the controllers.
*B:* `backend-modules`' own verifier found 20 self-module `@/modules/<self>/...` imports.
**B wins, and the rule had to be restated by *layer*, not by module boundary.** Infrastructure
adapters and repositories import their own module's port through the self-alias (all 11 Prisma
repositories and 3 of 4 AI adapters); use-cases, services and controllers reach their own module's
files relatively. The `grep '@/modules/'` = cross-module heuristic is false in both directions — 20
intra-module false positives and 22 relative cross-module edges missed. The "zero counter-examples"
claim held only because it sampled the 10 controllers, the one layer where the rule happens to be
true.

**2. `ConfigService` vs `process.env` for adapter selection.**
*A:* `security-privacy` said only pre-DI entry points may touch `process.env`, implying three module
files were violations.
*B:* `backend-modules` said adapter selection is explicitly a module-scope `process.env` ternary,
*not* `useFactory` + `inject: [ConfigService]`.
**B wins; A's own verifier refuted A.** All three module files carry the identical comment
explaining why: reading through DI would instantiate `ResendEmailAdapter` and `GroqAdapter` even in
mock mode, and their constructors `getOrThrow` for keys that mock mode doesn't have — crashing boot
on every local dev session and the entire test suite. The allow-list is `main.ts`, `load-env.ts`,
`prisma.service.ts`, `prisma.config.ts`, **and** the three module bodies for provider selection. The
genuine leftovers are three other files that duplicate a localhost fallback or a CORS resolver.

**3. The sector-manager QR fix.**
*A:* `divergences-terminology` prescribed adding `inviteCode` to the accessible-sectors return,
naming `findActiveByIds` as the repository method to widen.
*B:* `security-privacy` said never return `inviteCode` from an unauthenticated endpoint.
**B wins, and A's prescribed fix was a live security hole.** The use-case branches on role —
`HOSPITAL_ADMIN` hits `findActiveByInstitution`, `SECTOR_MANAGER` hits `findActiveByIds` — but
returns one type for both branches, so a naive implementation widens both. And
`findActiveByInstitution` is the entire body of `institution.controller.ts:48`, on a controller with
no `@UseGuards` anywhere in the file, which would publish every sector's QR credential to anyone
holding an institution cuid — which the public by-code endpoint hands out. The correct shape is a
new repository method or a separate scoped endpoint; never a widened shared select.

**4. Whether use-cases are exempt from unit tests.**
*A:* `testing` rule 7 said not to unit-test "a Prisma repository or a one-line passthrough
adapter/use-case."
*B:* `frontend-architecture` treats use-cases as *the* unit-tested layer, and `testing`'s own
verifier found the reference doc saying use-cases are unit-tested against fakes.
**B wins; A would have suppressed tests the convention requires.** The documented exemption covers
Prisma repositories and thin HTTP adapters, never use-cases — and the code agrees: many tested web
use-cases are single-line passthroughs. The untested admin-CRUD use-cases are a gap, not an
exemption. This is now stated flatly in
[`testing.md` §1](../../conventions/testing.md).

**5. Mocking libraries vs spies.**
*A:* `testing` listed "do not introduce a mocking library or `vi.fn()`-shaped port double" as an
anti-pattern.
*B:* `backend-modules`' verifier found 7 files using `vi.fn()` as a spy, including a use-case test
and a controller test.
**Both are right about different things, and the rule must say so or an AI will delete working
spies.** A port *double* is always a hand-written `class FakeX implements X` (110 of 122 `Fake`
classes carry `implements`); `vi.fn()` is legitimate as a *spy* for call assertions on a non-port
collaborator; `vi.mock` is reserved for third-party SDK modules. A real exception neither domain
handled also survives: a handful of API use-case tests cast an object literal to the port instead of
implementing it — prefer the class form, but don't treat existing casts as bugs.

**6. 404 vs 400 on a cross-tenant id.**
*A:* `security-privacy` and `divergences-terminology` both said a cross-tenant hit is always a
`NotFoundException`, citing three controller lines.
*B:* `divergences-terminology`'s verifier found one of those three lines throwing
`BadRequestException`.
**B wins, and the distinction is deliberate and had to become part of the rule.** For the row
addressed by the `:id` **path param**, a cross-tenant hit is a bare 404 so the response cannot
confirm the id exists. For a foreign id supplied in the **request body**, it is a 400 with a
message, because the caller already knows the id they sent. 403 is reserved for the role check
itself — `ForbiddenException` appears in exactly two non-test lines, both in the admin guard.

**7. The `@Throttle` decorator shape.**
*A:* `security-privacy` transcribed the per-route limit as the flat `@Throttle({ limit, ttl })`.
*B:* `backend-validation-errors` noted that `@nestjs/throttler` v6 requires the nested
`@Throttle({ default: { limit, ttl } })`, and that the flat v5 form silently applies no limit.
**B wins.** The package is pinned `^6.5.0` and both live sites use the nested form. Documentation
generated from A's phrasing would have taught an agent to write a decorator that parses,
type-checks, and rate-limits nothing — on the two unauthenticated routes that accept a bare email
address.

**8. Whether k-anonymity applies per datapoint.**
*A:* `security-privacy` rule 3 said never return a sub-threshold sector's numbers in any field.
*B:* The code and that domain's own verifier: `weeklyTrend` deliberately includes every week a
visible sector has rows for, including weeks where that sector was under k.
**B wins.** Suppression is per-**sector**, decided once by that sector's check-in count in the
reference week; every aggregate then reads from the same `visibleSectorIds` set, with no per-week
re-check. A trend point below the threshold is correct behaviour, not a leak — and an agent handed
rule 3 as written would have "fixed" the dashboard into unreadable gaps. Restated as: import
`K_ANONYMITY_THRESHOLD` for every *visibility* decision, never hardcode 5, and derive every
aggregate from the resulting set.

**9. Hook compliance arithmetic.**
*A:* `frontend-architecture` rule 5 said "48 of 50 non-test hooks go through the container," with
only the two peer-chat hooks violating.
*B:* Its verifier: only 36 of 50 hooks import `@/app/container` at all; 12 touch no network by
design.
**B wins, and the arithmetic matters for the ratchet.** Of the 38 hooks that reach a transport, 36
go through the container and 2 reach into `@/infrastructure/websocket` directly. The other 12 are
neither violations nor container consumers. Stating "48 of 50 comply" overstates the baseline by
counting 12 abstentions as compliance — which would make a future re-audit read as a regression when
nothing regressed.

---

## 11. Status of this file

**This is a historical snapshot of the 2026-09-15 audit, not a living document.** Every count, line
number and file list above was true on that date and is not maintained. It exists to answer "what
evidence produced this rule, and what did the adversarial pass change about it" — a question whose
answer doesn't change when the code moves on.

The documents that *are* kept current are the playbooks this audit fed:
[`docs/conventions/`](../../conventions/README.md) and [`CLAUDE.md`](../../../CLAUDE.md). When a
convention changes, it changes there, in the PR that changes it — per the upkeep rule in
`docs/conventions/README.md`. Nothing in this file gets edited to match. If a future audit
supersedes this one, it gets its own dated findings file beside this one rather than overwriting it.
