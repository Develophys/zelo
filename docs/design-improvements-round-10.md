# Zelo — Design Improvements, Round 10

Tenth Impeccable `/critique` of `apps/web`, run after round 9's remediation landed on `main`. Two
isolated agents — a design-director review and a deterministic detector + live-browser evidence
pass — independently re-examined the running app, starting with a regression check on round 9's own
fixes.

Round 8: [design-improvements-round-8.md](./design-improvements-round-8.md).
Round 9: [design-improvements-round-9.md](./design-improvements-round-9.md).

**Design health at the start of this round: 28/40.** Fixed a genuine P0 and both P1s below, plus two
P2s from the same report. A fresh critique run (not done as part of this round) is needed for an
authoritative post-fix score — the numbers below describe what was found and what was fixed, not a
re-measured total.

**Status: mostly closed.** One P0 and two P1s fixed and verified live. Two P2s fixed. Two items —
the manager insight history page's raw-prompt summary, and a peer-partner availability toggle — are
scoped but not started; the second is a genuine new feature (deferred since round 5), not a quick fix.

Legend: ✅ fixed · ⬜ scoped, not started.

---

## Method note — regression-checking round 9 before looking for anything new

Assessment A verified round 9's fixes first, empirically, before evaluating anything else: the
sector-filter isolate-not-exclude fix held, the trend chart's unified mobile/desktop scale held, the
notification ×N grouping and type filter both worked correctly against live data. Assessment B's
first browser pass silently lost manager/peer authentication (a fresh Playwright tab per route breaks
`sessionStorage`-scoped session state) — caught by tracing an anomalous finding back to source before
it was reported, not accepted at face value, and the full route set was rerun correctly.

## P0 — Blocking

1. ✅ **`/home`'s latest bar always rendered brand-green, regardless of severity.** Verified: a
   maximal PHQ-9 (27/27 — "Grave" in danger red on `/assessment/result` a moment earlier) drew as a
   full-height `bg-brand` bar labelled "100%" on `/home`, the screen every session starts and ends on.
   Root cause: `HistoryChartCard.tsx`'s bar-color ternary hardcoded the latest bar to `bg-brand`
   (the user's *chosen accent color* — customizable in settings, not a stable clinical signal — and
   coincidentally equal to the "minimal" band color only at the default accent). Fix: every bar now
   colors by its own severity band via a new `bandForSeverityFraction` (in `band-for.ts`, reusing the
   existing PHQ-9/GAD-7 band system the result screen already scores against, applied to the chart's
   normalized 0–1 axis); `bg-brand` is reserved for genuinely minimal/mild readings. Peak still wins
   on fill color (unconditional `bg-warn`), and precedence flips to peak-first on coincidence,
   matching `ManagerDashboardPage`'s already-established pattern — the "Mais recente" legend dot now
   dynamically matches whatever color the bar actually renders, instead of a hardcoded swatch that
   could contradict a severe bar. `describeHistoryWeek`'s screen-reader text now carries the band
   label alongside the percentage, closing the same gap for a screen-reader user. Six new tests.

## P1 — Major

1. ✅ **A sector-filtered `/manager` with no visible data printed fabricated numbers.** Verified live
   via `curl`: filtering to a real, existing sector returned
   `{overallConcerningRate:0, checkInsLast4Weeks:0, weeklyTrend:[], segments:[], followUpResponseRate:0.7}`
   — the KPI row rendered `0%` / `0` / `70%` in the page's largest type, directly above two cards that
   correctly said "sem dados." `followUpResponseRate` is computed hospital-wide and is structurally
   immune to the sector filter, so `70%` sat beside `0 questionários respondidos`, contradicting
   itself. Fix: when `checkInsLast4Weeks === 0`, the KPI row now withholds all three numerals with the
   same "not enough data" treatment the trend and segments cards already use, instead of printing a
   0%-burnout reading that looks like a real all-clear. `ManagerDashboardPage.tsx`, one new test.

