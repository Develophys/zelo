---
target: Home page (HomePage.tsx)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-12T14-10-17Z
slug: src-presentation-pages-homepage-homepage-tsx
---
Method: dual-agent (A: a2da62487b655960e · B: a6eaa0ed4a15a4e90)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading skeleton, error+retry, in-place follow-up ack are solid; the follow-up swap has no `aria-live`. |
| 2 | Match System / Real World | 4 | Fluent PT-BR, shift-aware greeting, no icon-only labels. |
| 3 | User Control and Freedom | 3 | "Desvincular" refocuses correctly; the institution nudge has no permanent dismiss. |
| 4 | Consistency and Standards | 2 | Two incompatible "tappable card" contracts sit back-to-back (see P1 below). |
| 5 | Error Prevention | 3 | Only error surface (history fetch) is handled well; no destructive actions live on Home. |
| 6 | Recognition Rather Than Recall | 4 | Every icon carries a visible text label. |
| 7 | Flexibility and Efficiency of Use | 3 | Real keyboard hotkeys at the shell level (`k`, `c`); no quick-log alternative to the full assessment on Home itself. |
| 8 | Aesthetic and Minimalist Design | 2 | Hero card reads as primary; everything below sits at identical visual weight with no progressive disclosure. |
| 9 | Help Recognize/Diagnose/Recover from Errors | 3 | The one error message present is exemplary (plain, reassuring, retry) but it's the only sample. |
| 10 | Help and Documentation | 2 | Only contextual help is the encryption-info modal; nothing for check-in or crisis path. |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict

**LLM assessment (Assessment A):** Authored for Zelo, not category-interchangeable, with one caveat. The shift-aware greeting (`getGreeting`, 00:00–05:00 gets its own "Boa madrugada."), the history chart's bar colors mapping to the same `band-minimal/mild/moderate/high/severe` tokens the assessment scorer itself uses, the explicit anonymity reassurance in the institution-link copy, and a code comment justifying the exact card order against this app's crisis-adjacent stakes are all real domain thinking, not boilerplate. The caveat: the *chrome* — a colored hero card, a row of icon-plus-label tiles, a bar-chart card, a nudge card — is a generic "cards on a dashboard" vocabulary that would work for a fitness app or task manager if the copy were swapped. Specificity lives in content and color semantics, not in interaction shapes.

**Deterministic scan (Assessment B):** `detect.mjs --json` against `HomePage.tsx`, `CheckInHeroCard.tsx`, `FollowUpCard.tsx`, `HistoryChartCard.tsx`, and `InstitutionLinkCard.tsx` — exit code 0, zero findings across all five files. The scan was verified genuine (not a silent no-op): the detector is a real 390 KB rule engine, not a stub, and it operates in **regex-pattern mode** for `.tsx` source (per its own `--help`), not rendered-DOM or CSS-cascade analysis. A clean result here means "no matched anti-pattern regexes in source" — it says nothing about cross-component visual-hierarchy or consistency problems, which is exactly the category Assessment A's priority issues fall into below. The two assessments don't contradict each other; they're looking at different failure classes, and the detector's cleanliness doesn't clear the structural issues A found.

**Visual overlays:** Not available. No browser automation tool is exposed in this session, so no live screenshot or rendered-DOM overlay could be captured — both assessments confirmed this independently rather than faking it from source.

## Overall Impression

The page's content and prioritization logic are genuinely well-reasoned — the card order, the follow-up's reassurance copy, and the accessible chart construction all show real care for a doctor in a vulnerable moment. What's missing is that the *visual system* doesn't encode any of that reasoning: the two most important actions on a crisis-adjacent screen (reach a person) render at the exact same weight as a trend chart and an institutional housekeeping nudge, and two adjacent card rows use incompatible interaction contracts. The single biggest opportunity is making visual hierarchy do the work the code comments say already happened in the ordering logic.

## What's Working

1. **`FollowUpCard`'s in-place acknowledgment** — a documented, deliberate fix (the old behavior unmounted the card and "the question disappeared and nothing happened") that now validates ("Obrigado por dizer.") and immediately offers both human-contact routes. The single best piece of craft on the page.
2. **Deliberate, reasoned content order** — the code comment justifying "check-in leads → follow-up sits with it → the two ways to reach a person → chart → institution link last" reflects real prioritization of user need over institutional need.
3. **Accessible chart construction** — `HistoryChartCard`'s decorative bars are `aria-hidden`, backed by a parallel `sr-only` list carrying the real semantic content — deliberate engineering, not an afterthought alt tag.

## Priority Issues

**[P1] Flat visual hierarchy strands the two human-contact CTAs at the same weight as a chart and a housekeeping nudge**
- **Why it matters:** "Conversar agora"/"Falar com um par" use the same `bg-surface`/`shadow-card` tone as the history chart card and the "Ainda não vinculado a um hospital" nudge. The one place the code's own reasoning says matters most ("nobody in distress should have to scroll past a chart to find them") is encoded only in ordering, never in visual weight.
- **Fix:** Give the two human-contact CardButtons a distinct tone (e.g. `surface-brand` tint or accent border) so they read as a tier above the reporting/housekeeping cards.
- **Suggested command:** `/impeccable clarify`

