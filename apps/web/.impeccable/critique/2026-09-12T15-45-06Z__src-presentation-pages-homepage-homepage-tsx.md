---
target: Home page (HomePage.tsx)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-12T15-45-06Z
slug: src-presentation-pages-homepage-homepage-tsx
---
Method: dual-agent (A: ab0d3bc19106b4216 · B: aad324bfede2fb1b6)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading/error/empty and the follow-up ack are solid; dismissing the institution nudge gives no feedback beyond the card vanishing. |
| 2 | Match Between System and Real World | 4 | Shift-aware, jargon-free PT-BR; chart % now explained inline. |
| 3 | User Control and Freedom | 3 | Nudge dismiss now exists; no way to correct a mis-tapped "Estou bem"/"Não estou bem" once answered. |
| 4 | Consistency and Standards | 3 | Shared component system used consistently; the hero CTA is a hand-rolled one-off instead of a named Button variant. |
| 5 | Error Prevention | 3 | Chart distinguishes "no data" from "fetch failed" correctly; nothing destructive lives on this screen. |
| 6 | Recognition Rather Than Recall | 4 | No icon-only controls; chart legend is dot+label. |
| 7 | Flexibility and Efficiency of Use | 2 | App-wide nav hotkeys exist but are undiscoverable on-screen; nothing home-specific accelerates repeat use. |
| 8 | Aesthetic and Minimalist Design | 3 | Deliberate type/color system; up to 5 stacked cards on a "good day" is still a lot even with conditional trimming. |
| 9 | Error Recovery | 3 | The one exercised error state is genuinely excellent, but it's the only sample. |
| 10 | Help and Documentation | 2 | No dedicated help entry point on Home; Apoio tab + encryption modal are informal trust help, not task help. |
| **Total** | | **30/40** | **Good (75%)** |

Heuristics 7 and 10 were scored, not marked n/a — Home is an Operate-mode surface a doctor returns to repeatedly, so the Persuade/Experience exemption doesn't apply.

## Design Specificity Verdict

**LLM assessment:** Still specific, not category-interchangeable. The shift-aware greeting, the chart's real clinical-band color logic, the warm-but-plain acknowledgment copy, and the standing anonymity badge + crisis nav tab are all real product decisions a generic template wouldn't reproduce.

**Deterministic scan:** `detect.mjs` against all four HomePage files plus `InstitutionLinkCard.tsx` and `CardButton.tsx` (checking the new `tone` prop specifically) — exit 0, zero findings on both runs. Verified genuine, not a no-op: the same detector run against a scratch file with real anti-patterns (`border-l-4`, a layout-thrashing transition) correctly returned 2 findings and exit code 2. One calibration note: the detector's `overused-font` rule only matches CSS-syntax `font-family:`, not JSX `fontFamily:` in inline styles — moot here since none of the six files use inline style objects.

**Visual overlays:** Unavailable — no browser automation tool in this session, confirmed independently by both assessments rather than faked from source.

## Overall Impression

Every priority issue from the last run is genuinely gone, and it shows: the visual-hierarchy fix (accent tiles), the duplicate-CTA removal, the nudge dismiss, the reworded follow-up prompt, the aria-live region, and the chart caption are all confirmed present and working from a fresh, independent read. The score moved 29→30, which undersells the work — most of the old defects were real UX problems the score doesn't fully capture; the new score reflects a different, harder set of issues this pass found precisely because the visible ones are cleared. The biggest new finding is a trust one, not a polish one: "Conversar agora" doesn't disclose it's an AI, on a screen a first-timer sees before ever reaching the chat's own AI disclaimer.

## What's Working

1. **The follow-up acknowledgment pattern** — replacing the question in place with validating copy and an `aria-live` region, instead of the card vanishing, is called out again this pass as the single best piece of craft on the page.
2. **`HistoryChartCard`'s edge-case handling** — three genuinely distinct loading/empty/error states, reassuring error copy, and a correct accessible-dataviz pattern (`aria-hidden` bars + parallel `sr-only` list).
3. **Shift-aware greeting** — a small, real signal this was built for people working 4am shifts, not adapted from a 9-to-5 template.

## Priority Issues

**[P1] "Conversar agora" doesn't disclose it's the AI**
- **Why it matters:** "Falar com um par" names its human nature; "Conversar agora" doesn't signal AI at all, on the first screen a doctor sees — before the AI chat's own non-dismissable disclaimer, which only appears after the tap. In an anonymous mental-health product whose trust is the whole product, that's a bad place to be surprised, especially right after someone has just said "não estou bem."
- **Fix:** Add a short qualifier to the tile itself (e.g. a small caption under the label) distinguishing AI from human — a copy fix, not a color fix; the shared icon-badge tone decision from the last pass stands.
- **Suggested command:** `/impeccable clarify`

