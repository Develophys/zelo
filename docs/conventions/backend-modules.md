# Backend modules — NestJS module structure and Clean Architecture on the API

Every feature under `apps/api/src/modules/<name>/` splits into two mandatory layers:
`application/` (ports, use-cases, and anything else the module owns — services, prompts,
constants) and `infrastructure/` (controllers, guards, persistence, ai-providers), plus a
`<name>.module.ts` at the module root. `application/` never imports from `infrastructure/`
or from Prisma — it only knows about *ports*: an interface plus a `Symbol` DI token declared
in the same file. `infrastructure/` implements those ports and is where Nest, Prisma, and
HTTP concerns live. This is a textbook Dependency Inversion boundary, and it is nominally
enforced by `apps/api/.dependency-cruiser.cjs`'s `application-no-infrastructure-imports` and
`application-no-prisma-imports` rules (see "How to verify" below for the gap in the second
one). Not every module needs every subfolder — `ports/`, `use-cases/`, `persistence/`,
`ai-providers/`, a controller, or a repository are all present only when the feature needs
them (`sector` and `peer-chat` have no controller; `sector` also has no
`application/services/`, though `peer-chat` does —
`apps/api/src/modules/peer-chat/application/services/` exists).

Three mechanical rules hold across the whole tree, confirmed independently: every relative
import specifier ends in `.ts` and every `@/`-aliased specifier ends in `.js` — confirmed by
`apps/api/tsconfig.json:4-7` setting `module`/`moduleResolution: "NodeNext"` with
`allowImportingTsExtensions` and `rewriteRelativeImportExtensions` (tsc rewrites a relative
`.ts` specifier to `.js` at emit; `tsc-alias` path-maps an aliased specifier but does not
touch its extension, so a `@/...ts` specifier reaches `dist/` unchanged and crashes the ESM
loader at boot); code goes in `apps/api/src/shared/` only when two or more modules need it —
confirmed: `src/shared/` contains exactly `config/`, `date/`, `email/`, `prisma/`, `tokens/`
(`ls apps/api/src/shared`), and anything a single module owns stays under that module's
`application/`; and there are no barrel `index.ts` files anywhere under `apps/api/src` —
confirmed: `find apps/api/src -name index.ts` returns nothing.

## The recipe

Build a new capability in this order, one file per step:

1. **Port + Symbol DI token** — `application/ports/<thing>.port.ts`: the interface(s) first,
   then `export const TOKEN = Symbol("TOKEN")` at the **bottom** of the file (description
   string identical to the const name), then any error classes the port's implementations
   throw, after the token.
   Mirror: `apps/api/src/modules/institution/application/ports/institution-repository.port.ts`
   (token as the last line) and
   `apps/api/src/modules/sector/application/ports/sector-repository.port.ts`
   (token at line 41, `SectorNameConflictError` at 44, `SectorInviteCodeConflictError` at 47).
   A port shared by more than one module skips the module nesting entirely and sits directly
   in `src/shared/<area>/` — e.g. `apps/api/src/shared/email/email.port.ts` holds
   `EMAIL_PORT` and `EmailDeliveryError`.

2. **Use-case** — `application/use-cases/<verb>-<noun>.use-case.ts`, one `@Injectable()`
   class `<Verb><Noun>UseCase`, every constructor param `@Inject()`'d, entry point normally
   `execute(...)`. See "Naming, exactly" below for the two exceptions to `execute`, the
   object-vs-positional-args split, and the clock-parameter rule.
   Mirror: `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.ts`.

