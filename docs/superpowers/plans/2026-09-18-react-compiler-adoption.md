# React Compiler Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on `babel-plugin-react-compiler` for all of `apps/web/src`, with real per-build
coverage reporting, two genuine code fixes verified against the actual compiler (not guessed),
and two tracked-not-fixable findings documented rather than silently ignored.

**Architecture:** The compiler is wired into `apps/web/vite.config.ts` via `@vitejs/plugin-react`'s
existing `babel.plugins` option — no dependency upgrade, no bundler change.
`panicThreshold: "none"` (the React team's own stated production recommendation, and the only
setting that doesn't leave the build permanently red on this codebase — `critical_errors` was
measured to fail identically to `all_errors`). A `logger.logEvent` callback prints a per-build
compiled/error count, since a `none`-threshold build otherwise bails out completely silently —
measured directly: zero console output on 26 real bailouts before this plan's coverage report
existed.

**Tech Stack:** `babel-plugin-react-compiler@1.0.0`, React 19.2, Vite 6.4.3,
`@vitejs/plugin-react@4.7.0`.

**Spec:** `docs/superpowers/specs/2026-09-18-react-compiler-adoption-design.md`

## Global Constraints

- `babel-plugin-react-compiler` version: exactly `1.0.0`.
- `target: "19"` (React 19 ships the runtime helpers built in — no `react-compiler-runtime`
  package needed).
