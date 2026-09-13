---
target: Check-in flow (AssessmentSelectPage + ScaleAssessmentPage + AssessmentResultPage)
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-12T23-51-02Z
slug: electpage-scaleassessmentpage-assessmentresultpage
---
Method: dual-agent (A: ab6bffb56c8e8e206 · B: adda4c0fa9f157888)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Focus loss on review entry/edit means assistive-tech users lose "where am I" exactly when the system should be loudest |
| 2 | Match System / Real World | 3 | Repeated clinical scale label on every question screen sits slightly cold against the app's declared warm voice |
| 3 | User Control and Freedom | 3 | Back/edit/resume/abandon all present and well-built, undercut by the focus-loss bug on the edit path |
| 4 | Consistency and Standards | 3 | Review chunking (`% 3`) is consistent in code but inconsistent in outcome: clean 3/3/3 for PHQ-9, an orphan trailing row for GAD-7 (7 items) |
| 5 | Error Prevention | 4 | Can't advance unanswered; submit guarded by pending/completeness checks; network failure preserves state with retry |
| 6 | Recognition Rather Than Recall | 4 | Review list shows question + chosen label per row; instrument name repeated; result screen restates score meaning |
| 7 | Flexibility and Efficiency | 3 | `event.detail` pointer/keyboard split gives both a fast path — but the review-edit focus bug taxes exactly the efficiency this protects |
| 8 | Aesthetic and Minimalist Design | 4 | One question per screen, generous whitespace, no extraneous chrome |
| 9 | Error Recovery | 4 | Submit-error banner names what happened, confirms answers are still safe, offers retry |
| 10 | Help and Documentation | 2 | No in-context explanation of what PHQ-9/GAD-7 measure or how they're scored beyond a one-line description |
| **Total** | | **33/40** | **Good** |

#### Design Specificity Verdict

**LLM assessment**: Mostly specific — the codebase's own comments consistently tie choices back to actual product stakes (the risk-item ungating rationale, the dual support-path split on the result screen, the pointer/keyboard activation split). Two Round 2 additions read more generic: the flat 20-seconds-per-question estimate has no cited basis and doesn't weight the self-harm item's likely longer read time, and the `% 3` review-chunking rule was written without checking it against GAD-7's actual item count.

**Deterministic scan**: Clean — 0 findings across all five files (exit code 0). Same Tailwind-blindness caveat as the prior two rounds: a clean mechanical scan isn't a design-quality signal, it just means no hardcoded styles or missing a11y attributes.

**Visual overlays**: Not available — no persistent browser automation tool in this session, consistent with rounds 1 and 2.

#### Overall Impression

The three source-visible Round 2 fixes (time estimate, self-harm-item truncation, in-flow scale name) landed correctly. But re-verifying them by reading the actual code — not the commit message — surfaced two real problems: the review-chunking rule silently breaks for GAD-7's 7-item length, and, more importantly, re-checking Round 1's focus-restoration fix under the review screen's edit path found it doesn't cover that path at all. `QuestionCard` unmounts and remounts when navigating from review back into a question (via the header back button or any "Mudar a resposta" tap), which re-triggers the same "skip focus on first mount" logic Round 1 relied on — so focus is set nowhere, worst on the self-harm item. The score dipped to 33/40 not because new problems were invented, but because looking harder at what Round 1 fixed found where it stops.

#### What's Working

- **`event.detail` pointer/keyboard activation split** (`QuestionCard.tsx`) — keeps one-tap speed for touch while giving keyboard users an explicit confirm step, without a separate UI mode.
- **Dual support-path model on the result screen** — a documented distinction between acute item-9 risk and a severe-but-not-acute score, avoiding both under- and over-alarming.
- **Draft persistence + resume + abandon-confirmation** — serves a shift-worker who gets interrupted mid check-in without losing or silently discarding answers.

#### Priority Issues

