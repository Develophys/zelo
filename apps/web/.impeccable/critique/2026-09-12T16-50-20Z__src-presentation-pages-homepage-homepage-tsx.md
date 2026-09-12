---
target: Home page (HomePage.tsx)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-12T16-50-20Z
slug: src-presentation-pages-homepage-homepage-tsx
---
Method: dual-agent (A: ac68ca4c56db10df9 · B: af61a6bafbf9b54c4)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Strong overall; the institution nudge's *initial* appearance carries no live-region announcement, unlike its sibling FollowUp prompt. |
| 2 | Match Between System and Real World | 4 | Fluent, domain-appropriate PT-BR throughout. |
| 3 | User Control and Freedom | 2 | The follow-up pulse-check can only ever be answered once, ever — see P1 below. |
| 4 | Consistency and Standards | 3 | Card/button/focus-ring patterns consistent; the live-region gap is the one real inconsistency. |
| 5 | Error Prevention | 3 | History-fetch retry; low-risk actions correctly skip confirmation. |
| 6 | Recognition Rather Than Recall | 4 | No icon-only controls; AI/human captions and chart legend both spell things out. |
| 7 | Flexibility and Efficiency of Use | 2 | System-wide hotkeys exist; Home's own cards offer no accelerators. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean rhythm; dented slightly by the worst-case simultaneous-card composition. |
| 9 | Error Recovery | 3 | The one error surface (history fetch) is plain, actionable — narrow sample. |
| 10 | Help and Documentation | 2 | Real contextual help exists (chart caption, encryption modal) but nothing explains why the pulse-check or nudge appear. |
| **Total** | | **29/40** | **Good (72%)** |

**This is not a regression** — it's the same total as Run 1, one point below Run 2, because this pass found a real, previously-undiscovered functional bug (P1 below) that neither prior pass surfaced, not because anything shipped between runs made the page worse.

## Design Specificity Verdict

**LLM:** Still grounded — shift-aware greeting, a card-ordering rationale that's actually reflected in behavior, clinically-real chart color logic, and now AI/human honesty disclosed via caption before the tap, directly serving PRODUCT.md's own stated principle at the exact decision point it matters.

**Deterministic scan:** Zero findings across all six files (HomePage's four cards + InstitutionLinkCard + Button.tsx's new `inverse` variant) — but Assessment B did real diligence this time and found something important: **the detector's regex/text engine doesn't parse Tailwind `className` strings at all** — its CSS extraction targets inline `style="..."` attributes and CSS-in-JS template literals, neither of which this codebase uses. Confirmed by testing the detector against a throwaway file with blatant anti-patterns (glow shadow, Arial, low-contrast gray, `transition: all`) written as Tailwind classes — still `[]`. **The clean scan is a tooling blind spot for this codebase's styling approach, not evidence of quality**, and should be weighted near zero going forward for Tailwind-only files.

**Visual overlays:** Unavailable, no browser tool this session.

## Overall Impression

The fixes from both prior passes hold up under fresh, independent scrutiny — nothing regressed. But going deeper this time surfaced something more significant than either prior pass found: `FollowUpCard`'s pulse-check silently stops working forever after the first time anyone answers it, for every install, with no reset path anywhere in the codebase. That's a real lifecycle bug in one of Home's few recurring, proactive touchpoints — worth more than the two focus/live-region P2s found alongside it, even though the total score reads the same as Run 1.

## What's Working

1. **The card-ordering rationale is executed, not just written** — the in-code comment about check-in-first, contact-paths-above-chart, housekeeping-last is backed by real behavior.
2. **The "não estou bem" reassurance path** — in-place acknowledgment, a real navigable link, copy that sounds like a person. Called out as the best-executed moment on the page for a third straight pass.
3. **AI-honesty discipline** — "Acolhimento por IA" / "Colega anônimo" disclose the nature of each contact path before the tap, serving a named product principle exactly where it matters.

## Priority Issues

