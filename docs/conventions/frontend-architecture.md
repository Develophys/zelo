# Frontend architecture — clean architecture, state and routing on `apps/web`

`apps/web/src` is layered `ports/` → `infrastructure/` → `use-cases/` → `app/container/` →
`presentation/hooks/` → `presentation/pages/`, with `stores/` (Zustand) sitting beside the
use-case layer rather than inside it. There is no framework-level DI: `app/container/` is
hand-wired `export const xUseCase = new XUseCase(adapter)`, one feature file per file
(`admin-auth.ts`, `admin-institution.ts`, `assessment.ts`, `chat.ts`, `institution-link.ts`,
`manager-admin.ts`, `manager-auth.ts`, `manager-dashboard.ts`, `manager-notifications.ts`,
`peer-partner-auth.ts`, `signal-checkin.ts` — 11 files), re-exported through
`app/container/index.ts`, which is exactly 11 `export * from "./<feature>"` lines and nothing
else. `general-documentations/architecture-reference.md:104-105` still describes this as
`apps/web/src/app/container.ts`, "one file of plain `new X(new Y())` constructor wiring" — the
doc is stale on the filename (it's a directory now), but the underlying description of the
wiring style is accurate and is the rule to follow.

A use-case's constructor takes port interfaces **and/or sibling use-cases** — composition is
legal and used, not a violation: `SubmitAssessmentUseCase` takes `ScoreAssessmentUseCase` +
`EncryptAssessmentUseCase` alongside two ports
(`apps/web/src/use-cases/submit-assessment.usecase.ts:19-25`), and `SendChatMessageUseCase`
takes `AnonymizeTextUseCase` (`apps/web/src/app/container/chat.ts:7-10`,
`new SendChatMessageUseCase(new HttpChatGatewayAdapter(), anonymizeTextUseCase)`). The composed
instance is always built in the container, never inside the use-case itself. What a use-case may
never do is import `@/stores`, `@/infrastructure`, `@/presentation` or `react` — two
dependency-cruiser rules enforce that boundary (see "How to verify").

For the step-by-step recipe (port → adapter → use-case → container line → hook → page → route),
the three silent per-pathname lookup tables (`routes.ts`, `route-title.ts`,
`app-header-meta.ts`), and the mandatory `401` handling shape for `http-manager-*.adapter.ts`,
see the [`zelo-frontend-flow` skill](../../.github/skills/zelo-frontend-flow/SKILL.md) — that
content isn't repeated here.

## State split: Zustand vs. TanStack Query

Two kinds of frontend state, and the rule for which one a new piece of state gets:

- **Zustand + `persist`** holds device-local flags that must survive a reload — consent, the
  follow-up answer, manager/admin/peer-partner sessions, the institution link. It's read outside
  React via `.getState()` in route loaders and a handful of orchestration helpers, never inside a
  component render path (see the selector rule below).
- **TanStack Query** holds anything that touches the network — logins, submissions, the manager
  dashboard's reads. A thin `useQuery`/`useMutation` hook wraps exactly one use-case call.

The rule that keeps the two from bleeding into each other: **a use-case never reaches into a
store itself.** Every one of the 47 files under `apps/web/src/use-cases/` takes plain values in
its `execute()` input, never a store or a selector — `RecordFollowUpUseCase`'s
`InstitutionLinkSnapshot` input type is declared in
`apps/web/src/use-cases/record-signal-checkin.usecase.ts:3-7` and imported by
`record-follow-up.usecase.ts` as a plain interface, with no store import anywhere in the file.
The *calling* hook or a `presentation/lib/*` helper reads the store and hands in the snapshot —
`apps/web/src/presentation/lib/institution-link-gate.ts:5-11`'s `getLinkedAndOptedIn()` is one
such helper (not the only place either store gets read — several route loaders and page
components also select from `useInstitutionLinkStore`/`useConsentStore` directly for their own
purposes). This is what keeps a use-case unit-testable against fakes without mocking Zustand.

Never mirror a cacheable, re-fetchable server payload into a Zustand store (lists, dashboards,
notifications stay in TanStack Query). `chat-conversation.store.ts` looks like a counter-example
but isn't one to copy from as-is: it does hold assistant text that arrived over the network, kept
unpersisted specifically because an incremental token stream can't be re-fetched and because
writing what a doctor typed in distress to disk is a separate privacy call — read the comment at
`apps/web/src/stores/chat-conversation.store.ts:23-29` before treating it as a template.

## Zustand selector discipline (corrected confidence)

Subscribe to a store inside React with a single field selector —
`useXStore((state) => state.field)` — and reserve `.getState()` for outside React (route
loaders, `presentation/lib/*` helpers, DOM event handlers). This held up on re-check: a grep for
`use[A-Za-z]+Store((` across `presentation/`, `app/` and `stores/`, excluding tests, returns 88
selector call sites, and a separate grep for a whole-store subscription (`= useXStore()`) returns
zero non-test hits.

Treat that as the working convention, not as a guarantee of full coverage: the check is a
single-line grep, and a selector split across multiple lines (e.g. a bare `useXStore()` call
whose result is destructured on the next line) would not have been caught by it. If you're
auditing this rule again, don't read "0 hits" as proof there are no multi-field or whole-store
subscriptions anywhere — read it as "none of the single-line shape."

## Reaching a transport: the corrected hook count

Reach network or storage from `presentation/` only through a container-exported use-case — never
`import "@/infrastructure/*"` or `new` an `Http*Adapter` inside a hook, component or page. An
earlier pass at this figure claimed "48 of 50" hooks comply; that arithmetic is wrong and should
not be treated as a regression baseline if a future audit finds a different number. The corrected
figure, re-verified directly:

- `apps/web/src/presentation/hooks/` holds 50 non-test hook files.
- 36 of them import `@/app/container`.
- Of the 14 that don't, **12 are legitimate abstentions that touch no network by design**, not
  violations: `useApplyAppearancePrefs`, `useDebouncedSearch`, `useDocumentTitle`, `useHasCamera`,
  `useHotkey`, `useInlineConfirm`, `useInstallPrompt`, `useLinkInstitutionFlow`,
  `useManagerSessionExpiry`, `useOnline`, `useStickToBottom`, `useTypewriter`.
- The remaining **2 are the real violations** — `usePeerPartnerConnection.ts` and
  `usePeerRequest.ts` both `import { PeerChatSocketClient } from
  "@/infrastructure/websocket/peer-chat-socket.client"` and `new` it directly. This is the
  anonymous peer-chat feature's known bypass of the ports/use-cases/container layering (it has no
  `peer-chat.port.ts`, no use-case, no container entry) — don't use either file as a mirror for a
  new realtime feature.

