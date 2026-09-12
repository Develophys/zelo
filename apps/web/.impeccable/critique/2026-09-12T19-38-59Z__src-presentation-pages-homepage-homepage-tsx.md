---
target: Home page (HomePage.tsx)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-12T19-38-59Z
slug: src-presentation-pages-homepage-homepage-tsx
---
Method: dual-agent (A: a2a716548c67bbc91 · B: a341d5743c54b12a5)

## Verification of the Two Claimed Fixes (from Round 6)

Assessment A traced both through current source rather than assuming: the skeleton removal is confirmed (FollowUpCard returns `null` while loading, no skeleton-shaped placeholder remains), and the `showAcknowledgment` 24h window is confirmed correctly wired end to end (`useFollowUpAnswer.ts` → `FollowUpCard.tsx` → `HomePage.tsx`), with the underlying "don't re-ask this cycle" logic left intact and uncontaminated. **Neither fix introduced a new defect.** The two issues below are pre-existing, not caused by Round 6.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good overall; FollowUpCard gives no confirmation of where focus lands after answering. |
| 2 | Match System / Real World | 4 | Fluent, warm PT-BR; shift-aware greeting. |
| 3 | User Control and Freedom | 3 | Nudge dismissible; no undo on a submitted pulse-check answer, but stakes are low. |
| 4 | Consistency and Standards | 3 | InstitutionLinkCard has focus management for its in-place reveal; FollowUpCard doesn't, for the identical interaction shape. |
| 5 | Error Prevention | 4 | Nothing destructive lives on this screen. |
| 6 | Recognition Rather Than Recall | 4 | Every icon paired with text. |
| 7 | Flexibility and Efficiency of Use | 2 | Real app-wide hotkeys exist; no page-specific ones — correct for a single-path screen, not treated as a gap. |
| 8 | Aesthetic and Minimalist Design | 4 | Cards render only when relevant; restrained palette. |
| 9 | Error Recovery | 3 | HistoryChartCard surfaces its fetch error; FollowUpCard shares the same query but silently renders nothing on the same failure. |
| 10 | Help and Documentation | 2 | Contextual help exists appropriately for this screen's simplicity — not treated as a gap. |
| **Total** | | **32/40** | **Good (80%)** |

## Design Specificity Verdict

**LLM:** Strongly product-specific — the shift-aware greeting, the in-code ordering rationale, the k-anonymity-aware copy, and AI/human honesty surfaced before the tap all read as decisions made for this exact product. **Deterministic scan:** zero findings across all five files (four HomePage + the hook), confirmed still near-worthless as evidence given the same Tailwind blind spot as every prior pass — 7 rounds running for the same structural reason. **Overlays:** unavailable.

## Overall Impression

Score moved 33→32, but for a different reason than the last dip: this time neither of Round 6's fixes introduced anything new (independently verified). The two findings here are genuine, pre-existing gaps that six rounds of fixing other things hadn't reached yet — one is a clear, mechanical accessibility fix with an exact pattern already sitting in the same directory to copy; the other is a real product question, not a code bug, and is presented as such.

## What's Working

1. **The card-ordering rationale remains load-bearing product thinking**, not decoration — six rounds in, still holds up.
2. **FollowUpCard's in-place acknowledgment** — still well-judged copy, still the right emotional-design call.
3. **Zero cognitive-load checklist failures** — sustained across rounds without collapsing into either bare-bones or cluttered.

## Priority Issues

**[P1] FollowUpCard loses keyboard focus after every answer, with no restoration**
- **Why it matters:** `InstitutionLinkCard.tsx` already solved this exact shape of problem (swap a card's content in place after an action) with `dismissAckRef`/`unlinkAckRef`/`shouldFocusCta` — but that pattern was never carried to `FollowUpCard`, which handles the screen's single most emotionally loaded input ("não estou bem"). A keyboard-only user (an explicit PRODUCT.md commitment: "every flow operable by keyboard alone") gets no confirmation of where they landed at exactly the moment reassurance matters most.
- **Fix:** Add a ref + `tabIndex={-1}` to the acknowledgment `Card` and a `useEffect` that focuses it after `recordAnswer` — mirroring `InstitutionLinkCard`'s existing pattern directly rather than inventing a new one.
- **Suggested command:** `/impeccable harden`

**[P2] Institution-nudge suppression only watches the FollowUp pulse-check, not the full assessment severity it's modeled on protecting against**
- **Why it matters:** `HomePage.tsx`'s own comment frames the suppression as existing so the institution ask "must never share a view with a 'não estou bem' disclosure" — but the only signal checked is the lightweight pulse answer. `HistoryChartCard` renders the actual PHQ-9/GAD-7-derived severity (high/severe bands) directly above `InstitutionLinkCard` with zero suppression tied to it, even though that score is this product's primary, authoritative distress signal.
- **Fix:** This is a product call, not a pure design one (PRODUCT.md's own "Undecided" section already flags the burnout-signal metric as open) — extend the suppression to the latest week's severity band if that's the intended scope, or explicitly scope the comment to "pulse-check only" if the narrower behavior is deliberate.
- **Suggested command:** `/impeccable clarify`

## Cognitive Load

**0 of 8 items fail — low cognitive load**, sustained across rounds without regression.

## Persona Red Flags

**Jordan:** "Conversar agora" and "Falar com um par" are visually identical (same tone, layout, weight), differing only in a small caption — a fast skim could still tap the AI card believing it's a person, undercutting the honesty principle the code says it exists to serve. **Sam:** directly hits P1 — focus vanishes into `<body>` with no landing point after answering; secondary lower-confidence note that a newly-mounted live region may announce less reliably than one already present before the update. **Casey:** the top-of-scroll hero CTA is the hardest one-handed reach, meaningfully mitigated by the bottom-nav Check-in tab.

## Minor Observations

- `HistoryChartCard.tsx` hardcodes its own wrapper margin instead of accepting a `className` prop like its siblings — the odd one out in an otherwise consistent pattern.
- `showAcknowledgment`/`justDisclosedDistress` are derived from `Date.now()` at render time only, with no timer forcing a re-render at the 24h boundary — a tab left open across that exact boundary won't self-correct until something else triggers a render.
- FollowUpCard and HistoryChartCard share the same query, but only HistoryChartCard surfaces a visible error+retry for a fetch failure.

## Questions to Consider

- Could the pulse-check and the full assessment read as one entry point with the pulse as a visibly lighter first step, rather than two cards to parse as different things?
- Should the "never share a view with a distress signal" rule extend to a severe HistoryChartCard reading, not just the FollowUp "não"?
- Is a keyboard-only médico able to complete every interaction on this screen today, or only the ones that happen to leave something in the DOM worth refocusing?
