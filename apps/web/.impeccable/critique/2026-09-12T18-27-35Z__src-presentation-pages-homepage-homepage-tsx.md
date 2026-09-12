---
target: Home page (HomePage.tsx)
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-12T18-27-35Z
slug: src-presentation-pages-homepage-homepage-tsx
---
Method: dual-agent (A: ab7aa740ec5dc56c2 · B: a403e168748154c68)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | FollowUpCard's loading skeleton collapses to zero height in the common ("nothing to show") case, reintroducing the shift it was built to fix. |
| 2 | Match System / Real World | 4 | Plain PT-BR, no jargon, shift-aware greeting. |
| 3 | User Control and Freedom | 3 | Nudge and unlink both have real exits; the pulse-check prompt still has no neutral dismiss (known, open). |
| 4 | Consistency and Standards | 3 | Shared components used consistently; skeleton geometry drifts slightly from the real control (8px). |
| 5 | Error Prevention | 4 | Confirm-before-unlink; nothing destructive lives on Home itself. |
| 6 | Recognition Rather Than Recall | 4 | Every action is labeled text + icon. |
| 7 | Flexibility and Efficiency of Use | 2 | Only app-wide hotkeys apply; nothing Home-specific. |
| 8 | Aesthetic and Minimalist Design | 4 | Clean hierarchy, deliberate and documented ordering. |
| 9 | Error Recovery | 4 | HistoryChartCard's error state remains a model example. |
| 10 | Help and Documentation | 3 | Chart's inline caption and the header's encryption modal both count as real contextual help. |
| **Total** | | **33/40** | **Good (82%)** |

## Design Specificity Verdict

**LLM:** Still clearly authored for Zelo — the shift-aware greeting, the IA reasoning shipped inline with the card order, and the AI/human captions all serve named product principles, not decoration.

**Deterministic scan:** Zero findings across all six files (four HomePage + InstitutionLinkCard + the new useFollowUpAnswer hook). Assessment B re-verified the blind-spot caveat by grepping all six files against the detector's actual 7 hard-coded Tailwind regex families directly — zero matches, confirming the empty scan is expected, not evidence of quality, for the same reason as every prior pass.

**Visual overlays:** Unavailable, no browser tool this session.

## Overall Impression

Score dipped 34→33, and unlike prior dips this one isn't "a deeper pass found something new" — it's two real, specific costs of last round's own fixes, caught under fresh scrutiny. The loading-skeleton fix for FollowUpCard only covered the path where something ends up showing; the far more common "nothing to show" path still shifts content after paint, the exact bug the fix was meant to close. And the remount-survival fix for the acknowledgment didn't put a time bound on how long "Obrigado por dizer." — and the nudge suppression riding on the same flag — should stay live, so both now persist for the doctor's entire multi-day assessment cycle instead of the one visit they were meant for.

## What's Working

1. **The IA reasoning ships with the code, not just as tribal knowledge** — the card-ordering comment states intent a reviewer can check the layout against.
2. **AI-vs-human honesty surfaces before commitment** — the captions deliberately avoid reusing "Falar com alguém," which is reserved for the human/crisis path elsewhere.
3. **HistoryChartCard's empty/error handling is honest, not lazy** — genuinely distinct states, plain language, explicit reassurance.

## Priority Issues

**[P1] FollowUpCard's loading skeleton reintroduces the layout-shift bug it was built to fix — for the more common case**
- **Why it matters:** The skeleton only covers the answered/prompt-shown paths. Most Home visits over the app's life hit the `shouldShowPrompt === false` → render `null` branch (no completed assessment yet, or under the 3-day interval and unanswered) — in that branch, the reserved-height skeleton still shows, then vanishes a beat after paint, and everything below (the two contact tiles, the chart, the institution card) jumps up. On a one-handed phone screen, a tap aimed at a contact tile moments after first paint can land wrong.
- **Fix:** Don't render a content-shaped skeleton for a slot whose most likely resolution is "nothing." Reserve a fixed minimal height that matches the null outcome, or make the render decision available before the round-trip so the "nothing to show" branch can be taken immediately.
- **Suggested command:** `/impeccable layout`

**[P2] The distress acknowledgment — and the nudge suppression riding on it — has no time bound**
- **Why it matters:** `answeredThisCycle` stays true for the doctor's entire assessment cycle, which can span days. FollowUpCard renders the literal "Obrigado por dizer." on every Home visit during that whole window, not just the one right after answering — days later it reads as stuck or insincere in an app whose core trust proposition is that it listens. The same flag unconditionally suppresses InstitutionLinkCard's nudge for that same open-ended span, silently overriding the nudge's own tuned `INSTITUTION_NUDGE_SNOOZE_DAYS = 2` cooldown with no cap of its own.
- **Fix:** Bound the acknowledgment's visible lifetime (same order of magnitude as the nudge's own cadence, or same-day-only), while keeping the underlying "don't re-ask this cycle" logic intact.
- **Suggested command:** `/impeccable clarify`

## Cognitive Load

**0 failures, low overall** — single focus, clean chunking/grouping, no decision point exceeds 2 options.

## Persona Red Flags

**Casey:** the skeleton-collapse (P1) is her exact failure mode — thumb already moving as content shifts. If she answered "não" Monday and returns Thursday for something unrelated, the identical "Obrigado por dizer" card reappears, reading as if the app forgot three days passed. **Jordan:** on her very first-ever visit (no history), she'll see the skeleton's two button-shapes appear and vanish within a beat of landing, before she's decided what to read. **Sam:** nothing new confirmed-broken from source alone; whether the initial-prompt `aria-live` wrapper double-announces on first mount needs a real screen-reader pass this environment doesn't have.

## Minor Observations

- FollowUpCard's skeleton buttons are `h-11` (44px) while `Button`'s default is `min-h-13` (52px) — an 8px mismatch, so even the correctly-reserved paths have a small residual shift.
- `CheckInHeroCard.tsx` wraps its `Card` in a bare, unstyled `<div>` that does nothing.
- `getGreeting(new Date().getHours())` is computed inline in the `headerOverride` object literal on every render — not user-visible, worth a look if re-render cost ever matters.

## Questions to Consider

- Should the loading skeleton ever collapse to zero height, even when the true answer turns out to be "nothing here"?
- Three days after "Obrigado por dizer" was said, does it still mean what it says — or does the acknowledgment need its own expiry, separate from the "don't re-ask this cycle" logic it's welded to?
- Should any suppression path be allowed to override the institution nudge's tuned 2-day cooldown indefinitely, or should every suppression path defer to the nudge's own cooldown check instead of short-circuiting it?