- `panicThreshold: "none"` — measured, not assumed: `critical_errors` failed the build on the
  exact same `refs` finding `all_errors` did (`ScaleAssessmentPage.tsx`'s `pageJustMountedRef`),
  so there is no functional middle ground between `none` and `all_errors` for this codebase's
  current error mix, and react.dev states `none` is what production builds should use.
- `compilationMode` stays at its default (`"infer"`) — whole-app, no directory scoping, no
  `"use memo"` annotations.
- Every fix in this plan was verified against a real build with the compiler actually running,
  not inferred from the eslint-rule approximation alone — item #6's static analysis and the
  real compiler disagree in both directions (two files the real compiler flags that
  `eslint-plugin-react-hooks` never did; `react-compiler-healthcheck`'s own coarse
  "218/218 compiled" summary undercounts real per-event bailouts, confirmed by direct
  comparison against the per-event `logger` output — do not cite the healthcheck number as
  ground truth anywhere in this plan's output).
- Final state: `pnpm --filter @zelo/web build` exits 0, full test suite stays at 193 files /
  2360 tests.

---

## Task 1: Wire the plugin, config, and coverage logger

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Produces: every `apps/web` build (dev and prod) now runs the compiler across
  `apps/web/src/**/*.{ts,tsx}` and prints one line per file that fails to compile, plus a final
  summary line. Every later task in this plan depends on this being in place to verify its own
  fix against.

- [ ] **Step 1: Add the devDependency**

Run from the repo root:

```bash
pnpm --filter @zelo/web add -D babel-plugin-react-compiler@1.0.0
```

- [ ] **Step 2: Verify the install**

Run: `node -e "console.log(require('./apps/web/package.json').devDependencies['babel-plugin-react-compiler'])"`
Expected: `1.0.0` (or `^1.0.0` — whatever pnpm wrote).

- [ ] **Step 3: Wire the plugin and logger into `vite.config.ts`**

Replace:

```ts
  plugins: [
    react(),
    tailwindcss(),
```

with:

```ts
  plugins: [
    react({
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              target: "19",
              panicThreshold: "none",
              logger: {
                logEvent(filename: string, event: { kind: string }) {
                  if (event.kind === "CompileError") reactCompilerErrorCount += 1;
                  if (event.kind === "CompileSuccess") reactCompilerSuccessCount += 1;
                },
              },
            },
          ],
        ],
      },
    }),
    tailwindcss(),
```

Then, just above `export default defineConfig({` (after the existing `rawApiBaseUrl` validation
block), add:

```ts
let reactCompilerSuccessCount = 0;
let reactCompilerErrorCount = 0;
process.on("exit", () => {
  if (reactCompilerSuccessCount + reactCompilerErrorCount === 0) return;
  console.log(
    `react-compiler: ${reactCompilerSuccessCount}/${reactCompilerSuccessCount + reactCompilerErrorCount} compiled, ${reactCompilerErrorCount} bailed out`,
  );
});
```

(`process.on("exit", ...)` rather than printing inline: the plugin's `logEvent` fires once per
analyzed function throughout the whole build, potentially interleaved with other build output —
accumulating counters and printing one summary line at process exit keeps the signal readable
instead of scattering dozens of lines through the build log.)

- [ ] **Step 4: Run a build and confirm the summary line appears**

Run: `pnpm --filter @zelo/web build`
Expected: exits 0. Near the end of the output, a line matching
`react-compiler: 197/223 compiled, 26 bailed out` (these exact numbers were measured during
planning against the codebase as of this plan's authoring — if they differ, that's expected if
files changed since; the important thing is the line appears at all and the two numbers sum to
the total).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/vite.config.ts
git commit -m "build(web): wire babel-plugin-react-compiler with a coverage logger"
```

---

## Task 2: Fix — `LinkInstitutionQrScanModal.tsx`'s dynamic import

**Files:**
- Modify: `apps/web/src/presentation/components/LinkInstitutionQrScanModal.tsx`

**Why this works:** the compiler's HIR lowering doesn't yet support a dynamic `import()`
expression inside a function it's analyzing. `compilationMode: "infer"` only analyzes
component-shaped (PascalCase, returns JSX) or hook-shaped (`use`-prefixed) functions — a plain
module-level helper function matches neither, so extracting the `import()` into one moves it
entirely outside the compiler's analysis. Verified during planning: this fully clears the
finding, with zero behavior change (the returned promise is identical either way), and this
file's full-app test suite run stayed green.

- [ ] **Step 1: Add the extracted loader function**

Replace:

```tsx
const CAMERA_ERROR = "Não conseguimos acessar a câmera. Digite o código manualmente.";
```

with:

```tsx
const CAMERA_ERROR = "Não conseguimos acessar a câmera. Digite o código manualmente.";

// Kept as a plain module-level function, not inlined into the effect below:
// React Compiler's HIR lowering doesn't yet support dynamic `import()`
// expressions inside a component/hook it's analyzing, and this function's
// shape (not PascalCase, not `use*`-prefixed) keeps it outside that analysis
// entirely.
function loadQrScanner() {
  return import("qr-scanner");
}
```

- [ ] **Step 2: Use the loader in the effect**

Replace:

```tsx
    (async () => {
      // Vite bundles the decode worker on its own via the dynamic import
      // inside qr-scanner itself — no manual WORKER_PATH wiring needed.
      const { default: QrScannerCtor } = await import("qr-scanner");
```

with:

```tsx
    (async () => {
      // Vite bundles the decode worker on its own via the dynamic import
      // inside qr-scanner itself — no manual WORKER_PATH wiring needed.
      const { default: QrScannerCtor } = await loadQrScanner();
```

- [ ] **Step 3: Verify against the real compiler**

Run: `pnpm --filter @zelo/web build 2>&1 | grep -i "LinkInstitutionQrScanModal"`
Expected: no output — this file no longer appears in any compiler error.

- [ ] **Step 4: Confirm the summary count improved**

Run: `pnpm --filter @zelo/web build 2>&1 | grep "react-compiler:"`
Expected: `react-compiler: 198/223 compiled, 25 bailed out` (one more success than Task 1's
197/26 baseline — Task 3 fixes the second of the two files this plan resolves, so don't expect
24 yet if Task 3 hasn't landed).

- [ ] **Step 5: Run the app-wide test suite**

This file has no dedicated test (a pre-existing gap, not this task's job to fill) and no other
test file references it directly — run the full suite as the safety net:

Run: `pnpm --filter @zelo/web test`
Expected: 193 files / 2360 tests pass, unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/components/LinkInstitutionQrScanModal.tsx
git commit -m "fix(web): move qr-scanner's dynamic import outside React Compiler's analysis"
```

---

## Task 3: Fix — `ChatComposer.tsx`'s latest-ref pattern

**Files:**
- Modify: `apps/web/src/presentation/pages/ChatPage/ChatComposer.tsx`

**Why this works:** the same "latest ref" pattern already fixed once in
`docs/conventions/priorities.md` #6's `useHotkey.ts` (moving a render-body ref write into a
`useLayoutEffect` with no dependency array). Safe here for the same reason it was safe there:
`textRef.current` is only read later, inside the unmount cleanup function
(`if (textRef.current.trim().length === 0) return;`) — not synchronously within the same render
— so there's no staleness window analogous to the one that ruled this fix out for
`useDebouncedSearch.ts` in item #6. This finding was invisible to `eslint-plugin-react-hooks`'s
static analysis entirely — it only surfaced from running the real compiler, which is this
whole plan's reason to exist.

- [ ] **Step 1: Add the `useLayoutEffect` import**

Replace:

```tsx
import { memo, useCallback, useEffect, useRef, useState } from 'react';
```

with:

```tsx
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Move the ref write into a layout effect**

Replace:

```tsx
  const [text, setText] = useState('');
  const textRef = useRef(text);
  textRef.current = text;
```

with:

```tsx
  const [text, setText] = useState('');
  const textRef = useRef(text);
  useLayoutEffect(() => {
    textRef.current = text;
  });
```

- [ ] **Step 3: Verify against the real compiler**

Run: `pnpm --filter @zelo/web build 2>&1 | grep -i "ChatComposer"`
Expected: no output.

- [ ] **Step 4: Confirm the summary count**

Run: `pnpm --filter @zelo/web build 2>&1 | grep "react-compiler:"`
Expected: `react-compiler: 199/223 compiled, 24 bailed out` (assuming Task 2 already landed —
both fixes together move the baseline from 197/26 to 199/24).

- [ ] **Step 5: Run the tests that exercise this component**

`ChatComposer.tsx` has no dedicated test file; it's exercised indirectly through `ChatPage`'s
own suites, including a test that specifically covers the unmount-cleanup path this fix touches
("does not record when the message was sent instead of abandoned").

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ChatPage/ChatPage.test.tsx src/presentation/pages/ChatPage/ChatPage.transcript-crash.test.tsx`
Expected: both files pass, 88 tests total.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/pages/ChatPage/ChatComposer.tsx
git commit -m "fix(web): move ChatComposer's latest-ref write into useLayoutEffect"
```

---

## Task 4: Document the two tracked-not-fixable findings

**Files:**
- Modify: `apps/web/src/presentation/components/QrCodeModal.tsx`
- Modify: `apps/web/src/presentation/hooks/useChatConversation.ts`

**Why these are tracked, not fixed:** both were tried during planning. `QrCodeModal.tsx`'s
dynamic `import("qrcode")` was extracted the same way `LinkInstitutionQrScanModal.tsx`'s was
(Task 2) — that specific error cleared, but revealed a *second*, deeper compiler limitation
underneath: `"Support value blocks (conditional, logical, optional chaining, etc) within a
try/catch statement"`, triggered by the plain `if (!canvas || cancelled) return;` inside the
try block. `useChatConversation.ts`'s `try/finally` was converted to `try/catch` with an
explicit `cleanup()` call at every exit path (mathematically equivalent to the original
`finally`, verified against all 14 of the hook's own tests plus the file's other consumers) —
same result: the `finally`-specific error cleared, and the identical "value blocks within
try/catch" error appeared underneath (this hook's `try` body has several `if` statements).
Resolving *that* would mean restructuring control flow out of try/catch entirely in the app's
most complex streaming hook, for uncertain payoff — the user's explicit call was to accept these
two as not-yet-fixable rather than push further into a live, immature compiler limitation.
`panicThreshold: "none"` (Task 1) already makes this safe: both files simply don't get optimized,
same as before this plan started, with no build failure.

- [ ] **Step 1: Add a tracking comment to `QrCodeModal.tsx`**

Replace:

```tsx
// qrcode is loaded lazily — every session pays for it only once it actually
// opens a QR modal, not on every visit to the list that can open one.
export function QrCodeModal({
```

with:

```tsx
// qrcode is loaded lazily — every session pays for it only once it actually
// opens a QR modal, not on every visit to the list that can open one.
//
// React Compiler doesn't optimize this component today: the `if (!canvas ||
// cancelled) return;` inside the try block below hits a real compiler
// limitation ("Support value blocks... within a try/catch statement"), not a
// Rules-of-React violation — tracked in docs/conventions/priorities.md, not
// fixed here. panicThreshold: "none" means this is a safe, silent bailout,
// not a build failure.
export function QrCodeModal({
```

- [ ] **Step 2: Add a tracking comment to `useChatConversation.ts`**

Replace:

```ts
/**
 * Uses plain React state instead of TanStack Query: TanStack Query models a
 * single request → response cycle, but this hook consumes an incremental
 * token stream and must re-render on every chunk. The spec's "TanStack Query
 * lives in presentation/hooks" rule is honored in spirit — this is still the
 * hooks layer, just using the primitive that actually fits a streaming case.
 */
export function useChatConversation(conversationId: string) {
```

with:

```ts
/**
 * Uses plain React state instead of TanStack Query: TanStack Query models a
 * single request → response cycle, but this hook consumes an incremental
 * token stream and must re-render on every chunk. The spec's "TanStack Query
 * lives in presentation/hooks" rule is honored in spirit — this is still the
 * hooks layer, just using the primitive that actually fits a streaming case.
 *
 * React Compiler doesn't optimize this hook today: `runStream`'s try block
 * has several plain `if` statements, and the compiler hits a real limitation
 * ("Support value blocks... within a try/catch statement") analyzing them —
 * not a Rules-of-React violation. Tracked in docs/conventions/priorities.md,
 * not fixed here; panicThreshold: "none" means this is a safe, silent
 * bailout, not a build failure.
 */
export function useChatConversation(conversationId: string) {
```

- [ ] **Step 3: Verify no behavior changed**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/components/QrCodeModal.test.tsx src/presentation/hooks/useChatConversation.test.ts`
Expected: both pass (2 + 14 = 16 tests) — these are comment-only changes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/presentation/components/QrCodeModal.tsx apps/web/src/presentation/hooks/useChatConversation.ts
git commit -m "docs(web): note the two React Compiler findings that stay tracked, not fixed"
```

---

## Task 5: Bundle size and final verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Record the bundle size**

Run: `pnpm --filter @zelo/web build 2>&1 | grep -E "index-.*\.js"`
Expected: the entry chunk is close to `675 kB` (gzip ~206 kB) — up from the pre-compiler
baseline of `620.81 kB` (gzip 185.70 kB, recorded in `docs/conventions/priorities.md` #5) by
roughly 8-9%, from the injected `react/compiler-runtime` memoization calls. This is expected and
not a regression to chase — the point of this change is runtime re-render behavior, not bundle
size, and the spec explicitly said the size direction isn't predictable going in.

- [ ] **Step 2: Confirm the final coverage number**

Run: `pnpm --filter @zelo/web build 2>&1 | grep "react-compiler:"`
Expected: `react-compiler: 199/223 compiled, 24 bailed out`.

- [ ] **Step 3: Full verification sweep**

Run: `pnpm --filter @zelo/web test` — expect 193 files / 2360 tests, exit 0.
Run: `pnpm turbo run lint lint:boundaries build --filter=@zelo/web` — expect exit 0.

- [ ] **Step 4: Prove the config actually does something**

Same discipline as every other guard in `docs/conventions/priorities.md`: temporarily remove the
`babel` block from `apps/web/vite.config.ts`'s `react()` call, rebuild, and confirm the
`react-compiler:` summary line disappears entirely (proving the line's presence in Steps 1-2 was
caused by this plan's config, not something else). Restore it and confirm the line reappears
with the same 199/24 split.

```bash
git stash push -- apps/web/vite.config.ts
pnpm --filter @zelo/web build 2>&1 | grep "react-compiler:" # expect: no output
git stash pop
pnpm --filter @zelo/web build 2>&1 | grep "react-compiler:" # expect: react-compiler: 199/223 compiled, 24 bailed out
```

- [ ] **Step 5: Add a `docs/conventions/priorities.md` entry**

This is new work, not a numbered backlog item being closed — add it as the next number after the
highest-numbered existing entry (check the file for the current highest number before writing;
do not assume it's still #26). Follow the same structure `docs/conventions/priorities.md` #6
uses (a `— FIXED`-suffixed heading is wrong here since this isn't closing a prior entry; title
it `## <N>. React Compiler is not installed — DONE` or similar, matching the file's tone) and
cover, in your own words matching that file's terse, evidence-first style:

- What's on: `babel-plugin-react-compiler@1.0.0`, `target: "19"`, `panicThreshold: "none"`,
  whole-app (`compilationMode: "infer"`), with the reasoning that `critical_errors` measured
  identically to `all_errors` and `none` is react.dev's own stated production recommendation.
- The measured coverage: 199/223 compiled, 24 bailed out (breakdown: 10 tracked
  `incompatible-library` from item #6, 11 `refs` findings already tracked in item #6
  [`ScaleAssessmentPage.tsx` ×4, `useDebouncedSearch.ts` ×2, `Tooltip.tsx` ×5], 1
  `AssessmentReview.tsx` skipped purely because it carries an `eslint-disable` for a react-hooks
  rule — the real compiler treats any such disable as a signal to skip the whole component,
  confirmed by this plan's own measurement, 2 genuine compiler-tooling limitations tracked in
  `QrCodeModal.tsx`/`useChatConversation.ts` per Task 4).
- The two real fixes this plan shipped (`LinkInstitutionQrScanModal.tsx`,
  `ChatComposer.tsx`) and that `ChatComposer.tsx`'s finding was invisible to
  `eslint-plugin-react-hooks`'s static analysis — direct evidence the eslint rules and the real
  compiler don't fully agree, in both directions.
- The `react-compiler-healthcheck` discrepancy: its own summary claimed "218/218 compiled, no
  incompatible libraries" against this exact codebase, which is wrong by the compiler's own
  later, more precise measurement (10 `incompatible-library` bailouts alone) — record this as a
  trap for whoever reads this next: don't trust `react-compiler-healthcheck`'s summary as ground
  truth, use a real build's `logger`-based count instead.
- "Proven to fire" — Task 5 Step 4's revert-and-restore result.

- [ ] **Step 6: Commit**

```bash
git add docs/conventions/priorities.md
git commit -m "docs: record React Compiler adoption in priorities.md"
```