**[P2] Dismissing the institution nudge orphans keyboard focus**
- **Why it matters:** "Agora não" removes the whole card from the DOM with no focus restoration — a keyboard user's focus falls back to `<body>`. The same file already solves this exact problem for the "Desvincular" flow (`ctaRef` + `shouldFocusCta`); it just wasn't applied to the new dismiss path.
- **Fix:** Reuse the existing refocus pattern already in `InstitutionLinkCard.tsx` for the dismiss action.
- **Suggested command:** `/impeccable harden`

**[P2] The "não estou bem" reassurance doesn't link to the help it promises**
- **Why it matters:** "Falar com alguém costuma ajudar mais do que esperar passar" is plain text relying on spatial proximity to the accent tiles below — which breaks under scroll position, larger font-size settings, or a short viewport.
- **Fix:** Make part of the sentence an actual affordance pointing at one of the two contact routes, instead of trusting proximity alone.
- **Suggested command:** `/impeccable clarify`

**[P3] Home ignores the `short`/`short-wide` spacing variants the codebase already built**
- **Why it matters:** `index.css` defines `short`/`short-wide` custom variants specifically for compact viewports, and `AppHeader` already uses them — but `HomePage.tsx` and its cards use fixed `mt-3.5` spacing throughout, so the header compacts on a short screen while the card stack below it doesn't.
- **Fix:** Apply `short:`-scaled spacing to the card stack the way `AppHeader` already does.
- **Suggested command:** `/impeccable layout`

**[P3] The hero CTA is a hand-rolled one-off, not a system Button variant**
- **Why it matters:** "Fazer check-in" — the single most important CTA in the app — is styled with `variant="unstyled"` plus a long hand-written class string, outside the `Button` component's own variant map. Any future change to the on-brand-surface treatment has to be found and re-derived here by hand.
- **Fix:** Promote it to a named `Button` variant (e.g. `inverse`) governed the same way as the rest of the system.
- **Suggested command:** `/impeccable polish`

## Cognitive Load

**0–1 failures — low cognitive load overall**, an improvement from the prior "4 of 8 failed" finding. Visual hierarchy now genuinely passes (three legible tiers: brand hero > accent contact tiles > plain report cards > flat nudge), and progressive disclosure is a real strength (`FollowUpCard`/`InstitutionLinkCard` both render nothing when not relevant). One item still worth watching, not fixing outright: when the follow-up prompt is live, a user faces three separate decision points before any scrolling — none individually violates the ≤4-option rule, but they stack.

## Persona Red Flags

**Jordan (Confused First-Timer):** This is Jordan's literal first screen. Taking the most literal reading of every label (per Jordan's own profile), "Conversar agora" next to "Falar com um par" gives no cue the first is a bot — the exact P1 above. Once oriented, though, Jordan is well served: no jargon, no icon-only nav, and the chart now explains its own percentages inline — a gap Jordan would have hit before that caption existed.

**Casey (Distracted Mobile User):** Primary CTA and both contact tiles sit at the top of the scroll, not the thumb-reachable bottom (occupied by the fixed bottom nav) — a reach concern, not a mis-tap risk, since touch targets are generously sized. Casey also gets interrupted and returns later; nothing on this screen distinguishes "what's new since I last looked," so she re-scans the whole stack every time.

**Sam (Accessibility-Dependent User):** Confirmed orphaned focus on nudge dismissal (P2 above); the same pattern likely applies to `FollowUpCard`'s yes/no buttons, though the `aria-live` region at least ensures the acknowledgment is *heard* even if focus is orphaned. Positive: the chart's `aria-hidden` bars + parallel `sr-only` list remains the right pattern. Band-color contrast couldn't be verified from source alone — worth an axe-core run.

## Minor Observations

- `InstitutionLinkCard`'s nudge copy ("aparecer nos números do seu time") is accurate but abstract for someone who's never seen the manager dashboard.
- The two "tappable card" interaction models (whole-tile `CardButton` vs. `Card`+inner-`Button`) now read as a coherent, legitimate distinction on inspection, not residual inconsistency — worth noting so a future pass doesn't "fix" something that isn't broken.
- `HistoryChartCard`'s "Mais recente" dot is correctly hidden when the peak and latest week are the same bar — also worth flagging so it isn't mistaken for a missing label later.

## Questions to Consider

- If "Conversar agora" is the AI and "Falar com um par" is human, should Home say so before the tap — or is the current symmetry intentional, so neither option reads as the "downgrade" choice?
- Now that the nudge snoozes for 2 days, what about the doctor who dismissed it meaning "never," not "not today"?
- On a day when the follow-up prompt, the institution nudge, and a chart spike are all live at once, is Home still "the first thing a tired doctor sees," or has it become something you scroll through to get to help?
