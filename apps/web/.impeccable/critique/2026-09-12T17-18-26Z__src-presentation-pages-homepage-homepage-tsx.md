---
target: Home page (HomePage.tsx)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-12T17-18-26Z
slug: src-presentation-pages-homepage-homepage-tsx
---
Method: dual-agent (A: adcf4736a26e6fa3c · B: a3cf2a2b94fc9833c)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Every primary CTA gives zero visual feedback on tap — no `:active` state anywhere, and `-webkit-tap-highlight-color` is globally disabled. |
| 2 | Match Between System and Real World | 4 | Shift-aware greeting, PT-BR médico terminology, natural ordering. |
| 3 | User Control and Freedom | 3 | Dismiss/unlink/undo paths generally solid; Desvincular fires instantly with no confirm. |
| 4 | Consistency and Standards | 3 | FollowUpCard's "Falar com alguém" link routes to AI chat with no disclosure, unlike the identically-destined tile one component over. |
| 5 | Error Prevention | 3 | Same Desvincular gap as #3. |
| 6 | Recognition Rather Than Recall | 4 | No icon-only controls, everything text-labeled. |
| 7 | Flexibility and Efficiency of Use | 3 | App-wide hotkeys exist; page is simple enough not to need its own. |
| 8 | Aesthetic and Minimalist Design | 4 | Clean hierarchy, honest states, no clutter. |
| 9 | Error Recovery | 4 | Chart's error state is plain-language and reassuring, with retry. |
| 10 | Help and Documentation | 2 | No contextual help specific to this page's own interactions. |
| **Total** | | **32/40** | **Good (80%)** |

## Design Specificity Verdict

**LLM:** Still genuinely authored for this product — the greeting's 04:30 branch, the ordering rationale, the pulse-check cadence, and the k-anonymity-aware nudge copy are all PRODUCT.md-derived, not boilerplate.

**Deterministic scan:** Zero findings on both runs (HomePage's four files + InstitutionLinkCard.tsx, including the new unlink-focus-fallback branch). Assessment B went further this pass and read the detector's actual regex-engine source: it does recognize inline `style={{...}}` JSX objects (not just `style="..."` strings, correcting last pass's slightly-too-narrow caveat), but still has zero concept of Tailwind `className` tokens. All five files are Tailwind-only for visual styling except one non-flaggable inline `style={{ height }}` in `HistoryChartCard.tsx`. **The clean scan remains near-worthless as positive evidence here** — there was almost nothing in the detector's addressable surface to find, not evidence the surface is clean.

**Visual overlays:** Unavailable, no browser tool this session.

## Overall Impression

Real, durable improvement: 29 → 30 → 29 → **32/40**, and this pass's three findings are genuinely new — none of the three fixes from Run 3 (follow-up re-arming, nudge focus/live-region, unlink acknowledgment) regressed under fresh re-reading. The one thread worth naming: the AI-disclosure principle fixed on the CardButton tile in Run 2 wasn't applied to every route into the same destination — FollowUpCard's own inline link makes the identical promise-break the tile fix was meant to close.

## What's Working

1. **Product-specific reasoning is baked into the code, not just the copy** — the greeting's shift-aware branch, the ordering rationale, and the cycle-aware suppression logic all read as decisions made for this audience.
2. **The in-place acknowledgment pattern** across FollowUpCard and InstitutionLinkCard correctly treats "nothing visibly happened" as a real failure mode, with live regions and focus management, not a toast a screen-reader user could miss.
3. **Honest data states** on HistoryChartCard — skeleton, a reassuring retryable error, a real empty-state CTA.

## Priority Issues

**[P1] "Falar com alguém" silently routes to AI chat with no disclosure, at the app's highest-empathy moment**
- **Why it matters:** FollowUpCard's "não" acknowledgment links to `routes.chat` under "Falar com alguém" — the same AI destination `CardButton` deliberately labels "Acolhimento por IA" one component over, with a code comment explaining disclosure has to happen before the tap. That principle wasn't applied here, and this fires right after a doctor admits "não estou bem."
- **Fix:** Relabel to disclose AI, or route to the same choice the row below offers instead of hard-coding AI.
- **Suggested command:** `/impeccable clarify`

**[P2] No tap/press feedback anywhere on the page's primary actions, on the device this app is actually used on**
- **Why it matters:** `-webkit-tap-highlight-color` is globally disabled and neither `Button.tsx` nor `CardButton.tsx` defines an `:active` state — only `hover` (meaningless on touch) and `focus-visible`. Every primary tap produces no visual response until the route changes, on a product explicitly used on personal phones under distracted/interrupted conditions.
- **Fix:** Add an `active:` state (scale, opacity, or background shift) to Button's and CardButton's shared classes.
- **Suggested command:** `/impeccable polish`

**[P2] Desvincular (unlink) executes instantly with no confirmation**
- **Why it matters:** No "tem certeza?" step despite institution linkage being core to the product's own adoption metric — one mis-tap silently drops a doctor out of their team's aggregate.
- **Fix:** A lightweight inline confirm (button becomes "Confirmar?" briefly) rather than a full modal.
- **Suggested command:** `/impeccable harden`

## Cognitive Load

**Low, 0 outright failures.** Worst-case full render (~6-7 CTAs across hero/pulse-check/tiles/chart/nudge) stays broken into sequential scroll groups by design rather than one simultaneous decision.

## Persona Red Flags

**Jordan:** sees the institution nudge on the very first Home render, before any trust is built; also the direct target of the P1 AI-disclosure gap. **Casey:** the missing tap feedback (P2) is exactly her failure mode — a silent tap reads as "didn't work" and invites a redundant second tap. **Sam:** card titles below the hero are `<p>`, not headings, so heading-jump navigation only has 2 stops on the page — consistent with the rest of the app, likely a known convention rather than an oversight; live contrast couldn't be verified without a browser tool.

## Minor Observations

- `Button.tsx`'s `inverse` variant requires every caller to manually re-supply a focus-ring override — documented as a known footgun, no live bug currently.
- `CardButton.tsx`'s `hover:shadow-lift` has no effect for touch users — related to but distinct from the tap-feedback P2.

## Questions to Consider

- If AI-vs-human honesty before the tap is a hard principle, should every entry point to chat carry the same disclosure, or just the one audited in Run 2?
- What does the phone communicate in the half-second between tap and navigation, on the busiest screen in the app?
- Is unlinking genuinely low-stakes enough to need zero confirmation, given the product's own framing of institutional adoption as a success metric?