So the accurate framing is **36 of the 38 hooks that reach a transport go through the
container**, not "48 of 50 hooks total." Counting the 12 abstentions as violations on a future
re-audit would be a false regression; counting `usePeerPartnerConnection`/`usePeerRequest` as
compliant would miss the one real gap.

## Route guards

Every auth/consent/role guard is a react-router `loader` on the route object, reading a session
or consent store via `.getState()` and returning `redirect(routes.y)` or `null` — never a
`<RequireAuth>` wrapper, a `<Navigate>` in render, or a `useEffect` redirect for this purpose.
The manager panel splits the guard from the chrome across two different files, and copying only
one half reproduces a bug that already shipped once: the **layout route object** in
`apps/web/src/app/router.tsx:128-147` owns the session guard (`loader: () =>
useManagerSessionStore.getState().isValid() ? null : redirect(routes.managerLogin)`), while
`ManagerShell.tsx` (the `Component` on that same route) owns only `useManagerSessionExpiry()`
plus the chrome — its own comment records that the expiry effect was previously copied onto 3 of
6 manager pages and missing from the other 3, leaving an expired session on a dead retry button.

A route path is always a `routes.*` constant in `to=`, `navigate()` and `redirect()` — never a
literal string (`routes.test.ts` pins the full 35-key object, and there's exactly one surviving
hardcoded exception at `ManagerAdminSectorsPage.tsx:122`, not a pattern to repeat). The one place
literal strings are correct is `router.tsx`'s own `path:` keys (`"manager/admin/managers"`,
`"assessment/phq9"`, …) — those are relative to the parent route, while `routes.*` values are
absolute, so they can't be the same string; `routes.test.ts` plus `router.test.tsx` are what keep
the two in sync instead.

The `useEffect`-based redirect is not banned outright, just confined to two already-documented
shapes — don't add a third:

1. A deliberate belt-and-suspenders duplicate of a loader, commented as such:
   `SplashPage.tsx:25-31` redirects home on `hasConsented` with the comment "Backup to the router
   loader on '/' … so a warm start never flashes onboarding."
2. A data-availability guard whose input lives in `location.state`, which a loader cannot read:
   `AssessmentResultPage.tsx:29-36` redirects (and toasts) when no assessment result was passed or
   recalled.

For the three per-pathname registration tables (`routes.ts`, `route-title.ts`,
`app-header-meta.ts`) a new route must also touch, see the
[`zelo-frontend-flow` skill](../../.github/skills/zelo-frontend-flow/SKILL.md) — not repeated
here.

## Page shape