**[P1] The recurring pulse-check can only ever fire once, ever, per install**
- **Why it matters:** `useFollowUpStore`'s `answer` field is set by `FollowUpCard.tsx` on tap and **never reset anywhere in the codebase**. `ShouldShowFollowUpPromptUseCase` gates on `answer !== null`, so answering once — "Estou bem" or "Não estou bem" — permanently suppresses the card, even after a brand-new assessment weeks later. PRODUCT.md names "checking in regularly" as the success metric; this silently kills one of the few proactive touchpoints toward that, for every user, with zero signal that it happened.
- **Fix:** Reset `answer`/`answeredAt` when a new assessment is recorded, or gate `alreadyAnswered` against `answeredAt` vs. the *current* `mostRecentAssessmentAt` so a new check-in re-arms the prompt.
- **Suggested command:** `/impeccable harden`

**[P2] Focus can still be orphaned on InstitutionLinkCard's unlink path**
- **Why it matters:** Run 2's fix handles the dismiss path correctly. But `Desvincular` (unlink) re-enters the same `institutionId === null` branch — if the nudge was dismissed within its 2-day snooze window and the doctor then unlinks, `showNudge` is false, the component returns `null`, the just-clicked button unmounts, and `ctaRef.current?.focus()` silently no-ops. Focus falls to `<body>`. Same defect class already fixed once, not covered for this adjacent transition.
- **Fix:** Give `shouldFocusCta` a fallback target (e.g. a `tabIndex={-1}` container, the same technique already used for `dismissAckRef`) for the case where no button exists post-unlink.
- **Suggested command:** `/impeccable harden`

**[P2] Inconsistent live-region treatment between Home's two conditional cards**
- **Why it matters:** `FollowUpCard`'s initial prompt has `role="status" aria-live="polite" aria-atomic="true"`. `InstitutionLinkCard`'s structurally identical initial nudge has neither — only its *dismissal* acknowledgment got that treatment in the Run 2 fix. Same interaction shape, inconsistent announcement, no evident reason — undercuts confidence the accessibility work is systematic rather than reactive to specific past findings.
- **Fix:** Apply the same live-region wrapper to the nudge's initial render.
- **Suggested command:** `/impeccable harden`

## Cognitive Load

**0 clean failures, one flagged watch-item.** Every individual card passes the checklist, but no prior review looked at the worst-case *composition*: a doctor at day-3 with an unlinked institution sees six independent tap targets stacked on one screen at once (hero CTA, two follow-up buttons, two contact tiles, two nudge buttons) — a materially different load than the one-or-two-card state the ordering comment was reasoned about.

## Persona Red Flags

**Sam (Accessibility-Dependent):** unlink-after-stale-dismiss orphans focus with no indication of what happened (P2); the nudge's appearance isn't announced the way its dismissal is (P2) — Sam may not notice the card appeared at all.

**Jordan (Confused First-Timer):** could answer the pulse-check once out of curiosity, with no way to know it retires the feature forever (P1) — its later disappearance reads as nothing, not as a loss.

**Casey (Distracted Mobile User):** the hero CTA sits at the very top of scroll (hardest one-handed reach), though the bottom-nav Check-in tab mitigates this; in the worst-case compound state, six stacked targets replace the cleaner state the design was reasoned around.

## Minor Observations

- The `mt-3.5 short:mt-2` spacing literal is now authored in three separate places (twice in `HomePage.tsx`, once hardcoded inside `HistoryChartCard.tsx` rather than received as a prop like its siblings) — no bug today, but a future value change needs three edits to stay consistent.
- `CheckInHeroCard.tsx` wraps its `Card` in a plain `<div>` that contributes nothing — likely leftover scaffolding.
- The contact tiles' `IconBadge` (light sage) sits on the tiles' own `bg-brand/5` background — same-family tints stacked, slightly reducing the badge's pop versus sitting on a neutral surface elsewhere.
- The inline "Falar com alguém" link is a bare underlined text link with no button chrome — acceptable under the inline-link exception to the 44×44 target rule, worth confirming it's deliberate rather than an oversight, since every other actionable element on this page is a full Button/CardButton.

## Questions to Consider

- Was the pulse-check's one-shot behavior ever meant to be permanent, or did the reset path simply never get exercised in testing?
- Now that the nudge's dismissal is announced, should its appearance be too — or was leaving it silent deliberate?
- Has anyone reviewed Home in its worst-case composition (day-3 follow-up pending *and* institution unlinked, both live at once) rather than each conditional card in isolation?
