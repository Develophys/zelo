# eslint-plugin-react-hooks Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt `eslint-plugin-react-hooks`'s full `recommended` preset (16 rules) in `apps/web`,
resolving every `error`-severity finding (fix or justified suppression) and the one real
`warn`-severity `exhaustive-deps` finding, while leaving the 10 `incompatible-library` warnings
in place as a tracked worklist for the future React Compiler adoption.

**Architecture:** `eslint-plugin-react-hooks` becomes a devDependency of `apps/web` only.
`apps/web/eslint.config.mjs` layers the plugin's `recommended` flat config on top of the shared
`@zelo/config/eslint.base` export; `packages/config/eslint.base.mjs` is untouched. Every one of
the 44 measured findings gets an explicit, individually-decided resolution — 11 are real code
fixes (verified empirically during planning), 33 are suppressed with a one-line reason each. No
finding is silently ignored.

**Tech Stack:** ESLint 9 flat config, `eslint-plugin-react-hooks@7.1.1`, React 19.2, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-18-eslint-react-hooks-design.md`

## Global Constraints

- `eslint-plugin-react-hooks` version: exactly `7.1.1` (the current stable major — the React
  Compiler-era rewrite; do not substitute an older major).
- Config uses `reactHooks.configs.flat.recommended` verbatim — no rule severities are
  overridden anywhere.
- Every `eslint-disable-next-line` added by this plan carries a `-- reason` clause. No bare
  disable comment.
- `incompatible-library` findings (10, all `react-hook-form`'s `watch()`) are **not touched** by
  this plan — they stay as tracked `warn`s.
- Final state: `pnpm --filter @zelo/web lint` exits 0.

---

## Task 1: Wire the plugin and config

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/eslint.config.mjs`

**Interfaces:**
- Produces: `apps/web/eslint.config.mjs` now enforces `react-hooks/*` rules on every
  `**/*.{ts,tsx}` file under `apps/web/src`. Every later task in this plan depends on this
  config existing before its own fixes/suppressions can be verified.

- [ ] **Step 1: Add the devDependency**

Run from the repo root:

```bash
pnpm --filter @zelo/web add -D eslint-plugin-react-hooks@7.1.1
```

- [ ] **Step 2: Verify the install**

Run: `node -e "console.log(require('./apps/web/package.json').devDependencies['eslint-plugin-react-hooks'])"`
Expected: `^7.1.1` (or `7.1.1` — whatever pnpm wrote)

- [ ] **Step 3: Rewrite the config**

Replace the full contents of `apps/web/eslint.config.mjs` with:

```js
import base from "@zelo/config/eslint.base";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
  },
];
```

- [ ] **Step 4: Run lint and confirm the expected finding count**

Run: `pnpm --filter @zelo/web lint`
Expected: **exits 1**, with error/warning output. This is correct at this point in the plan —
Tasks 2-8 resolve every finding; do not attempt to make this exit 0 yet. If you want to sanity
check the count, `pnpm --filter @zelo/web lint 2>&1 | grep -c "react-hooks/"` should print
something close to 44 (findings printed across multiple lines per finding, so this is a rough
sanity check, not an exact count — the exact count is verified in Task 9).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/eslint.config.mjs pnpm-lock.yaml
git commit -m "build(web): wire eslint-plugin-react-hooks recommended preset"
```

(If `pnpm-lock.yaml` only changed at the repo root, only stage that one; do not invent a
`apps/web/pnpm-lock.yaml` path if pnpm didn't create one — check `git status` before staging.)

---

## Task 2: Fix — `useInlineConfirm()` consumers (destructure at the call site)

**Files:**
- Modify: `apps/web/src/presentation/components/InstitutionLinkCard.tsx`
- Modify: `apps/web/src/presentation/components/PeerChatRoom.tsx`

**Interfaces:**
- Consumes: `useInlineConfirm()` from `apps/web/src/presentation/hooks/useInlineConfirm.ts`,
  returning `{ isConfirming, triggerRef, confirmRef, requestConfirm, cancel }` — unchanged,
  this task only changes how callers consume that return value.

**Why destructuring fixes it:** `react-hooks/refs` flags *any* property access on a value
returned by a hook whose return type contains a ref (`unlinkConfirm.confirmRef`,
`unlinkConfirm.cancel` — even non-ref properties on the same object get flagged, because the
compiler's static analysis can't prove which properties are ref-free). Destructuring into
separately named `const`s at the call site, immediately after the hook call, gives the compiler
plain local bindings instead of a member-access chain — verified empirically during planning:
this clears all 4 violations in `InstitutionLinkCard.tsx` with zero behavior change.

- [ ] **Step 1: Fix `InstitutionLinkCard.tsx`**

Replace:

```tsx
  const unlinkConfirm = useInlineConfirm();