3. **Repository method**, only if the port needs one that doesn't exist yet —
   `infrastructure/persistence/prisma-<x>.repository.ts`: `Prisma<X>Repository implements
   <X>Repository`, `@Inject(PrismaService)`. Translate a Prisma error code to the port's own
   error class here only if the write can hit a unique constraint (4 of 11 repositories do
   this — a repository with nothing to violate has no try/catch at all).
   Mirror: `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`
   (its `violatesInviteCodeConstraint` helper at lines 17-31, used at 44-49, is the pattern
   for a table with more than one unique constraint).
   If the port or repository needs the generated Prisma client, import it by a **relative**
   path into `apps/api/generated/prisma/client.ts` — never `@prisma/client`, never `@/`.
   The depth varies by where you're importing from: `../../../../../generated/prisma/client.ts`
   from `src/modules/<m>/infrastructure/persistence/` (confirmed at
   `prisma-sector.repository.ts:2`), `../../../generated/prisma/client.ts` from
   `src/shared/prisma/` (confirmed at `prisma.service.ts:8`). Only import it at all if the
   file actually needs the `Prisma` namespace.

4. **Controller** — `@Body() body: unknown`, a zod schema declared at the top of the
   controller file (or imported from `@zelo/domain` if the shape is shared with the web app —
   check `packages/domain` before writing a new one), `Schema.safeParse(body)`, `throw new
   BadRequestException(parsed.error.flatten())` on failure. This `@Body()`-validation rule
   does not extend to `@Query()`/`@Param()` — confirmed: neither
   `admin.controller.ts:106-107`'s `@Query("cursor")`/`@Query("limit")` nor
   `manager.controller.ts:161-162`'s equivalents are passed to a zod schema; they're hand-
   parsed (a cursor/limit pair clamped against `DEFAULT_LIMIT`/`MAX_LIMIT`) or passed through
   as strings. For a JSON handler, wrap the use-case call in try/catch, map each known domain
   error to a Nest exception, and re-`throw error` for anything else, per catch block rather
   than per `instanceof` arm. Two exceptions, both confirmed directly: a streaming handler
   can't rethrow after it has already sent headers — `ChatController.stream`
   (`chat.controller.ts:29-38`) wraps its `for await` loop in try/catch, and on a caught error
   writes an NDJSON `{"error": code}` frame instead of rethrowing, then always `res.end()`s in
   a `finally`; and a handler with no domain error at all just throws the Nest exception
   inline with no try/catch — `InstitutionController.byCode` (`institution.controller.ts:36`)
   throws a bare `NotFoundException()`.
   This step is a summary, not the owner: the full validation recipe, the
   `@Query()`/`@Param()` carve-out, the cross-tenant response semantics and the rate-limiting
   picture all live in [`backend-http.md`](./backend-http.md) — read it before writing a
   controller, and don't extend this step's rules in place of that file's.
   Mirror: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts`
   (validation) and `apps/api/src/modules/admin/infrastructure/admin.controller.ts`
   (error mapping).

5. **Module wiring** — register the use-case in the module's `providers`, and bind the port
   token as `{ provide: TOKEN, useClass: ConcreteClass }` — except when the implementation is
   already a provider in the same module, where it's `{ provide: TOKEN, useExisting:
   ThatClass }` so both names resolve to one instance (confirmed at
   `apps/api/src/modules/notification/notification.module.ts:54`, binding
   `NOTIFICATION_PUBLISHER` to the already-registered `PublishNotificationUseCase`). Export a
   token or a plain class only when another module actually injects it — an existing `exports`
   entry is not proof of a real consumer (three exports are currently dead; see Traps).
   Mirror: `apps/api/src/modules/sector/sector.module.ts` (confirmed: `exports: [
   SECTOR_REPOSITORY, GetSectorByInviteCodeUseCase ]`, a token and a plain class side by
   side).

6. **Test** — `new` the use-case with a hand-written `class FakeXRepository implements
   XRepository`, whose unused methods `throw new Error("not used in this test")`. Reserve
   `Test.createTestingModule` + `supertest` for controller and gateway tests. Colocate every
   test as a sibling `*.test.ts`.
   The use-case-testing convention itself — including which files are exempt (a
   `prisma-*.repository.ts` passthrough) and which never are (a use-case, however thin) — is
   owned by [`testing.md` §1](./testing.md); this step just applies it.
   Mirror: `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.test.ts`.

## Naming, exactly

- **File and class names.** `<verb>-<noun>.use-case.ts` exporting `<Verb><Noun>UseCase`,
  `@Injectable()`. 38/38 `*.use-case.ts` files carry `@Injectable()`. Two exceptions to a bare
  `execute(...)` entry point: (a) a use-case that implements a port's method takes that
  method's name instead — `PublishNotificationUseCase` exposes `publish(event)`, not
  `execute`, because it implements `NotificationPublisher`; (b) closely-related reads/writes
  on one aggregate may add a second public method rather than a second file —
  `list-notifications.use-case.ts` exposes `execute` + `unreadCount`,
  `mark-notification-read.use-case.ts` exposes `execute` + `executeAll`. "One class per file"
  is also not absolute: 7 of the 38 use-case files additionally export the error class(es) that
  use-case throws — 8 classes across those 7 files, because
  `chat/application/use-cases/send-chat-message.use-case.ts` exports two
  (`AiProviderUnavailableError` and `CrisisFallbackRequiredError`). Re-counted fresh:
  `grep -rln "^export class .*Error" apps/api/src --include=*.use-case.ts | wc -l` → 7;
  the same grep without `-l` → 8.

- **Errors, never `HttpException`.** Model an expected failure as `export class SomethingError
  extends Error {}`. Place it in the use-case file that throws it, in the port file when a
  repository throws it, or in a shared `<area>-errors.ts` beside the use-cases when several
  use-cases in one module share it (`manager/application/use-cases/manager-admin-errors.ts`
  holds 6). 21 error classes exist across the codebase this way; grepping
  `NotFoundException|ConflictException|BadRequestException|UnauthorizedException|
  ForbiddenException|HttpException` restricted to any `/application/` path returns nothing —
  the controller is the only place that decides a status code.

- **`@Inject()` on every constructor parameter**, including plain class providers (use-cases,
  services, gateways, guards) — not just `Symbol` tokens. 148 constructor parameters in
  non-test source, 0 without `@Inject`. `emitDecoratorMetadata` reflection alone is fragile
  here because ports are imported with `import type`.
  Mirror: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`.

