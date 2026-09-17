# React performance, re-render behaviour and the lint gap

Applies to `apps/web` (React 19.2.0). This file explains *why* the app's re-render and
memoization patterns look the way they do; `docs/conventions/priorities.md` tracks the
concrete fixes referenced below (#5, #6, #14).

## Overview

React Compiler (`babel-plugin-react-compiler`) is not configured — `apps/web/vite.config.ts:35`
calls `react()` from `@vitejs/plugin-react` with no options, and there is no
`react-compiler` reference anywhere in the repo. All memoization in the app is hand-written.

`eslint-plugin-react-hooks` is not installed. `packages/config/eslint.base.mjs` is
`typescript-eslint` recommended plus two rules (`no-unused-vars`, `consistent-type-imports`);
neither `apps/web/eslint.config.mjs` nor `apps/api/eslint.config.mjs` adds a React plugin.
**This is the single largest lint gap in the repo**: `rules-of-hooks` and `exhaustive-deps` are
entirely unenforced across 56 `useEffect`, 31 `useCallback` and 12 `useMemo` call sites in
non-test `presentation/` code. See `priorities.md` #6.

## The `exhaustive-deps` caveat

A hand audit read every `useEffect` in the app — all 56 call sites — and found no
missing-dependency bug. Both effects that are deliberately mount-only despite reading a prop
carry a comment explaining why (`AssessmentReview.tsx:34-38`, `ScaleAssessmentPage.tsx:39-46`),
and the hardest cases (the socket-reconnect effects in `usePeerPartnerConnection.ts:33-77` and
`usePeerRequest.ts:30-34`) check out correctly.

**This is not a substitute for running the lint rule and must not be cited as a reason to
defer adding it.** A hand audit is a one-time read of the code as it exists today; it cannot
catch a dependency dropped in a future edit, and nothing today would catch one either —
dropping `readMessages` from `useChatConversation.ts`'s effect deps, or any other dependency
from any of these 56 effects, still lints clean and still builds. The audit's clean result is
evidence the rollout will be cheap, not evidence the rollout is unnecessary. See
`priorities.md` #6, which also notes the rollout should start in report-only mode and will need
explicit disable comments on the two documented mount-only effects.

## Memoization: current snapshot

As of this check: **8 files** use `memo()` (8 call sites, one per file), **8 files** use
`useMemo` (12 call sites total), and **7 files** use `useCallback` (31 call sites total).

The 8 `memo()` sites fall into two groups, not one:

- Components on the streaming-chat render path, where the parent re-renders on every token:
  the six `ChatPage/*` components (`ChatActionTray.tsx:18`, `ChatAlerts.tsx:15`,
  `ChatComposer.tsx:16`, `ChatDisclaimerBanner.tsx:4`, `ChatMessageBubble.tsx:8`,
  `ChatRestartAction.tsx:14`) plus `ui/MessageBubble.tsx:15`.
- A zero-prop layout component that a parent re-renders for unrelated reasons:
  `layout/Sidebar.tsx:48`. Its memo always bails out because there is nothing to compare — it
  is not a chat-specific optimization, and `Sidebar` mounts on five routes, most without any
  streaming.

This is a snapshot, not a target. The counts are low because memoization here is a deliberate
response to per-token re-renders on one hot path, not a default applied everywhere —
`ManagerDashboardPage.tsx:311-340` derives roughly 15 values per render with plain consts and
no `useMemo`, and `ChatPage.tsx:38-46` runs an unmemoized `.filter()` inside the app's hottest
component. Do not read these numbers as "the repo should have more memoization" — the measured
baseline is that most of the app doesn't need it. A new component still needs its own
justification (a demonstrated re-render cost, or a prop crossing an existing memo boundary) to
add `memo()`, `useMemo`, or `useCallback` — not an appeal to "the repo already does this
elsewhere."

## The `QueryClient` defaults gap

`apps/web/src/app/query-client.ts` passes only `mutationCache` to `new QueryClient({...})` —
there is no `defaultOptions` key, and no `staleTime` or `refetchOnWindowFocus` override anywhere
in `apps/web/src`. TanStack Query 5 therefore runs every query at its defaults: `staleTime: 0`
and `refetchOnWindowFocus: true`.

This is the highest-leverage single fix in this domain, and the cascade is worth spelling out
because the app's own manual stabilization work exists specifically to prevent it:

1. Alt-tabbing back to a tab refetches every currently-mounted query (staleTime 0 means every
   query is immediately stale; refetch-on-focus means the refetch fires automatically).
2. A successful refetch produces a new `data` object identity, even when the response is
   byte-identical to what was already cached.
3. On the four admin tables, that new `data` identity busts the
   `useMemo(() => query.data ?? [], [query.data])` chain documented in CONFIRMED rules
   (`ManagerAdminManagersPage.tsx:39`, `ManagerAdminPeersPage.tsx:74`,
   `ManagerAdminSectorsPage.tsx:191-192`, `AdminInstitutionsPage.tsx:136-139`) — the memo's
   whole job is to hand `useDataTableSelection` a stable array reference, and a dependency
   change defeats that by design.
4. `useDataTableSelection` (`apps/web/src/presentation/ui/DataTable/useDataTableSelection.ts`)
   re-derives: `present` (:33), `selectedIds` (:34) and `selectedRows` (:35) are `useMemo`'d off
   `rows`, so a new `rows` reference recomputes all three, and the hook's return value
   (:48-86) is a fresh object literal every render regardless — new closures for `isSelected`,
   `toggle`, `toggleAll`, `clear`, plus freshly computed `edit`/`pause`/`activate`/`remove`
   state — so `DataTable` re-renders on the refetch even though nothing the user cares about
   changed.
5. `ManagerDashboardPage` (752 lines) refetches and re-renders as one unit on the same trigger.

None of steps 3-5 are bugs in the code that does them — the `useMemo(() => data ?? [])`
convention is correct and CONFIRMED elsewhere in this file's source data. The defect is one
config default upstream of all of it. Two lines in `query-client.ts` (a non-zero `staleTime`
and `refetchOnWindowFocus: false`) fix the cascade without touching any of the four files it
runs through. See `priorities.md` #5.

## Code splitting

The honest framing has two halves.

**Library-level splitting is real and works.** Four heavy third-party libraries are loaded with
`await import("pkg")` at the point of use rather than a top-level import: `jspdf`
(`download-manager-insight.ts:36`, `download-manager-pgr-report.ts:62`), `qrcode`
(`QrCodeModal.tsx:55`), and `qr-scanner` (`LinkInstitutionQrScanModal.tsx:37`,
`has-camera.ts:2`). This keeps manager-only and camera-only dependencies out of the initial
bundle a doctor downloads. A top-level `import type` from the same package alongside the
deferred runtime import is fine and expected (e.g. `LinkInstitutionQrScanModal.tsx:2` imports
`QrScanner`'s type at module scope) — it is erased at build time. Don't read "no top-level
import" as "no top-level anything," and don't replace a deferred library's types with `any` to
satisfy a stricter reading than the rule actually states.

**Route-level splitting covers the staff surfaces, and only those.** The 18 manager,
super-admin and peer-partner routes in `apps/web/src/app/router.tsx` load through
`lazy: { Component: lazyPage(...) }`. The 15 doctor-facing routes, the three crisis routes,
`ManagerShell` and `FallbackPage` stay statically imported. A doctor reaching `/home` no longer
downloads the manager panel or the admin tables: the entry chunk went from 793,015 to 621,140
bytes (230,748 → 185,680 gzip) when this landed.

Four rules hold this together, and each one is load-bearing:

- **Use the per-key object form, `lazy: { Component: ... }` — never the whole-route function
  form.** The object form leaves `loader` static, so an unauthenticated visit to `/manager`
  runs the guard and redirects *without* fetching the panel chunk. The function form would
  defer the loader too, shipping the chunk to someone who is about to be bounced. It also
  means the router blocks the navigation and keeps the current screen painted, which is why
  this app needs no `Suspense` boundary and no skeleton vocabulary for route loading.
- **Route through `lazyPage` (`app/lazy-route.ts`), not a bare `import()`.** It retries once,
  then reloads the page. A chunk whose hash no longer exists after a deploy is answered by both
  Vercel and the nginx image with `index.html` and a 200, so a bare import fails as an HTML
  parse error on core navigation; only a reload fixes that class.
- **Keep `path`, `index` and `children` statically declared.** React Router 8 forbids lazifying
  them (`UnsupportedLazyRouteObjectKey`), and `route-title.test.ts` / `app-header-meta.test.ts`
  flatten the tree on exactly those keys to assert both pathname lookup tables stay in step.
- **Routes live in `app/routes/`, one file per audience, each exporting a factory.**
  `doctor.routes.tsx`, `manager.routes.ts`, `peer-partner.routes.ts`, `super-admin.routes.ts` —
  the same axis the guards, shells and lazy chunks already follow. `router.tsx` composes them
  and keeps the `*` catch-all itself, so the "must be last" constraint stays visible in the
  composition root instead of hidden inside a group. A new route goes in its audience's file;
  a new audience gets a new file and one line in `createRouteChildren()`.
- **Build every router from `createRouteChildren()`, and inspect the `routeChildren` const.**
  React Router caches a resolved `lazy` property against the route object's identity, so a
  second router built from the same objects finds the cache entry but not the value, and the
  route stops matching. Production creates one router and never hits this; tests create one per
  case and hit it immediately. `router.test.tsx:332` still reads the `routeChildren` const for
  its `Component === ManagerShell` identity check — that is why `ManagerShell` stays eager.

`routeChildren` remains exported as an inspectable `RouteObject[]`, now produced by
`createRouteChildren()`. Four test files import one or the other; a split that stops exporting
either will silently desync the test router from what ships.

Two things this did **not** buy, stated so nobody claims them: the entry chunk is still over
Rollup's 500 kB warning (621 kB, 63% of it shared vendor), and the doctor's *total* bytes are
unchanged, because workbox's `globPatterns` sweeps every new chunk into the precache (41 → 83
entries, ~2.2 MiB either way). The win is first-paint critical path and parse/exec, not total
download. See `priorities.md` #14.

## Traps

The source data's CORRECTED section has five entries. Two are already folded into the sections
above (the two-group `memo()` split under Memoization; the `import type` clarification under
Code splitting). The remaining three are traps worth stating on their own, because each one
narrows a rule that reads more broadly than it actually is:

- **A stable function prop is necessary but not sufficient for a `memo()` boundary to hold.**
  Not every `useCallback` in `ChatPage.tsx` crosses a `memo()` boundary — `handleTranscriptRetry`
  and `handleTranscriptRecovered` are passed to `ui/ErrorBoundary.tsx`, a plain (non-memoized)
  class component, so wrapping them buys nothing and `handleTranscriptRetry` is re-wrapped in an
  inline arrow at its call site anyway. And a stable function prop doesn't protect a component
  whose other props aren't stable: `memo(MessageBubble)` is defeated on its own chat path
  because `ChatMessageBubble.tsx:26-33` passes it a freshly constructed `children` element
  whenever a streamed reply was interrupted — precisely the case the memo is meant to protect.
  Don't generalize from the 8 memoized components that every prop crossing a memo boundary is
  handled; check what each prop actually is, `children` included.

- **`useMemo(() => query.data ?? [], [query.data])` earns its keep only when the array feeds
  another hook's or memo's dependency array — not by default on every query result.** Where the
  array is only spread into JSX props, the `useMemo` buys nothing. The repo has one such inert
  site: `ManagerAdminSectorsPage.tsx:191`'s `managerList` feeds no dependency array — it's
  read only as a plain `managers={managerList}` prop and inside one `.find()` — so wrapping it
  was habit, not a load-bearing pattern. Don't cite "the repo always memoizes query results" as
  a rule; check whether the result actually flows into a downstream dependency array first.

- **A component that subscribes to a Zustand preference store to render the store's own value is
  the one legitimate exception to "read appearance preferences through CSS tokens, not by
  subscribing."** `components/settings/AppearanceSettings.tsx:15-19` subscribes to all four
  appearance fields (`density`, `accent`, `corners`, `fontSize`) because a settings control has
  to show which option is currently selected — a radio group can't do that from a CSS token
  alone. Nothing else in the app subscribes to those fields; `useApplyAppearancePrefs.ts` is
  still what projects them onto `<html>` for everything else to consume via CSS.

## How to verify

**Nothing in this document is gated by a tool.** `eslint-plugin-react-hooks` is not installed —
re-verified fresh, `grep -rn "react-hooks" package.json apps/web/package.json
packages/config/package.json packages/config/eslint.base.mjs` returns nothing — so the
`exhaustive-deps` caveat above is a reading rule, not a lint error you'll see. There is no
bundle-size budget, no render-count assertion in the suite, and no coverage gate. Every claim
here is a count you re-run:

```bash
# memoized components — 8 today
grep -rn "= memo(\|React.memo(" apps/web/src --include=*.tsx

# the QueryClient defaults gap (priorities.md #5) — expect no match
grep -n "defaultOptions" apps/web/src/app/query-client.ts

# route-level code splitting (priorities.md #14) — expect 0; every page is a static import
grep -c "lazy(" apps/web/src/app/router.tsx

# the export any future split must preserve, and its one consumer
grep -n "routeChildren" apps/web/src/app/router.tsx apps/web/src/app/router.test.tsx

# the hooks plugin that would enforce the deps rule — expect nothing
grep -rn "react-hooks" package.json apps/web/package.json packages/config/package.json   packages/config/eslint.base.mjs
```

The one thing CI *does* catch is a route split that breaks the route tree: `router.test.tsx`
builds its router from the `routeChildren` export, so `pnpm --filter @zelo/web test -- router`
fails if a split stops exporting it. It will not fail if the split simply doesn't reduce the
initial bundle.
