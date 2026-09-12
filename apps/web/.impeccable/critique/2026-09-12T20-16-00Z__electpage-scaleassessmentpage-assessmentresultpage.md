---
target: Check-in flow (AssessmentSelectPage + ScaleAssessmentPage + AssessmentResultPage)
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-12T20-16-00Z
slug: electpage-scaleassessmentpage-assessmentresultpage
---
Method: dual-agent (A: aa20c508496b3207b · B: a2b944c34b0f2d582)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Connectivity failure only revealed after tapping "Enviar respostas," not before |
| 2 | Match System / Real World | 4 | PT-BR clinical wording mirrors the validated instrument exactly |
| 3 | User Control and Freedom | 4 | Back-in-question, edit-from-review, draft resume, abandon-confirm modal all present and tested |
| 4 | Consistency and Standards | 4 | Shared Button/Card/ProgressBar, identical "Voltar ao início" label/destination across screens |
| 5 | Error Prevention | 4 | Mandatory review before submit, double-submit guard, abandon modal |
| 6 | Recognition Rather Than Recall | 3 | Review screen truncates each question to one line — recall burden on near-duplicate PHQ-9 items |
| 7 | Flexibility and Efficiency | 3 | Auto-advance + keyboard path is good, but nothing for a repeat weekly user beyond that |
| 8 | Aesthetic and Minimalist Design | 3 | Disabled MBI-HSS card sits at full visual weight beside the two real scale choices |
| 9 | Error Recovery | 4 | "Não foi possível enviar... Elas continuam salvas aqui." — honest, actionable, immediate retry |
| 10 | Help and Documentation | 2 | Zero in-flow explanation of what PHQ-9/GAD-7 measure, despite managers getting a full methodology page |
| **Total** | | **34/40** | **Good** |

#### Design Specificity Verdict