- **Use-case arguments.** A use-case taking more than one caller-supplied value takes a single
  exported `<UseCaseName>Input` object (`execute(input: CreateManagerInput)`) — this is the
  majority shape (18 object-shaped vs. 8 positional; the 8 include the three login use-cases,
  `mark-notification-read`, and the paged reads), not a universal rule, so don't be surprised
  by a positional sibling in the same module. A time-dependent use-case takes an injected
  clock as a **second, trailing, defaulted** parameter — `execute(input: XInput, now: Date =
  new Date())`, or `execute(now: Date = new Date())` with no input — never folded into the
  input object, so a test can pin it. 7 use-cases do this: the four
  `signal-checkin/application/use-cases/record-*.use-case.ts` files and the three
  `notification/application/use-cases/sweep-*.use-case.ts` files.

- **Guards split into two kinds by name and behavior.** An *authentication* guard is
  `<role>-auth.guard.ts`: it injects that role's `TokenService` (and, for manager, the
  repositories it re-reads on every request — confirmed:
  `manager-auth.guard.ts` also `@Inject`s `MANAGER_REPOSITORY` and `INSTITUTION_REPOSITORY`
  alongside `ManagerTokenService`), throws `UnauthorizedException`, and attaches
  `request.<role>` (a field declared first in
  `apps/api/src/types/express.d.ts`). An *authorization* guard is `<capability>.guard.ts` —
  no `-auth` suffix — takes no constructor dependencies, attaches nothing, throws
  `ForbiddenException`, and reads a field an authentication guard already populated, so it
  must be listed *after* that guard in the same `@UseGuards(...)`. Confirmed directly:
  `apps/api/src/modules/manager/infrastructure/hospital-admin.guard.ts` has no constructor,
  checks `request.manager?.role !== "HOSPITAL_ADMIN"`, throws `ForbiddenException`, and its
  own header comment states it must run after `ManagerAuthGuard`; it's applied as
  `@UseGuards(ManagerAuthGuard, HospitalAdminGuard)` at `manager-admin.controller.ts:79`.
  Either kind must also be listed in the `providers` array of the module hosting the
  controller that uses it — which is why `NotificationModule` re-provides `ManagerAuthGuard`
  even though `ManagerModule` already does.