2. ✅ **Chat redaction missed a trailing CRM state suffix and the médico's own name.** Verified:
   `CRM 123456-SP` redacted only to `[CRM]-SP` (the existing regex covered the state code before the
   digits, `CRM-SP 123456`, but not after), and a name following "Sou o Dr. Ricardo" passed through
   completely untouched. Round 9 made redaction visible in the sent bubble, which made this gap
   directly visible to a médico testing the claim. Fix: extended the CRM pattern to consume an
   optional trailing state suffix, and added a targeted `[NOME]` rule matching a capitalized name
   immediately after a handful of self-identification phrases (`Dr./Dra.`, `sou o/a`,
   `meu nome é`, `me chamo`) — deliberately narrow, so an unrelated capitalized word (a colleague's
   name mentioned in the third person, a sentence-initial word) is left alone.
   `anonymize-text.usecase.ts`, four new tests including a negative case.

## P2 — Minor

1. ✅ **A sector actually crossing its burnout risk threshold rendered identically to a routine
   expired invite.** Verified: both computed to byte-identical `background-color`/`border-color` in
   `ManagerNotificationsPage.tsx` — `GOOD_NEWS_TYPES` splits the list by sentiment, not consequence,
   so the two rows in a typical 15-row list that are actually about a team burning out sat at equal
   visual weight with routine invite/account housekeeping. Fix: `SECTOR_RISK_THRESHOLD` now gets its
   own distinct danger tone (`border-danger-border`/`bg-danger-bg`), verified visually against real
   seed data alongside an unchanged, still-amber expired-invite row. One new test.

2. ⬜ **`/manager/history` shows the LLM's raw input prompt where the interpretation belongs**, with
   `Gerar análise` positioned where a search field's own submit button would be. Scoped by Assessment
   A but not started this round.

## Not started — needs its own scoping pass

- **Peer partner has no availability control.** `PeerPartnerInboxPage.tsx` has no "not now" short of
  logging out; a médico in distress could be matched to a colleague who is scrubbed in. Deferred as
  out-of-scope since round 5 — this is a genuine feature (new state, likely a backend flag, dashboard
  implications for the médico-facing peer list), not a quick fix, and needs its own design
  conversation before implementation.

---

## Also verified, no action needed

- **Both round-9 P0/P1 fixes hold up under regression check**, verified live: sector filter isolates
  correctly, trend chart scale is unified across breakpoints.
- **`nested-cards` on `/chat`'s composer, `clipped-overflow-container` on manager admin routes** —
  Assessment B flagged both as needing manual confirmation; visually confirmed flat toolbar bars (no
  actual nested-card appearance) and confirmed the only popover-like component (`Modal.tsx`) renders
  via a native `<dialog>`, immune to ancestor `overflow` regardless of DOM nesting. Same conclusion as
  rounds 8 and 9's independent investigations of the same two patterns.
- **CLI detector: zero findings across ~180 files**, verified non-broken via a positive-control test.
- **`layout-transition` on `body`, all routes** — a detector-side false positive, contradicted by
  direct `getComputedStyle` sampling showing `transitionProperty: "all"`, which the rule's own source
  explicitly excludes.

## Minor Observations Remaining

- `/peers` instructs "Toque em 'Falar com um colega'" for a control gated behind hospital linking and
  not present on that screen; the same action is named differently across `/home`, `/peers`, and the
  page title ("um par" / "um colega" / "Pares anônimos").
- LGPD is never named in any shipped UI screen — only in a test description. The gestor-facing screens
  name NR-1/PGR with precision; the médico's own consent screen doesn't name the law it operates
  under.
- Mobile bottom nav wraps "Check-in" onto two lines at 320px, breaking the icon baseline.
- `severityFraction` normalizes PHQ-9 and GAD-7 onto one shared axis and keeps only the first reading
  per week if both scales were used in the same week — worth a product conversation about what "Seu
  histórico" is meant to be a history *of*.
