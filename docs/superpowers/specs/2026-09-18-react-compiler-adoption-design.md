# React Compiler adoption — design

**Status:** approved, ready for planning
**Backlog:** follow-up confirmed by the user as the next item after
`docs/conventions/priorities.md` #6 (eslint-plugin-react-hooks, PR #62) — not itself a numbered
priorities.md entry yet; this spec's plan creates that entry on landing.

## 0. Context

`apps/web` runs React 19.2 on Vite 6.4.3 with `@vitejs/plugin-react@4.7.0` (the standard
Babel-based transform — not `@vitejs/plugin-react-swc`, not the experimental Rolldown/oxc
variant). Item #6 adopted `eslint-plugin-react-hooks`'s full `recommended` preset, which is
itself powered by the React Compiler's static analysis; that work measured and resolved 44
findings, leaving a documented worklist of 19 suppressed sites (12 files) plus 10 tracked
`incompatible-library` warnings — every one is a concrete "will this actually compile once the
real compiler runs" question, not yet answered because no compiler has run against this code.

This spec is that answer's prerequisite: install and enable `babel-plugin-react-compiler`, so
the worklist becomes measurable ground truth instead of a static-analysis guess.

## 1. Integration point — corrects a wrong first read of the official docs

`react.dev/learn/react-compiler/installation`'s Vite section leads with `@rolldown/plugin-babel`
and a `reactCompilerPreset`, requiring `@vitejs/plugin-react@6+`. That page's guidance targets
Vite's Rolldown-based bundler variant. This repo runs the standard `vite` package with the
standard `@vitejs/plugin-react`, whose installed `4.7.0` already exposes a `babel` option
(`BabelOptions | ((id, opts) => BabelOptions)`, confirmed directly against
`node_modules/.pnpm/@vitejs+plugin-react@4.7.0.../dist/index.d.ts` — the source of truth, not
the doc page) that accepts arbitrary `@babel/core` plugins. No dependency upgrade, no bundler
migration:

```ts
// apps/web/vite.config.ts
import reactCompiler from "babel-plugin-react-compiler";
// ...
  plugins: [
    react({
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            { target: "19", panicThreshold: "all_errors" },
          ],
        ],
      },
    }),
    tailwindcss(),
    VitePWA({ /* unchanged */ }),
  ],
```