- **A new environment variable goes into the zod schema** in
  `apps/api/src/shared/config/env.validation.ts`. The schema is `.passthrough()` (confirmed
  at `env.validation.ts:33`) — an unlisted variable is not rejected, it flows through
  untouched, which is exactly why omitting one from the schema is silent rather than loud.
  Add a `.refine` guard when a value matters only in some configurations: confirmed 7
  `.refine(` calls in the file (lines 34, 38, 47, 51, 59, 63, 67) split into two shapes — 5
  are production-only (`env.NODE_ENV !== "production" || ...`, covering `EMAIL_PROVIDER`,
  `WEB_APP_BASE_URL`, and the three token secrets' 32-char minimums) and 2 are
  provider-conditional in every environment (`GROQ_API_KEY` required unless
  `AI_PROVIDER === "mock"`, `RESEND_API_KEY` unless `EMAIL_PROVIDER === "mock"`) — copy the
  second shape for a variable that only some provider modes need.

## How to verify

```bash
pnpm --filter @zelo/api lint:boundaries
```

This runs `depcruise src --config .dependency-cruiser.cjs` (confirmed at
`apps/api/package.json:13`), which enforces two rules: `application/` may not import
`infrastructure/`, and `application/` may not import `node_modules/@prisma/client`. A green
run proves the first boundary holds — no file under `application/` reaches into
`infrastructure/`.

It does **not** prove the second boundary holds, because the rule's `to: { path:
"node_modules/@prisma/client" }` matches a package this codebase's `application/` code never
imports in the first place (Prisma's client is generated to `apps/api/generated/prisma/`,
outside `node_modules/@prisma/client`, since `apps/api/prisma/schema.prisma` sets `generator
client { output = "../generated/prisma" }`). A file under `application/` that imported
`../../../generated/prisma/client.ts` directly — the exact violation this rule exists to
catch — would pass `lint:boundaries` cleanly today. See `docs/conventions/priorities.md` #2
for the fix (`to: { path: "^generated/" }`) and the comment in
`apps/api/src/modules/notification/application/ports/notification.port.ts:1-4` that currently
(and incorrectly) tells the next reader this is already guarded.

`lint:boundaries` also says nothing about import extensions, `@Inject()` coverage, naming
conventions, or any of the other rules in this document — those have no automated check.

## Traps

- **Self-alias vs. relative import direction is layer-specific, not module-boundary-specific
  — and it was previously stated backwards.** An infrastructure adapter or repository imports
  its **own module's** port through the `@/` alias (`@/modules/<self>/application/ports/
  <x>.port.js`), while a use-case, service, or controller reaches its own module's files
  **relatively** (`../ports/<x>.port.ts`). Confirmed directly: every file under
  `apps/api/src/modules/sector/infrastructure/persistence/` imports the sector port via
  `@/modules/sector/application/ports/sector-repository.port.js`, while
  `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts:2` imports its
  own module's port relatively as `../ports/manager-repository.port.ts`. Match the layer
  you're writing, not "which module am I in" — `@/` is not reserved for crossing a module
  boundary; 20 of 117 `@/modules/...` specifiers in `src` point back into the importer's own
  module (all 11 Prisma repositories, 3 of 4 AI adapters), and relative cross-module imports
  exist too — `notification.module.ts` reaches five other modules over `../manager/...`,
  `../peer-partner/...`, `../institution/...` for ports, concrete Prisma repository classes,
  a guard, and a token service. Mirror for the self-alias form:
  `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`.

- **`process.env` read directly in a module body is correct, not a violation — despite
  reading like one.** Selecting between a fake and a real adapter is a module-scope constant,
  `process.env.X === "..." ? Fake : Real`, referenced from `providers` — never `useFactory` +
  `inject: [ConfigService]`. Confirmed directly: `apps/api/src/modules/manager/
  manager.module.ts:40-47` and `apps/api/src/modules/chat/chat.module.ts:9-16` both carry the
  comment "Read directly from process.env (not ConfigService)" immediately above the
  `process.env.AI_PROVIDER === "mock"` ternary (a third site, `shared/email/email.module.ts:
  7-14`, does the same for `EMAIL_PROVIDER`). The reason: `useFactory` would still construct
  the real adapter to pass it to the factory, and the real adapter's constructor calls
  `config.getOrThrow` for a secret that mock mode exists precisely to not require; module
  bodies also evaluate before `ConfigModule.forRoot` has run, so `ConfigService` doesn't exist
  yet at that point. This deliberately departs from the `useFactory` example in
  `docs/superpowers/specs/2026-07-07-pwa-architecture.md:150` — that spec is aspirational in
  this respect, not descriptive. Outside this provider-selection case (and `main.ts`
  bootstrap, and the gateway's CORS origin, and `shared/config/load-env.ts:16`'s `NODE_ENV`
  read to pick which `.env` file to load), configuration goes through `@Inject(ConfigService)`
  plus `getOrThrow<string>("KEY")` — in the constructor for the three adapters (groq,
  groq-insight, resend), but lazily inside a private `sign()` method for the three
  `*TokenService` classes, meaning a missing token secret there surfaces at first
  login/verify, not at boot.

- **Test doubles: fake vs. spy vs. `vi.mock` are three different tools, not one banned
  pattern.** A port gets a hand-written `class FakeXRepository implements XRepository`,
  never `vi.mock`. `vi.mock(...)` is reserved for stubbing a third-party SDK boundary —
  confirmed by direct grep: exactly 3 files call it, and all 3 are SDK adapters
  (`chat/infrastructure/ai-providers/groq.adapter.test.ts`,
  `manager/infrastructure/ai-providers/groq-insight.adapter.test.ts`,
  `shared/email/resend-email.adapter.test.ts`). `vi.fn()` as a **spy** for call assertions on
  something that is not a port is separately fine and more common — confirmed by direct grep:
  7 files use it, including a use-case test
  (`sector/application/use-cases/get-sector-by-invite-code.use-case.test.ts`) and a controller
  test (`manager/infrastructure/manager-admin.controller.test.ts`). A blanket "no mocking
  library" reading of the fake-double rule would delete working spies.

- **Don't trust an `exports` entry as proof of a cross-module consumer.** A module's
  `exports` array carries whatever other modules actually import — tokens *and* plain classes
  (use-cases, services, guards, gateways) — but three current exports have no real consumer:
  `PeerPartnerPasswordService` and `PeerPartnerAuthGuard` from `peer-partner.module.ts:27`,
  and `NOTIFICATION_REPOSITORY` from `notification.module.ts`. And a class can legitimately be
  registered as a provider in two different modules when importing the owning module would
  create a DI cycle — six classes are (`PrismaManagerRepository`, `PrismaSignalRepository`,
  `PrismaPeerPartnerRepository`, `PrismaInstitutionRepository`, `ManagerAuthGuard`,
  `ManagerTokenService`, all re-provided in `notification.module.ts` alongside their owning
  module). Don't "fix" a dual registration by importing the owner module — that reintroduces
  the cycle it exists to avoid.
