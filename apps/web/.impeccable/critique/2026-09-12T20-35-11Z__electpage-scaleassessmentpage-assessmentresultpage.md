---
target: Check-in flow (AssessmentSelectPage + ScaleAssessmentPage + AssessmentResultPage)
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-12T20-35-11Z
slug: electpage-scaleassessmentpage-assessmentresultpage
---
Method: dual-agent (A: adb06fbb2aa09371d · B: a94c9b3537b586dfe)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Nothing signals what to expect if a submit hangs (no elapsed-time/timeout cue) |
| 2 | Match System / Real World | 3 | Raw clinical score ("19/27") shown with no explanation of what it means at the moment of result |
| 3 | User Control and Freedom | 4 | Per-question back, edit-from-review, resumable draft, explicit abandon confirmation |
| 4 | Consistency and Standards | 4 | Shared Button/Card/Modal tokens, reused labels across screens |
| 5 | Error Prevention | 4 | Double-submit guard, keyboard-safe radio activation, exit-confirmation modal |
| 6 | Recognition Rather Than Recall | 3 | Review screen still truncates every question to one line, including the self-harm item |
| 7 | Flexibility and Efficiency | 3 | No path for a repeat weekly user to move faster |
| 8 | Aesthetic and Minimalist Design | 4 | Single-question focus, generous whitespace, clean result-screen sequencing |
| 9 | Error Recovery | 4 | "Elas continuam salvas aqui" answers the actual fear (lost work) before it's asked |
| 10 | Help and Documentation | 2 | No time/length estimate anywhere, despite PRODUCT.md's own "~5 min" promise |
| **Total** | | **34/40** | **Good** |

#### Design Specificity Verdict

**LLM assessment**: Authored for the specific person and moment, not a generic form. The self-harm item's crisis line is ungated by design so it never reads as a verdict on the answer given; the result screen uses an identical headline at every severity so it can't be decoded as a tell; reassurance is ordered above the score number on purpose. Where it slips toward generic-form territory is the low-stakes chrome (the scale picker), which is arguably correct triage — spend specificity where the stakes are.

**Deterministic scan**: Clean — 0 findings across all five files (exit code 0). Same Tailwind-blindness caveat as before: expected on Tailwind-styled TSX, not a quality signal.

**Visual overlays**: Not available — no persistent browser automation tool in this session.

#### Overall Impression

The two P1 fixes landed cleanly and are explicitly called out as working well — focus restoration and the review-screen reassurance both did what they set out to do. The score held at 34/40 with a different mix: the flow's remaining gap isn't accessibility mechanics anymore, it's that the product's own "~5 min" promise and the assessment's basic meaning never reach the screen the médico actually sees before committing to start.

#### What's Working

- **Focus restoration + live announcements** — a keyboard/screen-reader user is never stranded at header chrome after advancing; verified by test.
- **Result screen's reassurance-before-score ordering and severity-invariant headline** — a deliberate mechanism, not a generic platitude, that keeps the heading from becoming a tell for a repeat user.
- **The self-harm item's ungated crisis line** — appears regardless of answer, so its presence can't be read as a judgment.

#### Priority Issues

**[P1] No time/length estimate before starting** — `AssessmentSelectPage.tsx` says only "Escolha uma escala validada," no question count or duration. PRODUCT.md's whole pitch to this user is "~5 min fitting between shifts," but that promise never reaches the screen where a time-pressed médico decides whether they have the bandwidth right now.
**Fix**: add a line under each scale card, e.g. "9 perguntas · cerca de 3 minutos." **Command**: `/impeccable onboard`

**[P2] Review screen still truncates the highest-stakes item** — `AssessmentReview.tsx` clips every question to one line, including the self-harm item, undermining the one place review exists to let someone confirm what they answered.
**Fix**: switch to `line-clamp-2`, or exempt the risk item from truncation. **Command**: `/impeccable clarify`

**[P2] Review list violates the ≤4-item chunking guideline** — all 9 (or 7) answers render as one flat, unchunked list.
**Fix**: add a subtle grouping cue (e.g. a divider every 3 rows). **Command**: `/impeccable layout`

**[P3] No in-flow recall of what the scale measures** — beyond a one-line subtitle on the picker screen, nothing explains PHQ-9/GAD-7 once inside the instrument.
**Fix**: surface the scale name + one-line description in the assessment page's own header subtitle. **Command**: `/impeccable document`

#### Persona Red Flags

**Alex (time-pressed, minutes between patients)**: "Escolha uma escala validada" gives zero sense of investment size — no duration cue anywhere in the flow.

**Riley (scoring severe / at acute risk on item 9)**: on the review screen, item 9's row has the exact same visual weight and truncation as every other item — nothing distinguishes it while scanning quickly, and the crisis-line reminder shown live on the question screen doesn't repeat on review or just before the final submit tap.

**Sam (keyboard-only / screen-reader)**: `QuestionCard`'s "Próxima" button only mounts after `onSelect` fires, and nothing announces that a new interactive control just appeared — Sam has to know to tab forward and discover it.

#### Minor Observations

- `has-focus-visible:` relies on CSS `:has()` — fine on current evergreen browsers, worth a compatibility note for older hospital-issued WebViews.
- "Toque em qualquer resposta" assumes touch, but the same layout serves tablet/desktop widths via PhoneShell's breakpoints.
- "Enviando…" per-letter wave animation is a small note of playfulness at a moment otherwise treated with gravity everywhere else.

#### Questions to Consider

- PRODUCT.md's own "~5 minutes" pitch never reaches the screen the médico sees before starting — why not?
- The identical headline at every severity protects against decoding it as a tell — but does it also flatten the moment for someone who just scored "Mínimo"?
- The review screen exists to let someone catch a wrong tap — has it ever been tested whether someone in real distress actually uses it to reconsider anything?