**LLM assessment**: Not a generic wizard wearing a mental-health skin. The self-harm item (PHQ-9 #9) unconditionally surfaces the CVV 188 line regardless of the answer given, reasoned explicitly in code so the line's arrival never reads as a verdict on what was just selected. `RiskSignalCallout` vs `BandSupportCard` are deliberately different treatments so a high score without the acute-risk item isn't shown the same screen as a genuinely acute one. Reassurance copy sits above the score, not below. The abandon/draft-resume logic is built around a named real interruption ("a phone call, a refresh, a PWA evicted under memory pressure"). Where it slips toward generic is visual: the select screen is a plain two-card list and the question screen is a standard radio-group-plus-progress-bar pattern, functionally sound but indistinguishable from any SaaS onboarding wizard until the result page, where the brand (Sereno serif + sage tone system) finally shows up.

**Deterministic scan**: Clean — 0 findings across all three files (exit code 0). This detector is Tailwind-blind outside ~7 hard-coded regex families, so a clean result on Tailwind-styled TSX is the expected, unsurprising outcome of that blind spot, not evidence of visual quality.

**Visual overlays**: Not available — no persistent browser automation tool in this session. Static detector scan only.

#### Overall Impression

The flow's clinical judgment is more careful than its visual design — the hard product decisions (acute-risk handling, reassurance-before-number, abandon-safety) are all correctly made and locked in by tests, but the screens carrying them look like a generic multi-step form until the result page. The single biggest opportunity: the emotional warmth calibrated so carefully into the result screen never reaches backward into the review screen or the 9-question middle, which is exactly where a médico answering a self-harm item is under the most tension.

#### What's Working

- **RiskSignalCallout vs BandSupportCard split** — a clinically literate distinction between acute-risk and severe-but-not-acute scores, reasoned explicitly in code to avoid both under- and over-alarming.
- **Reassurance-before-number ordering** — locked in by a regression test asserting DOM order, not left to drift.
- **Interruption handling** — draft persistence + abandon-confirm modal + honest "elas continuam salvas aqui" messaging built around the real médico scenario of being paged away mid-check-in.

#### Priority Issues

**[P1] No focus management on question advance** — `ScaleAssessmentPage.tsx`/`QuestionCard.tsx` never move focus to the new question's heading after advancing. A keyboard/screen-reader user re-traverses the header chrome from scratch on every one of 9 items in an instrument about their own mental health.
**Fix**: on questionIndex change, move focus to the heading via a ref, mirroring the existing role="status" announcement pattern.
**Suggested command**: `/impeccable harden`

**[P1] Emotional flatness at both tension peaks** — the mid-instrument stretch and the pre-submit review screen carry none of the result screen's calibrated warmth; "Confira suas respostas... Nada foi enviado ainda" is purely procedural immediately before submitting a self-harm-inclusive assessment.
**Fix**: extend the result screen's tone backward — even one calm line on the review screen — before the highest-tension tap.
**Suggested command**: `/impeccable delight`

**[P2] MBI-HSS clutters the front-door decision** — the disabled "em breve" card gets equal visual footprint next to the two real, actionable choices on `AssessmentSelectPage`, adding noise to what should be an unambiguous binary decision.
**Fix**: collapse it to a small text note rather than a full card.
**Suggested command**: `/impeccable distill`

**[P2] Review screen truncates question text** — `AssessmentReview.tsx` cuts each question to one line via `truncate`; sighted/low-vision users reviewing near-duplicate PHQ-9 items must recall content from a fragment (screen-reader users get the full text via aria-label, so this gap is sighted-only).
**Fix**: switch to `line-clamp-2` + `text-pretty`, the pattern already used for the header subtitle.
**Suggested command**: `/impeccable clarify`

**[P3] No proactive offline awareness** — submission failure only surfaces reactively after tapping "Enviar respostas," so a médico on unstable hospital wifi finds out only after committing to the act.
**Fix**: surface a quiet connectivity indicator on the review screen when offline is detected, ahead of the tap.
**Suggested command**: `/impeccable polish`

#### Persona Red Flags

**Sam (Accessibility-Dependent)**: The missing focus-move on question advance (P1 above) hits this persona hardest — 9 manual re-navigations of header chrome per assessment. `AssessmentReview`'s `truncate` (not `line-clamp`) also means a zoomed-in low-vision user loses even more of each question than normal-DPI, while the aria-label safety net only helps screen-reader users, not magnification users.

**Jordan (First-Timer)**: Lands on `AssessmentSelectPage` with only "Escolha uma escala validada" and two one-line subtitles — no explanation anywhere in this flow of what PHQ-9 or GAD-7 actually are or why picking one matters, despite the manager side having a full "Transparência" page for the equivalent question about aggregate numbers.

**Casey (Distracted Mobile User)**: Well-served by draft/resume + abandon-modal for normal interruptions, but `clearDraft()` fires before `navigate(routes.result, ...)` in `handleSubmit` — if the PWA is killed in that narrow window (very plausible mid-shift), the draft is already gone with nothing in this flow pointing her to check her history to confirm the submission landed.

#### Minor Observations

- `ScoreDial`'s combined sr-only sentence ("19 de 27. Faixa: Moderadamente grave.") correctly fixes what would otherwise read aloud as three disconnected fragments.
- `prefers-reduced-motion` correctly neutralizes the per-letter "Enviando…" animation via the global rule in index.css.
- The self-harm crisis box is correctly scoped to PHQ-9 only, never appearing on GAD-7.
- Three stacked CTAs on a severe/risk result is a lot, but visual weight hierarchy (danger primary → outline → ghost) keeps it readable rather than overwhelming.
- "Leva cerca de 5 minutos" on the select screen sets an accurate, PRODUCT.md-aligned expectation up front.

#### Questions to Consider

- The self-harm item gets unconditional warmth (the crisis line shows no matter what's answered) — why does that same "answer honestly, we've got you either way" principle stop cold at the review screen and the eight questions around it?
- The result heading stays identical across every severity so it can't be "decoded" before the score renders — does that actually protect anyone, or just delay the same moment by two seconds without preparing them for it?
- Managers get a dedicated methodology page explaining their aggregate numbers — why does the médico, whose own mental health is what's actually being scored, get no equivalent explanation of what PHQ-9/GAD-7 measure or how "Grave" was defined?