Ship a page as a single `presentation/pages/<Name>Page.tsx` with a named export (there are zero
`export default`s in `apps/web/src`). Promote it to a `<Name>Page/` folder — page + `index.ts`
re-export, flat, no nested `components/`/`hooks/` subdirectory — only once it actually gains
co-located pieces: sub-components, a `*-columns.tsx`, a `*-form-schema.ts`, a
`use<Name>*Flow.ts`, a modal. `apps/web/src/presentation/pages/ManagerAdminManagersPage/` is the
reference: 11 files (`ManagerAdminManagersPage.tsx` at 217 lines, `.test.tsx`, `index.ts`,
`manager-columns.tsx`, `manager-form-schema.ts`, `ManagerFormModal.tsx`,
`ResetPasswordConfirmModal.tsx`, `RoleAndSectorFields.tsx`, `useManagerCreateFlow.ts`,
`useManagerEditFlow.ts`, `useManagerInvites.ts`). Don't treat a folder holding only a page, its
test and an `index.ts` as proof the threshold is "any page can be a folder" — a folder with no
real siblings is under-earning it, not demonstrating the convention.

## How to verify

There's no lint rule for most of this document; verification is re-running the greps by hand.

```bash
# container shape: 11 feature files + an 11-line barrel
ls apps/web/src/app/container/ | grep -v index.ts
cat apps/web/src/app/container/index.ts

# use-case boundary (fails CI's lint:boundaries on a violation)
pnpm --filter @zelo/web lint:boundaries

# Zustand selector discipline
grep -rnE '= use[A-Za-z]+Store\(\)' apps/web/src --include='*.ts' --include='*.tsx' | grep -v '.test.'
grep -rnE '\buse[A-Za-z]+Store\(\s*\(' apps/web/src/presentation apps/web/src/app apps/web/src/stores | grep -v '.test.' | wc -l

# hooks that reach a transport without going through the container
grep -rl '@/app/container' apps/web/src/presentation/hooks/*.ts | grep -v '.test.' | wc -l   # expect 36
ls apps/web/src/presentation/hooks/*.ts | grep -v '.test.' | wc -l                            # expect 50

# use-cases with no colocated test
for f in apps/web/src/use-cases/*.usecase.ts; do
  base="${f%.usecase.ts}"
  [ -f "${base}.usecase.test.ts" ] || basename "$f"
done
```

`lint:boundaries` proves only the `use-cases/` ↔ `react`/`infrastructure` boundary; it says
nothing about selector discipline, the container-vs-direct-infrastructure hook split, route
guard placement, or use-case test coverage — none of those have an automated check, which is why
they're worth re-grepping rather than assumed.

## Traps

- **The untested-admin-CRUD-use-case gap.** `architecture-reference.md:511-513` states the actual
  convention: a use-case is unit-tested; only a thin, passthrough adapter is exempt, "the same
  untested-by-convention rule as backend Prisma repositories" (its own words — the backend side of
  that rule is the `application/`-layer exemption for Prisma repositories and thin HTTP adapters,
  not written down in `docs/conventions/backend-modules.md` today, but the same idea). That
  convention is currently violated on the frontend, not silently accepted: of the 47 files under
  `apps/web/src/use-cases/`, 18 have no colocated `*.usecase.test.ts` — every one of them is an
  admin CRUD use-case (`create-institution`, `create-manager`, `create-peer-partner`,
  `delete-manager`, `delete-peer-partner`, `delete-sector`, `list-accessible-sectors`,
  `list-institution-sectors`, `list-institutions`, `list-managers`, `list-peer-partners`,
  `list-sectors`, `send-manager-set-password-email`, `send-peer-partner-set-password-email`,
  `update-institution`, `update-manager`, `update-peer-partner`, `update-sector`). This has no
  `docs/conventions/priorities.md` entry yet — treat it as a real, priorities.md-shaped gap
  worth ranking there, not as an accepted exemption to extend to the next admin use-case you
  write.
- **Don't build a React DI container, `ServicesProvider`, or `useContext`-injected use-case.**
  Wiring is deliberately plain `new X(new Y())` in `app/container/<feature>.ts`; the exported
  singletons are what `import * as container` + `vi.spyOn(container.xUseCase, "execute")` spies
  on in tests. `vi.mock("@/app/container")` would blank every other use-case a page under test
  needs — reserve `vi.mock` for third-party modules (jspdf, qrcode, qr-scanner,
  socket.io-client).
- **Don't add a `queryKeys` factory.** Query keys are inline literal arrays with the session
  token as the second element (`["admin-managers", token]`), and invalidation deliberately relies
  on bare string-prefix matching in `onSuccess` — 13 of 15 write hooks invalidate with just the
  prefix; only `useManagerInsight.ts` and `useManagerNotifications.ts` include the token, and the
  latter is a known trap in its own right: its `invalidateBoth` closure captures `token` at
  render time, so it silently invalidates nothing once the session that token belonged to has
  been cleared. Don't copy the token-inclusive shape for a new hook.
