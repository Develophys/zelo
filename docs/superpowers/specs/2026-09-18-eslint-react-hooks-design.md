# Adopt `eslint-plugin-react-hooks` (full `recommended` preset) — design

**Status:** approved, ready for planning
**Backlog item:** `docs/conventions/priorities.md` #6
**Supersedes the backlog entry's original framing** ("rules-of-hooks and exhaustive-deps... roll
out in report-only mode first") — real measurement replaced the entry's own hand-audit guess,
and the measured result changed the recommended scope. See §1.

## 0. Context

`packages/config/eslint.base.mjs` is the shared ESLint 9 flat config consumed by `apps/api`,
`apps/web`, and `packages/domain` (each via a thin `eslint.config.mjs` re-export). None of the
three currently registers `eslint-plugin-react-hooks`. `apps/web` is the only one of the three
with React code — 56 `useEffect`, 31 `useCallback`, and 12 `useMemo` call sites, entirely
unguarded by `rules-of-hooks` or `exhaustive-deps`.

## 1. What measurement changed

The backlog entry assumed the two classic rules (`rules-of-hooks`, `exhaustive-deps`) and
predicted "at least two deliberate mount-only effects will need explicit disables," calling its
own "would very nearly pass today" claim an unverified hand audit.

Measured (installed the plugin, ran it against all 554 files in `apps/web/src`, reverted):
`rules-of-hooks` — **0** violations. `exhaustive-deps` — **1** violation (a genuine mount-only
effect in `AssessmentReview.tsx` that needs exactly one disable, not "at least two").

`eslint-plugin-react-hooks`'s current major (7.1.1, published 2026-04-17 — a stable release, not
a canary) is the React Compiler-era rewrite. Its `recommended` flat config bundles the two
classic rules plus 14 more, all part of the Compiler's static-safety analysis. Re-measuring with
the full `recommended` preset (still just eslint, no compiler installed) found **44 violations
across 16 rules in 25 files** — a materially different scope than the backlog entry described.

This spec exists because that jump (1 finding → 44; 2 rules → 16; some rules needing real
per-site engineering judgment, not mechanical fixes) is the kind of hidden complexity that
upgrades a bounded change to an architectural one.

## 2. Decision: adopt the full `recommended` preset now, not just the two classic rules

The user's project intends to adopt `babel-plugin-react-compiler` as a near-term follow-up (its
own, separately brainstormed backlog item — **out of scope here**, see §7). The 14
Compiler-authored rules in `recommended` are exactly that adoption's own prerequisite checklist:
they flag the static patterns the compiler can't safely optimize around. Fixing what they find
now is real preparation work, not busywork imposed by an unrelated linter.

Severities are left at the plugin's own `recommended` defaults — no overrides:

```js
reactHooks.configs.flat.recommended
// { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn",
//   "react-hooks/static-components": "error", "react-hooks/use-memo": "error",
//   "react-hooks/preserve-manual-memoization": "error", "react-hooks/incompatible-library": "warn",
//   "react-hooks/immutability": "error", "react-hooks/globals": "error", "react-hooks/refs": "error",
//   "react-hooks/set-state-in-effect": "error", "react-hooks/error-boundaries": "error",
//   "react-hooks/purity": "error", "react-hooks/set-state-in-render": "error",
//   "react-hooks/unsupported-syntax": "warn", "react-hooks/config": "error", "react-hooks/gating": "error" }
```

`incompatible-library` specifically: kept at its default `warn`, not disabled. It flags exactly
the API shapes (`react-hook-form`'s `watch()`, in every current hit) that will need attention
when the Compiler adoption work starts — turning it off now would throw away a tracked,
already-measured list this project explicitly wants for that future work.

## 3. Violation inventory (measured, complete — 44 total)

9 of the preset's 16 rules have **zero** violations today (`rules-of-hooks`,
`static-components`, `use-memo`, `preserve-manual-memoization`, `immutability`,
`error-boundaries`, `unsupported-syntax`, `config`, `gating`) — enabling them is zero-risk,
zero-fix-work, pure upside.

The other 7 rules carry all 44 findings:

| Rule | Severity | Count | Files |
|---|---|---|---|
| `refs` | error | 23 | `InstitutionLinkCard.tsx` (4), `PeerChatRoom.tsx` (4), `ScaleAssessmentPage.tsx` (7), `Tooltip.tsx` (5), `useDebouncedSearch.ts` (2), `useHotkey.ts` (1) |
| `set-state-in-effect` | error | 7 | `InstitutionLinkCard.tsx`, `LinkInstitutionQrScanModal.tsx`, `QrCodeModal.tsx`, `useInlineConfirm.ts`, `usePeerPartnerConnection.ts`, `FollowUpCard.tsx`, `PeersPage.tsx` (1 each) |
| `purity` | error | 2 | `useFollowUpAnswer.ts` (2, both `Date.now()` read directly in the render body) |
| `globals` | error | 1 | `primitives.test.tsx` (a test file — reassigns a module-scope spy variable, likely a legitimate test pattern, not a component bug) |
| `exhaustive-deps` | warn | 1 | `AssessmentReview.tsx` (the one already identified in §1) |
| `incompatible-library` | warn | 10 | `FinishSetupForm.tsx`, `AdminInstitutionsPage.tsx`, `AdminLoginPage.tsx`, `useManagerCreateFlow.ts`, `ManagerAdminPeersPage.tsx`, `ManagerAdminSectorsPage.tsx`, `ManagerForgotPasswordPage.tsx`, `ManagerLoginPage.tsx`, `PeerPartnerForgotPasswordPage.tsx`, `PeerPartnerLoginPage.tsx` (1 each — all `react-hook-form`'s `watch()`) |

**33 `error`-severity findings block CI and must be resolved** (fixed, or disabled at the exact
line with a one-line reason) before this can land. **11 `warn`-severity findings do not block
CI**; the `exhaustive-deps` one gets fixed anyway (it's real and trivial); the 10
`incompatible-library` ones are left as tracked warnings — visible in every future `pnpm lint`
run, not fixed now, feeding directly into the Compiler-adoption work.

Two clusters are not mechanical and were spot-checked to confirm they're real, judgment-requiring
findings rather than noise:

- **`refs` (23 hits) is dominated by one recognizable idiom**, not 23 unrelated bugs:
  `handlerRef.current = handler;` written directly in a component/hook body (`useHotkey.ts:17`,
  the same shape recurs in most of the other `refs` files) — the "latest ref" pattern, used to
  keep a stable callback identity in a store subscription without a stale closure. It's a
  long-established React community convention, and it genuinely is unsafe for the compiler's
  memoization model (a ref write during render can run more than once under concurrent
  rendering). The per-site call is whether to convert to the compiler-safe form (write the ref
  inside a `useLayoutEffect`/`useInsertionEffect` instead of inline) or keep the pattern and
  suppress the rule with a stated reason — that call needs each site read, not a blanket rule.
- **`purity` (`useFollowUpAnswer.ts:57,67`) is a genuine bug independent of the Compiler**:
  `Date.now()` called directly in the render body makes the render non-deterministic on its own
  terms, before the Compiler is even part of the conversation. This one gets a real fix (compute
  the timestamp once, e.g. via `useMemo` or a ref set outside render), not a suppression.
- **`set-state-in-effect` (7 hits)** mixes idiomatic "connect to an external system, report
  initial status" effects (e.g. `usePeerPartnerConnection.ts:39`'s `setState("connecting")`
  right after opening a socket — matches the rule's own stated ideal effect shape) with possibly
  fixable cases; each of the 7 needs its own read.

## 4. Architecture

`eslint-plugin-react-hooks` becomes a devDependency of `apps/web` only (not `packages/config`,
not the other two apps) — `apps/api` is NestJS and `packages/domain` is plain TypeScript,
neither has hook-shaped code, and layering React-specific rules into the shared
`eslint.base.mjs` would be conceptually wrong even though currently inert for them.

`apps/web/eslint.config.mjs` changes from a bare re-export to:

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

`packages/config/eslint.base.mjs` is untouched. This deviates from the backlog entry's stated
`Files:` line (which named `packages/config/eslint.base.mjs`) — that line predates this
investigation and named the wrong file for a plugin that turned out to be web-only.

## 5. Execution strategy

33 `error`-severity sites need individual review, several touch sensitive surfaces
(`PeerChatRoom.tsx` — peer support chat, `ScaleAssessmentPage.tsx` — the PHQ-9/GAD-7 assessment
flow, `useFollowUpAnswer.ts` — the distress-signal follow-up prompt), and the fixes are not
uniform (some are real code changes, some are justified suppressions of an idiom this project
accepts). This is executed as a formal implementation plan
(`docs/superpowers/plans/2026-09-18-eslint-react-hooks.md`), via
`superpowers:subagent-driven-development`: one task wires the config and dependency (expected to
leave `pnpm lint` red until the fix tasks land — acceptable mid-branch, not mid-PR), then one
task per rule-cluster (grouped the way §3 groups them: `refs`, `set-state-in-effect`, `purity`,
`globals`, `exhaustive-deps`), each with a fresh subagent, a task review, and the plan's exact
per-site decision (fix vs. suppress, with the suppression's one-line reason) written out in full
— no "fix the ref access"-shaped steps. A final verification task runs the full web suite,
`lint`, `lint:boundaries`, and `build` and confirms all are green before the branch goes to PR.

## 6. Testing

No new dedicated test file — this is a lint-rule change, not new runtime behavior, except where
a fix (e.g. `useFollowUpAnswer.ts`'s `Date.now()`) touches real logic; those sites keep whatever
existing test coverage they have, re-verified green, and gain a new test only if the existing
suite doesn't already cover the corrected behavior. The single source of truth that the rules
are actually enforced is `pnpm --filter @zelo/web lint` exiting 0 with zero `react-hooks/*`
findings above `warn`, re-verified the same way prior priorities.md items proved their guards
fire: by temporarily reverting the config and confirming lint goes red again with the same
findings this spec measured.

## 7. Out of scope

Installing and enabling `babel-plugin-react-compiler` itself. The user confirmed intent to adopt
it as a near-term follow-up; it gets its own brainstorm, its own measurement (which components
the compiler can and can't safely optimize once this plan's fixes land), and its own plan — not
folded into this one. The 10 tracked `incompatible-library` warnings this plan leaves in place
are exactly that follow-up's starting worklist.