```

with:

```tsx
  const {
    isConfirming: unlinkIsConfirming,
    triggerRef: unlinkTriggerRef,
    confirmRef: unlinkConfirmRef,
    requestConfirm: unlinkRequestConfirm,
    cancel: unlinkCancel,
  } = useInlineConfirm();
```

Then replace every other use of `unlinkConfirm.X` in the same file with the destructured name:
- `unlinkConfirm.isConfirming` → `unlinkIsConfirming`
- `unlinkConfirm.confirmRef` → `unlinkConfirmRef`
- `unlinkConfirm.cancel` → `unlinkCancel`
- `unlinkConfirm.triggerRef` → `unlinkTriggerRef`
- `unlinkConfirm.requestConfirm` → `unlinkRequestConfirm`

(Five call sites total, all inside the JSX returned near the end of the component — the
`if (unlinkIsConfirming)` branch and the final `return`.)

- [ ] **Step 2: Verify `InstitutionLinkCard.tsx`'s refs findings are gone**

Run: `pnpm --filter @zelo/web exec eslint src/presentation/components/InstitutionLinkCard.tsx`
Expected: no `react-hooks/refs` findings remain in the output. (A `react-hooks/set-state-in-effect`
finding at line ~51 is expected to still be there — Task 7 handles it, not this task.)

- [ ] **Step 3: Fix `PeerChatRoom.tsx`**

Replace:

```tsx
  const leaveConfirm = useInlineConfirm();
```

with:

```tsx
  const {
    isConfirming: leaveIsConfirming,
    triggerRef: leaveTriggerRef,
    confirmRef: leaveConfirmRef,
    requestConfirm: leaveRequestConfirm,
    cancel: leaveCancel,
  } = useInlineConfirm();