**[P1] Two incompatible "tappable card" interaction models sit back-to-back**
- **Why it matters:** `CheckInHeroCard`/`FollowUpCard` use a `Card` plus a separate inner `<Button>`; the row directly below makes the *entire* `CardButton` clickable with no inner button. Same surface-colored, shadowed rectangle, two different contracts, one screen apart — a direct consistency violation that undermines recognition.
- **Fix:** Standardize on one model: either every primary-action card on Home is whole-card-clickable, or every one carries an explicit inner button.
- **Suggested command:** `/impeccable harden`

**[P2] Redundant, differently-styled "Conversar agora" in the worst-case state**
- **Why it matters:** After tapping "Não estou bem," the acknowledgment renders a small pill button labeled "Conversar agora" directly above the large icon-tile `CardButton` labeled identically a short scroll below — at exactly the highest-stakes moment on the page, the UI shows the same action twice in two different shapes.
- **Fix:** When the acknowledgment renders its own contact button, suppress or merge with the row below instead of duplicating it.
- **Suggested command:** `/impeccable clarify`

**[P2] No dismiss/exit for the institution-link nudge**
- **Why it matters:** The "Vincular agora" nudge has no alternative action while unlinked — a doctor who deliberately doesn't want to link sees it on every visit indefinitely, with no "not now." A genuine User Control and Freedom gap on a page that otherwise handles reversibility well (the unlink flow refocuses correctly).
- **Fix:** Add a low-commitment dismiss that suppresses the nudge for a period, distinct from actually linking.
- **Suggested command:** `/impeccable clarify`

**[P3] Near-duplicate "how are you" copy across two different mechanisms**
- **Why it matters:** "Como você está hoje?" (hero, launches the full 5-minute assessment) and "Como você está, um tempo depois?" (follow-up, a 1-tap pulse check) are lexically almost identical for very different-weight interactions — a skimming, tired user could conflate the two.
- **Fix:** Sharpen the follow-up's framing (e.g. "Só uma checagem rápida:") so the two read as distinct mechanisms at a glance.
- **Suggested command:** `/impeccable clarify`

## Cognitive Load

**4 of 8 checklist items failed → high cognitive load.** In the worst-case render (follow-up showing), the screen simultaneously offers 6 live decision points (Fazer check-in, Estou bem, Não estou bem, Conversar agora, Falar com um par, Vincular agora) before even counting the 5-item bottom nav, with nothing deferred or user-initiated — everything renders by default with no progressive disclosure.

## Persona Red Flags

**Casey (Distracted Mobile User):** The actual "do the thing" button sits at the *top* of the scroll region, right under the sticky header — the opposite of the thumb zone her behaviors call for. If she specifically wants "Falar com um par," there's no direct path — she must scroll past the hero and the conditional follow-up card first. (Touch targets themselves are fine — no 44×44 violations found.)

**Alex (Impatient Power User):** Real shell-level accelerators exist (`k`/`c` hotkeys), which is genuinely good — but that's shell-level, not Home-content-level. The institution nudge has no dismiss, so for an Alex who's decided not to link, it's a permanent nag. Home offers no lightweight alternative to the full 5-minute assessment for someone who just wants to log a quick mood.

**Sam (Accessibility-Dependent User):** `HistoryChartCard`'s error state correctly uses `role="alert"`. By contrast, `FollowUpCard`'s acknowledgment swap has **no `aria-live` region** — a screen-reader user who taps "Não estou bem" (the single highest-emotional-stakes micro-interaction on the page) gets no automatic announcement that the content changed; they'd have to manually re-explore to discover the reassurance copy. This is the clearest concrete accessibility gap found. (Positives: real `<button>` elements throughout with visible focus rings, no icon-only affordances, careful refocus management on the unlink flow.)

## Minor Observations

- The header shows the time-of-day greeting instead of "Início" — a nice personalization touch, but it means the header text never literally confirms current location; that's left entirely to the bottom nav's active state.
- "Conversar agora" and "Falar com um par" use the same icon-badge tone, with no visual distinction between the AI acolhimento chat and the anonymous human peer, even though PRODUCT.md treats these as meaningfully different trust surfaces.
- The history chart's percentage labels render with no inline unit or axis explanation — a first-time viewer has to infer "higher = worse" from bar color alone.

## Questions to Consider

- Should Home offer a lighter, always-available "quick mood tap" for days without 5 minutes, instead of an all-or-nothing choice between the full assessment and a use-case-gated follow-up?
- If "Conversar agora" and "Falar com um par" are genuinely the two most important actions during a crisis-adjacent visit, should they ever be visually interchangeable with "Ainda não vinculado a um hospital"?
- The scroll ends on an institutional linking nudge — is that really the note this screen should leave a doctor on?
- Every visit re-renders the same full stack of cards regardless of context (already checked in today, already linked, mid-follow-up-window) — what would a Home that only showed what's true *right now* look like?