**[P1] Review-edit focus loss on the self-harm item**
**Why it matters**: `AssessmentReview`'s edit taps and the header back button both remount `QuestionCard` from scratch, which re-triggers the "skip focus on very first mount" logic Round 1 added — so tapping "Mudar a resposta da pergunta 9" removes the button the user just pressed and sets no new focus target anywhere. This is the exact interaction Round 1's fix was meant to cover, now bypassed for every route back into a question.
**Fix**: distinguish "true initial page load" from "remounted via in-flow navigation" (lift a has-ever-focused flag to the parent, or keep `QuestionCard` mounted and swap review in as a sibling rather than a type-swap); give `AssessmentReview`'s own heading a focus-on-mount too, since nothing currently moves focus there either.
**Command**: `/impeccable harden`

**[P1] No safety net when the self-harm answer resurfaces in review**
**Why it matters**: the crisis-line block that ungates on the question screen for the risk item doesn't reappear when that same answer is shown again in the review list — exactly the screen built to let someone slow down and reconsider is where the net is one screen away.
**Fix**: render a compact version of the same reassurance/crisis-line block adjacent to that row in the review list.
**Command**: `/impeccable polish`

**[P2] GAD-7 review chunking produces an orphaned trailing row**
**Why it matters**: `index % 3 === 0` yields 3/3/3 for PHQ-9's 9 items but 3/3/1 for GAD-7's 7 — a lone item after a divider on every single GAD-7 completion, the opposite of the clean grouping the fix intended.
**Fix**: group by a scale-length-aware rule (fold a trailing group of 1 into the previous group, or target a fixed number of groups instead of a fixed group size).
**Command**: `/impeccable layout`

**[P2] Abandon modal is answer-blind**
**Why it matters**: `AbandonAssessmentModal` shows identical generic copy regardless of what was just answered, including immediately after a severe/self-harm response — the app's last chance to say something different to someone who may be leaving mid-crisis currently says nothing different.
**Fix**: thread whether the risk item was answered non-zero into the modal (without needing the full score) to optionally surface the crisis line there too.
**Command**: `/impeccable adapt`

**[P3] Time estimate is falsely precise and self-harm-blind**
**Why it matters**: the flat 20-seconds-per-question constant doesn't account for the self-harm item or the longest PHQ-9 item reading slower than the rest, so the promised time can feel broken exactly at the highest-stakes question.
**Fix**: present a range ("3–5 min") instead of a single rounded number.
**Command**: `/impeccable clarify`

#### Persona Red Flags

**Sam (keyboard-only / screen-reader)**: hits the P1 focus-loss bug hardest — tapping "Mudar a resposta da pergunta 9" removes the pressed element and sets no new focus target, on the one item where disorientation matters most.

**Riley (scoring severe / at acute risk on item 9)**: gets a well-built safety net on the question screen, then loses it the moment they reach review or consider abandoning (the two P1/P2 findings above) — the persona this app most needs to hold onto is the one most exposed to the gaps found here.

**Alex (time-pressed médico)**: benefits from the new picker-screen estimate and constant progress indicator, but the estimate is an unvalidated flat rate that ignores the self-harm item's likely longer dwell time.

#### Minor Observations

- The scale description now repeats on every question screen (9x for PHQ-9) rather than once — a small recurring read-tax, not overload.
- `estimate()`'s `Math.max(1, ...)` would render "cerca de 1 minutos" (wrong plural) for a hypothetical scale short enough to round to 1 minute — not reachable today with PHQ-9/GAD-7, but fragile if a shorter scale is ever added.
- `CrisisCallLink`'s `className` prop is required, unlike most other components' optional styling props in this codebase — a minor convention inconsistency, not a UX issue.

#### Questions to Consider

- Should the crisis safety net that currently exists on exactly one screen (the question) persist anywhere else that same answer is shown again — review list, possibly the abandon modal?
- Is a single rounded-minute estimate more trustworthy to a rushed doctor than an honest range, once the self-harm item's real read time is factored in?
- Now that PHQ-9 and GAD-7 chunk differently under the same rule, should review grouping target "N groups" instead of "groups of size 3"?
