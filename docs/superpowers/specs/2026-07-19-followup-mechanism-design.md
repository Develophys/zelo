# Follow-up mechanism — design spec

**Status: SUPERSEDED — (A) reimplemented as a real metric on 13/09/2026.** Everything below
through §2 describes the *original* two-pieces-that-never-talk-to-each-other design and the
reasoning that justified it at the time. That reasoning did not hold up: §2's claim that closing
the loop "would require the identity/auth layer `identity-and-aggregation.md` describes as not
yet built" was checked against the actual code and found overstated — by the time this was
revisited, the app already had `deviceSignalId` (`apps/web/src/stores/institution-link.store.ts`),
a per-device, no-PII, k-anonymous identifier created for signal-checkin dedup
(`record-signal-checkin.use-case.ts`) that is exactly the kind of anonymous key
`identity-and-aggregation.md` was trying to avoid needing — not a `User` model, and not what that
spec meant by "identity." Sending a "follow-up shown" / "follow-up answered" event carries no
assessment content, so it doesn't touch the encrypted-`Assessment` invariant either.

**What actually shipped:** `FollowUpCard`'s prompt (§5 below, unchanged) now also reports itself
to the API the same way a real check-in does — `POST /signals/follow-up` with
`{ institutionId, sectorId, deviceSignalId, event: "sent" | "answered" }`, deduplicated per
device/sector/week exactly like `checkIns`. Two new columns on `Signal`
(`followUpSent`, `followUpAnswered`) replaced the `SimulatedFollowUp` model in §3 entirely — there
is no separate fabricated table anymore. `GetManagerSignalsUseCase` computes
`followUpResponseRate` (plus the raw `followUpSent`/`followUpAnswered` counts, for a real
"X of Y" reading) from the same visible-sectors-at-the-reference-week set every other real metric
on the dashboard uses, so it inherits the same k=5 suppression. `packages/domain`'s
`MANAGER_METRICS.followUpRate` no longer carries `provenance: "demonstration"`. See
`apps/api/src/modules/signal-checkin/application/use-cases/record-follow-up.use-case.ts` and
`apps/web/src/presentation/hooks/useFollowUpAnswer.ts` for the real implementation.

**Original status line (historical):** design, ready to implement. Derived from `general-documentations/documentacao-produto/prd.md` FR-17 and `general-documentations/documentacao-produto/user-stories.md` US-009, both added 19/07/2026 from the ACM's answer: *"os KPIs prioritários para esta fase são, essencialmente, o número de questionários respondidos e a taxa de resposta da pesquisa de seguimento (follow-up)"* and *"o critério de avaliação está na robustez desse fluxo de triagem → direcionamento → follow-up"*.

## 1. Scope-reduction finding (read this before writing any code)

Checking `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts` and `docs/superpowers/specs/screens/13-manager.md` against the ACM's two named KPIs shows **one of them already exists**:

- "número de questionários respondidos" ≈ the existing `checkInsLast4Weeks` field (`ManagerSignalsResponse`), already computed and already rendered on `ManagerDashboardPage` as the card labeled "check-ins nas últimas 4 semanas".
- "taxa de resposta da pesquisa de seguimento (follow-up)" does **not** exist anywhere in the codebase — this is the only genuinely new aggregate metric.

**Decision:** relabel the existing KPI card's caption from "check-ins nas últimas 4 semanas" to "questionários respondidos (4 semanas)" so it visibly answers the ACM's first named KPI in the ACM's own words, and add exactly one new KPI card for the follow-up response rate. Do not build a second "number of assessments" pipeline from scratch — that would duplicate `checkInsLast4Weeks` for no reason.

## 2. Two independent pieces, on purpose

Per `docs/superpowers/specs/identity-and-aggregation.md` §1 ("Anonymity is a product promise") and the precedent already set by `ManagerDashboardPage` (its data is fabricated/seeded, not derived from real encrypted `Assessment` rows — "structurally impossible" per that same spec), the follow-up feature splits into two pieces that **do not talk to each other**:

- **(A) The manager-facing KPI** — a new fabricated, seeded aggregate metric (`followUpResponseRate`), following the exact same `SimulatedSignal` pattern already used for `overallConcerningRate`. This is what ships the ACM-requested number for the demo.
- **(B) The doctor-facing local prompt** — a single, on-device, non-recurring re-engagement question on `HomePage`, asking "como você está, um tempo depois?" and storing the yes/no answer locally (`localStorage`, via a Zustand `persist` store — same pattern as `apps/web/src/stores/manager-session.store.ts`). This demonstrates the *doctor-side* half of the concept honestly, without inventing a push-notification/scheduling backend this codebase has never had and 6 days cannot responsibly add.

**Why split them:** building (B) so it actually feeds (A) in real time would require the identity/auth layer `identity-and-aggregation.md` explicitly describes as **not yet built and not scheduled** ("no `User` model, no auth... pending the answer to the team's own open question to the challenge organizers"). Wiring them together now would either (a) require building that identity layer under time pressure it was deliberately deferred to avoid, or (b) silently violate the "real doctor assessments are end-to-end encrypted and structurally cannot feed this dashboard" invariant already documented for the burnout-signal KPI. Keeping them decoupled is the same trade-off this codebase already made once; this spec just names it explicitly instead of leaving it implicit.

