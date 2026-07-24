# Assessment history demo seed — design spec

**Status:** design, ready to implement.

## 1. Problem

`HomePage`'s "Seu histórico" chart (`apps/web/src/presentation/pages/HomePage.tsx`) reads from
`useAssessmentHistory()` → `GetAssessmentHistoryUseCase`, which in turn reads real, on-device
encrypted `AssessmentRecord`s out of IndexedDB (`IndexedDbAssessmentStoreAdapter`). On a fresh
browser profile the chart is empty — six flat bars. For a video demo of the app's functionality,
the doctor-user's history should show real-looking variation without manually clicking through
six weeks of PHQ-9/GAD-7 questionnaires first.

## 2. Decision: dev-only console seeder, no UI change

New file `apps/web/src/dev/seed-assessment-history.ts` exporting one async function,
`seedAssessmentHistory()`. It builds 6 fake `AssessmentRecord`s, one per of the last 6 ISO weeks
(reusing `startOfIsoWeek` already exported from `get-assessment-history.usecase.ts`, so the
bucketing lines up exactly with what `GetAssessmentHistoryUseCase` expects), with varied PHQ-9
totals so the bars show real variation (including one peak week) rather than a flat or maxed-out
line — same "non-perfect number reads as credible" precedent already used for the manager
dashboard's seeded KPI data (`docs/superpowers/specs/2026-07-19-followup-mechanism-design.md`).

Each record is built by:
1. Constructing a 9-item PHQ-9 answer array (`0–3` per item) that sums to a target total score.
2. Scoring it via the existing `ScoreAssessmentUseCase` (reused, not reimplemented) to get
   `riskSignal` the same way real submissions do.
3. Encrypting the JSON-stringified answers via a fresh `WebCryptoEncryptionAdapter` instance —
   the **same adapter class the app already uses**, so the resulting ciphertext round-trips
   through `GetAssessmentHistoryUseCase`'s real `decrypt` call exactly like a genuine record
   would. (A new instance is fine: the AES key is device-scoped and persisted in the `zelo-crypto`
   IndexedDB store, so a new adapter instance loads the same key rather than generating a second
   one.)
4. Saving via a fresh `IndexedDbAssessmentStoreAdapter` instance (`save()`), the same store the
   app reads from.

Nothing is sent over the network — this only touches local IndexedDB, no
`AssessmentSubmissionPort`/HTTP call, so no fake data reaches the backend or the manager pipeline.

Target totals (out of 27, oldest → newest week): `8, 12, 6, 18, 10, 14` →
severity fractions ≈ `0.30, 0.44, 0.22, 0.67, 0.37, 0.52`. This gives one visible peak (week 4,
rendered in the `warn` color per `HomePage`'s existing bar logic) distinct from the latest week
(rendered in `brand` color), so both chart states are visible in one seeded run.

**Wiring (`apps/web/src/main.tsx`):** under `import.meta.env.DEV` only, lazy-import the seed
module and attach it to `window.seedAssessmentHistory`. Lazy import keeps it out of the production
bundle graph entirely (not just dead-code-eliminated — never fetched).

```ts
if (import.meta.env.DEV) {
  import("@/dev/seed-assessment-history").then(({ seedAssessmentHistory }) => {
    Object.assign(window, { seedAssessmentHistory });
  });
}
```

**Usage:** run the dev server, open devtools console on the running app, run
`await seedAssessmentHistory()`, then load/reload `/home`. No new component, no new route, no
change to any existing screen's rendered output in production.

## 3. Rejected alternatives

- **URL query param trigger (`?seed=true`)** — would need a code path reachable in production
  builds (or an extra env-gated branch in routing), and risks a stray query string seeding a real
  device by accident. The console function is strictly opt-in and dev-only.
- **Backend `SimulatedSignal`-style seeding** — doesn't apply here; per
  `docs/superpowers/specs/identity-and-aggregation.md`, real assessment history is derived
  client-side from on-device encrypted records and is structurally never backend-sourced. Seeding
  the backend wouldn't move this chart at all.

## 4. Acceptance criteria

- `seedAssessmentHistory()` writes 6 `AssessmentRecord`s to the `zelo-assessments` IndexedDB store
  such that `GetAssessmentHistoryUseCase.execute()` returns 6 buckets with non-null
  `severityFraction`, matching the target totals above (within rounding).
- Calling it twice does not error (each call uses fresh random `id`s and `capturedAt` timestamps
  recomputed from "now", so re-running before a second recording session just re-seeds).
- `window.seedAssessmentHistory` is `undefined` in a production build (verify via `vite build` +
  checking the built bundle does not contain the seed module).
- No existing test, component, or route changes.