`babel-plugin-react-compiler` is added as a new devDependency of `apps/web` (current stable:
`1.0.0`, published as a real release, not a canary — re-verify the version at implementation
time the same way item #6 re-verified `eslint-plugin-react-hooks`'s).

## 2. Configuration decisions

- **`target: "19"`** — this app is on React 19.2. React 19 ships the compiler's runtime helpers
  built in (`react/compiler-runtime`); no separate `react-compiler-runtime` package is needed
  (that package is only required when targeting React 17/18).
- **`compilationMode`** — left at its default, `"infer"`. The compiler heuristically identifies
  components/hooks across all of `apps/web/src` without requiring a `"use memo"` directive on
  each one. Considered and rejected: `"annotation"` mode (opt-in per component — the user
  explicitly rejected this as impractical manual work across hundreds of components for near-zero
  realized benefit) and directory-scoped incremental rollout via `include`/`exclude` (rejected in
  favor of whole-app adoption, given the compiler's per-component bailout is itself the safety
  mechanism, and item #6 already did the static-analysis cleanup this rollout builds on).
- **`panicThreshold: "all_errors"`** — the user's explicit choice over the plugin's own default
  (`"none"`, which silently skips a file the compiler crashes on, console-warns, and lets the
  build stay green). Matches this project's established discipline (every guard in
  `priorities.md` #1-#6 is proven to fire, not just configured) — a build that can silently
  leave a file permanently unoptimized without anyone noticing is exactly the failure mode this
  project has repeatedly closed elsewhere.

## 3. Risk this rollout carries, and what mitigates it

Per-component automatic memoization is a *runtime* transform, unlike item #6's lint-only
change. The specific risk: a component that violates a Rules-of-React assumption the compiler's
own bailout heuristics don't catch (`eslint-plugin-react-hooks`'s static analysis is
necessarily incomplete — it can't see everything the compiler's own deeper analysis will) could
receive incorrect memoization and produce a bug that reproduces only in production, under
specific timing, with no build or lint failure to flag it.

Mitigations, in order of how much they actually reduce this risk:

1. **`panicThreshold: "all_errors"`** — catches the compiler's own internal failures, not
   silent-but-wrong optimizations. Necessary, not sufficient.
2. **The full existing test suite (2360 tests) must stay green.** A test that exercises a
   component's actual re-render/update behavior is direct evidence the compiler's memoization of
   that component didn't change observable behavior. This is the strongest available signal, and
   it's already comprehensive by this codebase's own established standard.
3. **Manual smoke-test of the highest-stakes flows** — the PHQ-9/GAD-7 assessment flow and the
   peer chat flow — beyond what automated tests cover, given `docs/conventions/product-invariants.md`
   treats these as the app's highest-stakes surfaces.
4. **The 19+10 items from item #6's worklist get resolved against the compiler's *actual*
   bailout output**, not re-guessed. Where the compiler bails a file out (skips it, leaves it
   unoptimized — safe, not a Critical outcome, just no gain), that's directly observable via the
   coverage report (§4) and closes the item as "not yet fixable, tracked." Where the compiler
   *does* optimize a previously-flagged file without error, that's evidence the earlier
   suppression was conservative and the file is fine.

## 4. Measurement — before enabling, and after

**Pre-flight (RED, before any code change):** run `npx react-compiler-healthcheck` (the React
team's own pre-adoption tool, current stable `1.0.0`) against `apps/web/src`. This produces real
numbers — how many components/hooks the compiler can and can't currently handle — the same
discipline as item #6's 44-finding measurement, replacing a guess with ground truth before the
plan commits to specifics.

**Coverage reporting (ongoing, built into the config):** `babel-plugin-react-compiler` accepts a
`logger: { logEvent(filename, event) }` callback — the same mechanism
`eslint-plugin-react-hooks`'s own rules use internally, confirmed by grepping the compiled
plugin (`dist/index.js`) for `logEvent`. `vite.config.ts` wires a logger that accumulates
per-file compiled/bailout/error counts during the build and prints a one-line summary
(`react-compiler: N/M files compiled, K bailed out, 0 errors` — the plan's implementation task
defines the exact format). This is the artifact that turns "the compiler is on" into "the
compiler compiled X of Y files, and here specifically is what it skipped" — auditable the same
way item #6's violation inventory was.

**Bundle size:** recorded before/after, following `priorities.md` #4's precedent, but not
treated as a pass/fail gate — the compiler removes manually-written `useMemo`/`useCallback` call
overhead in some places and adds generated memoization code in others; the net direction isn't
predictable and isn't the point of this change.

## 5. Testing

No new test files are anticipated as part of turning the compiler on — this is a build-pipeline
change, and its correctness is proven by the existing suite staying green plus the manual
smoke-tests in §3. If the plan's investigation phase (working through the 19+10-item worklist
against real compiler output) finds a component whose behavior the compiler's memoization
visibly changes, fixing that is real application work with its own test, following this
codebase's normal TDD conventions — not invented here, since it depends on what the
investigation actually finds.

## 6. Rollback

Fully reversible: removing the `babel.plugins` block from `apps/web/vite.config.ts` (and the
devDependency) reverts the build to exactly its pre-adoption state. No schema change, no data
migration, no API surface change — this is strictly a build-time transform.

## 7. Out of scope

- **Switching `apps/web/eslint.config.mjs` from `reactHooks.configs.flat.recommended` to
  `recommended-latest`** (which adds one more rule, `void-use-memo`, still labeled experimental
  by the plugin's own README). Worth a one-line follow-up once the compiler has run in
  production for a while and this project has a read on how noisy the stable rule set already
  is; not bundled into this change.
- **`@vitejs/plugin-react-oxc` / the native Rust compiler path** — a real alternative
  integration mechanism, meaningfully faster in theory, but it means migrating off the
  Babel-based JSX transform this project has always used, touching Fast Refresh and dev-server
  behavior well beyond what "add the compiler" requires. A separate initiative if ever pursued.
- **`apps/api`, `packages/domain`** — no React code; not applicable.