## 3. (A) Follow-up response rate — API side

New Prisma model, sibling to `SimulatedSignal`, seeded the same way (`apps/api/prisma/seed-data.ts` → `seed.ts`):

```prisma
model SimulatedFollowUp {
  id         String   @id @default(cuid())
  weekStart  DateTime
  sent       Int
  responded  Int
  createdAt  DateTime @default(now())

  @@unique([weekStart])
  @@map("simulated_follow_ups")
}
```

`GetManagerSignalsUseCase` (`apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`) gains a second injected repository and one new response field, computed from the **most recent week** only (same "most recent week" convention `segments`/`overallConcerningRate` already use — see the existing test file's `WEEK_1`/`WEEK_2` fixtures):

```ts
followUpResponseRate: number; // responded / sent for the most recent seeded week; 0 if sent is 0
```

New port (sibling to `SimulatedSignalRepository`, not an extension of it — different table, different shape, same pattern):

```ts
// apps/api/src/modules/manager/application/ports/simulated-follow-up-repository.port.ts
export interface SimulatedFollowUpRow {
  weekStart: Date;
  sent: number;
  responded: number;
}

export interface SimulatedFollowUpRepository {
  findAll(): Promise<SimulatedFollowUpRow[]>;
}

export const SIMULATED_FOLLOW_UP_REPOSITORY = Symbol("SIMULATED_FOLLOW_UP_REPOSITORY");
```

Seed data (mirrors `buildSeedRows` in `seed-data.ts`, same file, new export, same "edit only this table" convention documented there): 6 weeks, one row per week, `sent` and `responded` counts chosen so the current week's rate is a believable, non-perfect number (demo credibility — 100% response rates read as fake).

## 4. (A) Follow-up response rate — frontend side

- `apps/web/src/ports/manager-signals.port.ts`: add `followUpResponseRate: z.number()` to `ManagerSignalsResponseSchema`.
- `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`: relabel the existing second KPI card's caption (§1 decision) and add a third KPI card below the existing row (not squeezed into the same `flex` row — three cards side by side would cramp on a phone-width `PhoneShell`; a second row of one full-width card matches how the trend/segments cards already stack below the KPI row).

## 5. (B) Doctor-facing local follow-up prompt

- New Zustand store `apps/web/src/stores/followup.store.ts`, `persist`-backed by `localStorage` (not `sessionStorage` — this should survive across app restarts, unlike the manager session), tracking: has a prompt been shown+answered yet, and what the answer was (`"yes" | "no" | null`).
- New pure use case `apps/web/src/use-cases/should-show-followup-prompt.usecase.ts`: given the existing `WeeklyHistoryPoint[]` from `GetAssessmentHistoryUseCase` (already available via `useAssessmentHistory()` on `HomePage`) and today's date, returns `true` once at least one assessment exists, at least `FOLLOWUP_INTERVAL_DAYS` (constant, resolved below) have passed since the most recent one, and the store has no answer yet.

  *Reconciled 21/07/2026 (flagged by the final whole-branch review as a wording tension with the "single, non-recurring" framing below):* "no answer yet" here means the store's global `answer` flag is still `null` — there is only ever one occurrence per install, matching §2's "single, on-device, non-recurring" design, not a per-assessment/per-cycle occurrence. Once a doctor answers once, ever, the prompt does not reappear after a later assessment. This is the intended PoC behavior, not a bug; a real per-cycle follow-up (reappearing after each new assessment) is future scope, not this task's.
- `HomePage.tsx` renders a small `Card` follow-up prompt above the existing history chart when the use case returns `true`, with two buttons ("Estou bem" / "Não estou bem") that record the answer in the store and dismiss the card. No network call, no server write — this is intentionally the same "local-only, honestly labeled" pattern as (A) is fabricated-only; the two are not meant to reconcile.

**Resolving US-009's open question (follow-up interval):** `FOLLOWUP_INTERVAL_DAYS = 3`. Chosen for two reasons: (1) short enough to be observable live in a 4-minute demo by backdating a fake assessment record rather than waiting real days; (2) still plausible as a real product interval for a first check-in after a triage/direction event. This is a resolved implementation decision, not a placeholder — if the team later wants a different number, it's a one-line constant change (`apps/web/src/use-cases/should-show-followup-prompt.usecase.ts`), documented here so nobody re-litigates it under time pressure.

## 6. Acceptance criteria

- **(A)** `GetManagerSignalsUseCase.execute()` returns `followUpResponseRate` computed only from the most recent seeded week, `0` (not `NaN`) when `sent` is `0`. `ManagerDashboardPage` renders a third KPI card with this percentage, and the existing check-ins card now reads "questionários respondidos" in its caption.
- **(B)** `HomePage` shows the follow-up prompt only when history has ≥1 assessment **and** ≥3 days have passed since the most recent one **and** no answer is stored yet; answering either option hides the prompt and persists the answer across a re-render/reload (localStorage); nothing is sent over the network by answering it.
- Both pieces (A) and (B) are independently testable and neither imports from the other.