```

Then replace every other use of `leaveConfirm.X` in the same file:
- `leaveConfirm.isConfirming` → `leaveIsConfirming`
- `leaveConfirm.confirmRef` → `leaveConfirmRef`
- `leaveConfirm.cancel` → `leaveCancel`
- `leaveConfirm.triggerRef` → `leaveTriggerRef`
- `leaveConfirm.requestConfirm` → `leaveRequestConfirm`

(All five call sites are inside the final `<div className="mt-3">...</div>` block near the end
of the component.)

- [ ] **Step 4: Verify `PeerChatRoom.tsx`**

Run: `pnpm --filter @zelo/web exec eslint src/presentation/components/PeerChatRoom.tsx`
Expected: no `react-hooks/refs` findings.

- [ ] **Step 5: Run the existing tests for both components**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/components/InstitutionLinkCard.test.tsx src/presentation/components/PeerChatRoom.test.tsx`
Expected: all tests pass, unchanged — this is a pure rename, no behavior changed. (If either
test file doesn't exist under that exact name, run
`pnpm --filter @zelo/web exec vitest run --reporter=basic src/presentation/components/` and
confirm both components' test files, whatever they're named, still pass.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/components/InstitutionLinkCard.tsx apps/web/src/presentation/components/PeerChatRoom.tsx
git commit -m "fix(web): destructure useInlineConfirm() at the call site"
```

---

## Task 3: Fix — `useHotkey.ts`'s latest-ref pattern

**Files:**
- Modify: `apps/web/src/presentation/hooks/useHotkey.ts`

**Interfaces:**
- No change to `useHotkey`'s exported signature or behavior — internal-only.

**Why `useLayoutEffect` is safe here (and wasn't for `useDebouncedSearch.ts`, see Task 5):**
`handlerRef.current` is only ever read later, inside a closure invoked by the hotkey store when
a real keypress fires — asynchronously, well after any layout effect for the current render has
already committed. There is no synchronous-same-render read (unlike `useDebouncedSearch.ts`'s
`useMemo`), so moving the write into a `useLayoutEffect` with no dependency array (runs after
every render, before paint) introduces no staleness window. Verified empirically during
planning: this clears the one `react-hooks/refs` finding.

- [ ] **Step 1: Add the `useLayoutEffect` import**

Replace:

```ts
import { useEffect, useRef } from "react";
```

with:

```ts
import { useEffect, useLayoutEffect, useRef } from "react";
```

- [ ] **Step 2: Move the ref write into a layout effect**

Replace:

```ts
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
```

with:

```ts
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @zelo/web exec eslint src/presentation/hooks/useHotkey.ts`
Expected: no `react-hooks/*` findings — this file had exactly one (`refs`), now resolved.

- [ ] **Step 4: Run the existing test for this hook**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/hooks/useHotkey.test.tsx`
Expected: passes unchanged. (If no test file exists under that name, search
`apps/web/src/presentation/hooks/` for the actual test file covering `useHotkey` and run that.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/hooks/useHotkey.ts
git commit -m "fix(web): move useHotkey's latest-ref write into useLayoutEffect"
```

---

## Task 4: Fix — `ScaleAssessmentPage.tsx`'s ref usage

**Files:**
- Modify: `apps/web/src/presentation/pages/ScaleAssessmentPage.tsx`

**Interfaces:**
- No change to `ScaleAssessmentPage`'s props or rendered output — internal-only.

This file has 2 distinct `refs` situations, handled differently:

**A. `resumed` (3 findings, real fix).** `useRef(recallDraft(scale))` exists solely to compute
`recallDraft(scale)` once and read it inside three `useState(() => ...)` lazy initializers.
`useState`'s own lazy initializer *also* runs exactly once, at mount — so replacing the `useRef`
with a second `useState` gives identical "compute once" semantics without any `.current` access
anywhere. Verified empirically during planning: this clears all 3 findings.

**B. `pageJustMountedRef` (2 findings, suppressed).** This ref exists specifically to avoid a
re-render: `pageJustMountedRef.current = false` (written in a mount effect) never triggers a
re-render, and its value is read directly in a prop expression during render. Converting it to
`useState` would work for the linter, but would introduce a genuine extra re-render right after
mount — working directly against `docs/conventions/priorities.md` #5 (the `QueryClient`
`staleTime` fix), which exists to *eliminate* unforced re-renders in this app. The actual risk
the rule warns about (a ref read returning inconsistent values across multiple render attempts
of the same commit) doesn't apply in a way that matters here — this value only ever transitions
once, from `true` to `false`, and is never read inconsistently within a single render. Suppress,
don't rewrite.

- [ ] **Step 1: Replace the `resumed` ref with `useState`**

Replace:

```tsx
  const resumed = useRef(recallDraft(scale));
  const [answers, setAnswers] = useState<(number | undefined)[]>(
    () => resumed.current?.answers ?? new Array(scale.questions.length).fill(undefined),
  );
  // One cursor for the whole instrument: 0..total-1 are questions, `total` is
  // the review. Answering the last item advances here rather than submitting.
  const [questionIndex, setQuestionIndex] = useState(() => resumed.current?.questionIndex ?? 0);
  const [submitError, setSubmitError] = useState(false);
  const [showResumed, setShowResumed] = useState(() => (resumed.current?.questionIndex ?? 0) > 0);
```

with:

```tsx
  const [resumed] = useState(() => recallDraft(scale));
  const [answers, setAnswers] = useState<(number | undefined)[]>(
    () => resumed?.answers ?? new Array(scale.questions.length).fill(undefined),
  );
  // One cursor for the whole instrument: 0..total-1 are questions, `total` is
  // the review. Answering the last item advances here rather than submitting.
  const [questionIndex, setQuestionIndex] = useState(() => resumed?.questionIndex ?? 0);
  const [submitError, setSubmitError] = useState(false);
  const [showResumed, setShowResumed] = useState(() => (resumed?.questionIndex ?? 0) > 0);
```

- [ ] **Step 2: Suppress the two `pageJustMountedRef` reads**

Find:

```tsx
                riskItemIndex={scale.type === 'PHQ-9' ? PHQ9_RISK_ITEM_INDEX : undefined}
                focusOnMount={!pageJustMountedRef.current}
```

Replace with:

```tsx
                riskItemIndex={scale.type === 'PHQ-9' ? PHQ9_RISK_ITEM_INDEX : undefined}
                // eslint-disable-next-line react-hooks/refs -- read-only after mount; converting to state would add an unforced re-render (see priorities.md #5)
                focusOnMount={!pageJustMountedRef.current}
```

Find (the `QuestionCard` branch):

```tsx
              disabled={isPending}
              focusOnMount={!pageJustMountedRef.current}
            />
```

Replace with:

```tsx
              disabled={isPending}
              // eslint-disable-next-line react-hooks/refs -- read-only after mount; converting to state would add an unforced re-render (see priorities.md #5)
              focusOnMount={!pageJustMountedRef.current}
            />
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @zelo/web exec eslint src/presentation/pages/ScaleAssessmentPage.tsx`
Expected: no `react-hooks/refs` findings remain.

- [ ] **Step 4: Run the existing test for this page**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ScaleAssessmentPage.test.tsx`
Expected: passes unchanged. If the file isn't named exactly that, find the real test file
covering `ScaleAssessmentPage` and run it — pay particular attention to any test asserting on
resumed-draft behavior (answers/questionIndex restored from a saved draft), since Step 1 touches
that code path directly even though it's designed to be behaviorally identical.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ScaleAssessmentPage.tsx
git commit -m "fix(web): resolve ScaleAssessmentPage's react-hooks/refs findings"
```

---

## Task 5: Suppress — `useDebouncedSearch.ts`

**Files:**
- Modify: `apps/web/src/presentation/hooks/useDebouncedSearch.ts`

**Why this is a suppression, not a fix:** the obvious fix (move the ref write into a
`useLayoutEffect`, same as Task 3) was tried during planning and rejected: `toHaystackRef.current`
is read inside `useMemo`'s compute function, which runs *synchronously during the same render*
that produces the write — but a `useLayoutEffect` runs *after* that render commits. That
ordering change means `useMemo` would read the *previous* render's `toHaystack` on any render
where both `rows`/`query` and `toHaystack` change together — a real, if narrow, staleness bug
that the original code (writing the ref inline, before the `useMemo` call, in the same
synchronous function body) does not have. Keep the original code exactly as-is; suppress both
findings with that reasoning.

- [ ] **Step 1: Suppress the ref write**

Replace:

```ts
  const toHaystackRef = useRef(toHaystack);
  toHaystackRef.current = toHaystack;
```

with:

```ts
  const toHaystackRef = useRef(toHaystack);
  // eslint-disable-next-line react-hooks/refs -- must be read synchronously inside useMemo below; a useLayoutEffect write would be one render stale
  toHaystackRef.current = toHaystack;
```

- [ ] **Step 2: Suppress the ref read**

Replace:

```ts
  const filtered = useMemo(() => {
    if (query === "") return rows;
    return rows.filter((row) => normalize(toHaystackRef.current(row)).includes(query));
  }, [rows, query]);
```

with:

```ts
  const filtered = useMemo(() => {
    if (query === "") return rows;
    // eslint-disable-next-line react-hooks/refs -- toHaystackRef is written synchronously above, before this render's useMemo runs
    return rows.filter((row) => normalize(toHaystackRef.current(row)).includes(query));
  }, [rows, query]);
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @zelo/web exec eslint src/presentation/hooks/useDebouncedSearch.ts`
Expected: no `react-hooks/*` findings.

- [ ] **Step 4: Run the existing test for this hook**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/hooks/useDebouncedSearch.test.ts`
Expected: passes unchanged — no code behavior changed, only comments added.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/hooks/useDebouncedSearch.ts
git commit -m "chore(web): suppress useDebouncedSearch's react-hooks/refs findings"
```

---

## Task 6: Suppress — `Tooltip.tsx`

**Files:**
- Modify: `apps/web/src/presentation/ui/Tooltip.tsx`

**Why this is a suppression, not a fix:** all 5 findings are the compiler flagging "a ref (or a
closure that touches one) is passed as an argument to a function called during render" — here,
the file's own `chain(existingHandler, newHandler)` helper, called during render to compose
`cloneElement`'s event-handler props. The flagged closures (`clearPress`, the inline
`onPointerLeave`/`onPointerDown`/`onPointerCancel` handlers, and `mergeRefs([childRef,
triggerRef])`) only ever *execute* later, as real event handlers or inside `useMemo`'s stable
identity — not synchronously during the render call itself. `Tooltip.tsx` is a shared,
widely-used interactive UI primitive (hover, long-press, click, focus, keyboard); rewriting
its handler-composition architecture to satisfy a static analysis that can't see through a
locally-defined higher-order function is disproportionate risk for a lint-adoption task.

- [ ] **Step 1: Suppress the `mergeRefs` finding**

Replace:

```tsx
  const childRef = children.props.ref as Ref<HTMLElement> | undefined;
  const mergedRef = useMemo(() => mergeRefs<HTMLElement>([childRef, triggerRef]), [childRef]);
```

with:

```tsx
  const childRef = children.props.ref as Ref<HTMLElement> | undefined;
  const mergedRef = useMemo(
    // eslint-disable-next-line react-hooks/refs -- mergeRefs only reads .current when the merged ref itself is invoked by React, not during this call
    () => mergeRefs<HTMLElement>([childRef, triggerRef]),
    [childRef],
  );
```

- [ ] **Step 2: Suppress the `onPointerLeave` finding**

Replace:

```tsx
    onPointerLeave: chain<PointerEvent>(children.props.onPointerLeave, () => {
      clearPress();
      setOpen(false);
    }),
```

with:

```tsx
    // eslint-disable-next-line react-hooks/refs -- the wrapped handler only runs later, as a real pointer event, never during this render
    onPointerLeave: chain<PointerEvent>(children.props.onPointerLeave, () => {
      clearPress();
      setOpen(false);
    }),
```

- [ ] **Step 3: Suppress the `onPointerDown` finding**

Replace:

```tsx
    onPointerDown: chain<PointerEvent>(children.props.onPointerDown, (event) => {
      if (event.pointerType !== 'touch') return;
      clearPress();
      pressTimer.current = setTimeout(() => setOpen(true), LONG_PRESS_MS);
    }),
```

with:

```tsx
    // eslint-disable-next-line react-hooks/refs -- the wrapped handler only runs later, as a real pointer event, never during this render
    onPointerDown: chain<PointerEvent>(children.props.onPointerDown, (event) => {
      if (event.pointerType !== 'touch') return;
      clearPress();
      pressTimer.current = setTimeout(() => setOpen(true), LONG_PRESS_MS);
    }),
```

- [ ] **Step 4: Suppress the `onPointerUp` finding**

Replace:

```tsx
    onPointerUp: chain<PointerEvent>(children.props.onPointerUp, clearPress),
```

with:

```tsx
    // eslint-disable-next-line react-hooks/refs -- clearPress only runs later, as a real pointer event, never during this render
    onPointerUp: chain<PointerEvent>(children.props.onPointerUp, clearPress),
```

- [ ] **Step 5: Suppress the `onPointerCancel` finding**

Replace:

```tsx
    onPointerCancel: chain<PointerEvent>(children.props.onPointerCancel, () => {
      clearPress();
      setOpen(false);
    }),
```

with:

```tsx
    // eslint-disable-next-line react-hooks/refs -- the wrapped handler only runs later, as a real pointer event, never during this render
    onPointerCancel: chain<PointerEvent>(children.props.onPointerCancel, () => {
      clearPress();
      setOpen(false);
    }),
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @zelo/web exec eslint src/presentation/ui/Tooltip.tsx`
Expected: no `react-hooks/*` findings — this file had exactly 5 (`refs`), now all suppressed.

- [ ] **Step 7: Run the existing tests that cover this component**

`Tooltip.tsx` has no dedicated test file — it's covered by two others.

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/ui/primitives.test.tsx src/presentation/ui/MetricHelp.test.tsx`
Expected: passes unchanged — no code behavior changed, only comments added.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/presentation/ui/Tooltip.tsx
git commit -m "chore(web): suppress Tooltip's react-hooks/refs findings"
```

---

## Task 7: Suppress — mechanical sweep (`set-state-in-effect`, `exhaustive-deps`, `globals`)

**Files:**
- Modify: `apps/web/src/presentation/components/InstitutionLinkCard.tsx`
- Modify: `apps/web/src/presentation/hooks/useInlineConfirm.ts`
- Modify: `apps/web/src/presentation/components/LinkInstitutionQrScanModal.tsx`
- Modify: `apps/web/src/presentation/components/QrCodeModal.tsx`
- Modify: `apps/web/src/presentation/hooks/usePeerPartnerConnection.ts`
- Modify: `apps/web/src/presentation/pages/HomePage/FollowUpCard.tsx`
- Modify: `apps/web/src/presentation/pages/PeersPage.tsx`
- Modify: `apps/web/src/presentation/components/AssessmentReview.tsx`
- Modify: `apps/web/src/presentation/ui/primitives.test.tsx`

**Why these 9 findings, across otherwise-unrelated files, are one task:** every one of them is
the same mechanical shape — add a one-line `eslint-disable-next-line` with a short, specific
reason — and every one was read and judged safe during planning (see below). Batching same-shape
mechanical edits into one dispatch, rather than one task per file, matches
`superpowers:subagent-driven-development`'s own guidance on batching small same-shape work.

**The `set-state-in-effect` findings (7)** are three variations of one accepted idiom, each
confirmed by reading the surrounding code during planning:
1. *Reset stale UI state right before an effect's async work begins* — `InstitutionLinkCard.tsx`
   (focus-flag reset, not this shape — see below), `LinkInstitutionQrScanModal.tsx` (clears a
   camera error before starting the scanner), `QrCodeModal.tsx` (clears ready/error flags before
   rendering the QR code), `PeersPage.tsx` (clears the "search is slow" flag before starting a
   new search's timer).
2. *Consume-and-reset a one-shot focus trigger* — `InstitutionLinkCard.tsx` (focuses the CTA
   button, then resets the flag that triggered it), `useInlineConfirm.ts` (the same pattern,
   shared by every inline-confirm consumer), `FollowUpCard.tsx` (same pattern again, for the
   acknowledgment focus).
3. *Report a connection's initial status right after opening it* — `usePeerPartnerConnection.ts`
   (`setState("connecting")` right after calling `.connect()` — matches the rule's own
   documented acceptable shape: "subscribe for updates from some external system").

**The `exhaustive-deps` finding (1)** in `AssessmentReview.tsx` is the mount-only effect
identified back in the spec's §1 measurement — the effect's own existing comment already states
the intent ("Mount-only: this component is remounted fresh every time review is (re)entered").

**The `globals` finding (1)** in `primitives.test.tsx` is a render-counting instrumentation
pattern (`renderCount += 1` inside a test-only `Trigger` component) — deliberately mutating
external state during render is the *point* of this specific test technique (asserting on how
many times a component actually re-rendered); it is not a bug and would never appear in
production code.

- [ ] **Step 1: `InstitutionLinkCard.tsx` — suppress the focus-reset**

Replace:

```tsx
  useEffect(() => {
    if (!shouldFocusCta) {
      return;
    }
    ctaRef.current?.focus();
    setShouldFocusCta(false);
  }, [shouldFocusCta]);
```

with:

```tsx
  useEffect(() => {
    if (!shouldFocusCta) {
      return;
    }
    ctaRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the one-shot focus trigger so it can fire again later
    setShouldFocusCta(false);
  }, [shouldFocusCta]);
```

- [ ] **Step 2: `useInlineConfirm.ts` — suppress the focus-reset**

Replace:

```ts
    const target = step === 'confirming' ? confirmRef.current : triggerRef.current;
    target?.focus();
    setPendingFocus(false);
  }, [pendingFocus, step]);
```

with:

```ts
    const target = step === 'confirming' ? confirmRef.current : triggerRef.current;
    target?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the one-shot focus trigger so it can fire again later
    setPendingFocus(false);
  }, [pendingFocus, step]);
```

- [ ] **Step 3: `LinkInstitutionQrScanModal.tsx` — suppress the camera-error reset**

Replace:

```ts
  useEffect(() => {
    if (!isOpen) return;
    setCameraError(null);
    let cancelled = false;
```

with:

```ts
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears a stale error before the scanner (re)starts below
    setCameraError(null);
    let cancelled = false;
```

- [ ] **Step 4: `QrCodeModal.tsx` — suppress the ready/error reset**

Replace:

```tsx
  useEffect(() => {
    if (!isOpen) {
      setIsReady(false);
      setRenderError(false);
      return;
    }
```

with:

```tsx
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets stale ready/error state when the modal closes
      setIsReady(false);
      setRenderError(false);
      return;
    }
```

- [ ] **Step 5: `usePeerPartnerConnection.ts` — suppress the initial-status report**

Replace:

```ts
    const client = new PeerChatSocketClient();
    const socket = client.connect(token);
    socketRef.current = socket;
    setState("connecting");
```

with:

```ts
    const client = new PeerChatSocketClient();
    const socket = client.connect(token);
    socketRef.current = socket;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reports the connection's initial status right after opening it
    setState("connecting");
```

- [ ] **Step 6: `FollowUpCard.tsx` — suppress the focus-reset**

Replace:

```tsx
  useEffect(() => {
    if (!justAnswered) {
      return;
    }
    ackRef.current?.focus();
    setJustAnswered(false);
  }, [justAnswered]);
```

with:

```tsx
  useEffect(() => {
    if (!justAnswered) {
      return;
    }
    ackRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the one-shot focus trigger so it can fire again later
    setJustAnswered(false);
  }, [justAnswered]);
```

- [ ] **Step 7: `PeersPage.tsx` — suppress the slow-search reset**

Replace:

```tsx
  useEffect(() => {
    if (state !== 'searching') {
      setSearchIsSlow(false);
      return;
    }
```

with:

```tsx
  useEffect(() => {
    if (state !== 'searching') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the slow-search flag before a new search's timer starts below
      setSearchIsSlow(false);
      return;
    }
```

- [ ] **Step 8: `AssessmentReview.tsx` — suppress the mount-only effect**

Replace:

```tsx
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, []);
```

with:

```tsx
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design, see the comment above this effect
    if (focusOnMount) headingRef.current?.focus();
  }, []);
```

- [ ] **Step 9: `primitives.test.tsx` — suppress the render-counter**

Replace:

```tsx
    let renderCount = 0;
    function Trigger(props: Record<string, unknown>) {
      renderCount += 1;
      return (
```

with:

```tsx
    let renderCount = 0;
    function Trigger(props: Record<string, unknown>) {
      // eslint-disable-next-line react-hooks/globals -- deliberate render-counting instrumentation for this test, not production code
      renderCount += 1;
      return (
```

- [ ] **Step 10: Verify all 9 files**

Run:
```bash
pnpm --filter @zelo/web exec eslint \
  src/presentation/components/InstitutionLinkCard.tsx \
  src/presentation/hooks/useInlineConfirm.ts \
  src/presentation/components/LinkInstitutionQrScanModal.tsx \
  src/presentation/components/QrCodeModal.tsx \
  src/presentation/hooks/usePeerPartnerConnection.ts \
  src/presentation/pages/HomePage/FollowUpCard.tsx \
  src/presentation/pages/PeersPage.tsx \
  src/presentation/components/AssessmentReview.tsx \
  src/presentation/ui/primitives.test.tsx
```
Expected: exits 0, no output. (`InstitutionLinkCard.tsx` should now be fully clean — its `refs`
findings were resolved in Task 2, and this step resolves its last remaining finding.)

- [ ] **Step 11: Run the full web test suite**

Run: `pnpm --filter @zelo/web test`
Expected: all tests pass — every change in this task is a comment addition, no code behavior
changed.

- [ ] **Step 12: Commit**

```bash
git add \
  apps/web/src/presentation/components/InstitutionLinkCard.tsx \
  apps/web/src/presentation/hooks/useInlineConfirm.ts \
  apps/web/src/presentation/components/LinkInstitutionQrScanModal.tsx \
  apps/web/src/presentation/components/QrCodeModal.tsx \
  apps/web/src/presentation/hooks/usePeerPartnerConnection.ts \
  apps/web/src/presentation/pages/HomePage/FollowUpCard.tsx \
  apps/web/src/presentation/pages/PeersPage.tsx \
  apps/web/src/presentation/components/AssessmentReview.tsx \
  apps/web/src/presentation/ui/primitives.test.tsx
git commit -m "chore(web): suppress the remaining set-state-in-effect/exhaustive-deps/globals findings"
```

---

## Task 8: Suppress — `useFollowUpAnswer.ts` (`purity`)

**Files:**
- Modify: `apps/web/src/presentation/hooks/useFollowUpAnswer.ts`

**Why this is a suppression, not a fix, despite the spec saying it would get a real fix:**
during planning, the obvious fix (`useMemo(() => Date.now(), [])`) was tried and rejected: it
freezes "now" at mount, so `answeredRecently`/`recentSevereAssessment` would stop expiring for
any session left open — the acknowledgment window is defined in real elapsed time, not time
since mount. There is no mechanical fix that preserves "reevaluates against the real current
time on every render" without also deciding a product question this plan has no authority to
settle (should "now" refresh on a timer? only at specific triggers?). This hook feeds a
distress-signal acknowledgment (see the file's own comments referencing PRODUCT.md); redesigning
its timing logic is out of scope for a lint-adoption plan. Suppress with that reasoning; do not
attempt a redesign.

- [ ] **Step 1: Suppress the first `Date.now()` read**

Replace:

```ts
  const answeredRecently =
    answeredAtDate !== null &&
    Date.now() - answeredAtDate.getTime() < ACKNOWLEDGMENT_WINDOW_HOURS * 60 * 60 * 1000;
```

with:

```ts
  const answeredRecently =
    answeredAtDate !== null &&
    // eslint-disable-next-line react-hooks/purity -- must reevaluate against the real current time on every render; memoizing would freeze the acknowledgment window at mount
    Date.now() - answeredAtDate.getTime() < ACKNOWLEDGMENT_WINDOW_HOURS * 60 * 60 * 1000;
```

- [ ] **Step 2: Suppress the second `Date.now()` read**

Replace:

```ts
  const recentSevereAssessment =
    (mostRecentSeverityTone === 'high' || mostRecentSeverityTone === 'severe') &&
    mostRecentAssessmentAt !== null &&
    Date.now() - mostRecentAssessmentAt.getTime() < ACKNOWLEDGMENT_WINDOW_HOURS * 60 * 60 * 1000;
```

with:

```ts
  const recentSevereAssessment =
    (mostRecentSeverityTone === 'high' || mostRecentSeverityTone === 'severe') &&
    mostRecentAssessmentAt !== null &&
    // eslint-disable-next-line react-hooks/purity -- must reevaluate against the real current time on every render; memoizing would freeze the acknowledgment window at mount
    Date.now() - mostRecentAssessmentAt.getTime() < ACKNOWLEDGMENT_WINDOW_HOURS * 60 * 60 * 1000;
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @zelo/web exec eslint src/presentation/hooks/useFollowUpAnswer.ts`
Expected: no `react-hooks/*` findings.

- [ ] **Step 4: Run the existing test for this hook**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/hooks/useFollowUpAnswer.test.tsx`
Expected: passes unchanged — no code behavior changed, only comments added. If the file isn't
named exactly that, find the real test file covering `useFollowUpAnswer` and run it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/hooks/useFollowUpAnswer.ts
git commit -m "chore(web): suppress useFollowUpAnswer's react-hooks/purity findings"
```

---

## Task 9: Final verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Lint the whole app clean**

Run: `pnpm --filter @zelo/web lint`
Expected: **exits 0**. If anything still fails, it means either a step above was skipped/missed,
or a finding exists that this plan didn't account for (re-run
`pnpm --filter @zelo/web exec eslint src --format json` and diff its `react-hooks/*` findings
against this plan's Task 2-8 coverage before assuming the plan is complete).

- [ ] **Step 2: Confirm the `incompatible-library` warnings are still exactly 10**

Run: `pnpm --filter @zelo/web exec eslint src --format json | python -c "
import json, sys
data = json.load(sys.stdin)
count = sum(1 for f in data for m in f.get('messages', []) if m.get('ruleId') == 'react-hooks/incompatible-library')
print(count)
"`
Expected: `10` — this plan deliberately leaves these as tracked warnings (spec §2); if the count
changed, something in this plan's diffs touched a file it shouldn't have.

- [ ] **Step 3: Run the full web suite**

Run: `pnpm --filter @zelo/web test`
Expected: all tests pass, same count as before this plan started (re-check against the count
recorded in `docs/conventions/priorities.md` #5's PR if you need a baseline — as of that PR, 193
files / 2360 tests).

- [ ] **Step 4: Boundaries and build**

Run: `pnpm turbo run lint:boundaries build --filter=@zelo/web`
Expected: both tasks succeed, exit 0.

- [ ] **Step 5: Prove the guard actually fires**

Temporarily revert Task 1's config change and confirm lint goes red again with recognizable
`react-hooks/*` findings — the same discipline used for every guard in
`docs/conventions/priorities.md` (#1-#5):

```bash
git show HEAD~8:apps/web/eslint.config.mjs > apps/web/eslint.config.mjs
```

(`HEAD~8` assumes exactly 8 commits landed since Task 1's commit through Task 8's — count from
`git log --oneline` if a fix round added extra commits, and point at the commit immediately
*before* Task 1's "wire eslint-plugin-react-hooks recommended preset" commit instead.)

Run: `pnpm --filter @zelo/web lint`
Expected: **exits 1** — with `react-hooks/rules-of-hooks` and other findings, since the whole
plugin registration is gone. Then restore it:

```bash
git checkout -- apps/web/eslint.config.mjs
pnpm --filter @zelo/web lint
```

Expected: exits 0 again, same as Step 1.

- [ ] **Step 6: Update the backlog**

In `docs/conventions/priorities.md`, mark item #6 as `— FIXED`, following the same format as
items #1-#5 (a short summary of what changed, a "proven to fire" paragraph pointing at Step 5
above, then the original entry preserved below a `The original entry:` heading). Do not
re-derive the exact wording from scratch — read how #3, #4, and #5 are written in the same file
and match that structure and tone.

- [ ] **Step 7: Final commit**

```bash
git add docs/conventions/priorities.md
git commit -m "docs: mark priorities.md #6 FIXED"
```
