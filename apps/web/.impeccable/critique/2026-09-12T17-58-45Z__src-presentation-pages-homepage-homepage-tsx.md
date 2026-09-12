---
target: Home page (HomePage.tsx)
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-12T17-58-45Z
slug: src-presentation-pages-homepage-homepage-tsx
---
Method: dual-agent (A: a347fa906d7fcb159 · B: a7dd6f755e5277d4e)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good aria-live coverage on state transitions; nothing signals FollowUpCard's own data-loading state (see P2). |
| 2 | Match System / Real World | 4 | Clinical-but-warm PT-BR throughout; AI vs. human named before the tap. |
| 3 | User Control and Freedom | 3 | InstitutionLinkCard has a real dismiss + confirmed unlink; FollowUpCard has no equivalent neutral "not now" (P3). |
| 4 | Consistency and Standards | 4 | Tap-press, card radii, tone tokens applied uniformly across the page. |
| 5 | Error Prevention | 4 | Desvincular now gated by the same confirm pattern used elsewhere. |
| 6 | Recognition Rather Than Recall | 4 | No icon-only affordances anywhere. |
| 7 | Flexibility and Efficiency of Use | 2 | No accelerators within Home itself — low-weight for a single-path check-in flow. |
| 8 | Aesthetic and Minimalist Design | 4 | Accent color reserved for the two people-facing CTAs; everything else neutral. |
| 9 | Error Recovery | 4 | HistoryChartCard's error copy is close to a model example. |
| 10 | Help and Documentation | 2 | Trust/crisis help exists sitewide; nothing contextual inside the Home cards themselves. |
| **Total** | | **34/40** | **Good (85%)** |

## Design Specificity Verdict

**LLM:** Still highly specific — the shift-aware greeting, the AI/human captions existing specifically to satisfy a named product principle, and the chart's clinical-safety color logic (peak wins the color, not "newest = good news") all read as decisions made for this exact workforce.

**Deterministic scan:** Zero findings across all seven files (HomePage's four + InstitutionLinkCard/Button/CardButton, all changed since the last pass). Assessment B went further and read the detector's actual rule set this time: the "Tailwind-blind" framing from prior passes was itself imprecise — the engine has **7 narrow, hard-coded Tailwind regexes** (side-tab borders, gradient-text-clip, gray-on-color, an AI-purple-palette check, bounce-easing, etc.), just no general comprehension of Tailwind beyond those. None of the seven files trip any of the 7 patterns. **Still near-worthless as positive evidence here** — the actual styling decisions (spacing, hierarchy, layout) sit entirely outside what those 7 rules check — but the precise reason is now "narrow allowlisted exceptions," not total blindness.

**Visual overlays:** Unavailable, no browser tool this session.

## Overall Impression

Real, compounding improvement: 29 → 30 → 29 → 32 → **34/40**, and none of four rounds of prior fixes regressed under fresh reading. The standout finding this pass is sharp: the page's single best-designed moment — the "Obrigado por dizer." acknowledgment — sits on ephemeral `useState` that doesn't survive a remount, reintroducing (through a different door: remount vs. unmount) the exact failure mode a prior round already fixed once.

## What's Working

1. **The "não estou bem" acknowledgment** — in-place replacement, correctly-labeled link, non-judgmental copy. Still the best-designed moment on the page, four rounds running.
2. **`getGreeting`'s shift-aware branch** — a small, specific detail that makes the interface feel authored for its actual users.
3. **HistoryChartCard's error state** — plain language, names what's still true, offers same-spot retry. Close to a model Heuristic 9 example.

## Priority Issues

**[P1] The page's one moment of emotional care is also its most fragile piece of state**
- **Why it matters:** `FollowUpCard.tsx`'s `justAnswered` is plain `useState`, explicitly scoped to the current mount. The persisted `answeredAt` survives, but the acknowledgment UI does not — if the component remounts right after "Não estou bem" (a reload, a PWA background-eviction, any React remount, all plausible on a personal phone used between shifts), `shouldShow` now evaluates false and `justAnswered` resets to null. The card renders **nothing**: not the question, not "you already answered," not the reassurance, not the link to chat. A doctor who disclosed distress and got interrupted loses both the reassurance and the fastest route to support, with zero trace anything was said — precisely the failure mode the in-place-replacement fix was built to prevent, reached through a different door.
- **Fix:** Persist the "just answered no, show acknowledgment + link" view state the same way `answeredAt` already is, or derive it directly from `answeredThisCycle` instead of gating behind the ephemeral `justAnswered`.
- **Suggested command:** `/impeccable harden`

**[P2] Institution-link nudge isn't suppressed after a distress disclosure**
- **Why it matters:** FollowUpCard's "no" acknowledgment and InstitutionLinkCard's nudge render completely independently — a doctor who's just seen "Obrigado por dizer." can scroll straight into "Vincule para aparecer nos números do seu time" on the same load. HomePage's own ordering comment already reasons carefully about not making a distressed user scroll past administrative content to find a person, but that reasoning stops at ordering — it doesn't stop the institution ask from sharing the same view as a "não estou bem" disclosure.
- **Fix:** Suppress the institution nudge for that render when `justAnswered === 'no'` — the nudge already has its own snooze mechanism to reuse.
- **Suggested command:** `/impeccable clarify`

**[P2] FollowUpCard has no loading placeholder, unlike HistoryChartCard**
- **Why it matters:** `useAssessmentHistory()` has no `placeholderData`, so `history` is `undefined` on first render regardless of load speed. `HistoryChartCard` explicitly reserves its height with a loading skeleton; `FollowUpCard` renders nothing while unresolved, then can pop in once data arrives, shifting everything below it — a real mistap risk for a one-handed user tapping a CTA moments after load.
- **Fix:** Gate the card behind `isLoading`, or reserve its height with a skeleton the same way HistoryChartCard does.
- **Suggested command:** `/impeccable polish`

**[P3] FollowUpCard offers no neutral "not now," unlike its neighbor**
- **Why it matters:** FollowUpCard offers only "Estou bem"/"Não estou bem" — no dismiss — while InstitutionLinkCard, the visually similar card right below it, offers an explicit "Agora não" that snoozes for 2 days. A doctor who doesn't want to answer either way today has no acknowledged way to say so, inconsistent with the pattern the very next card establishes.
- **Fix:** Either add an equivalent snoozed dismiss, or leave a short comment documenting that the binary is intentional, matching how this file documents its other deliberate choices.
- **Suggested command:** `/impeccable clarify`

## Cognitive Load

**1 conditional failure — low overall.** The worst-case stack (Hero → FollowUpCard → CTA row → HistoryChartCard → InstitutionLinkCard nudge, all live at once) is still uncapped — `ShouldShowFollowUpPromptUseCase` and `ShouldShowInstitutionNudgeUseCase` have no knowledge of each other. Everything else passes.

## Persona Red Flags

**Jordan:** on the very first-ever visit (zero check-ins), the institution nudge already shows by default — front-loading a feature ("seu time," a manager dashboard) she has no context for yet. **Casey:** directly exposed to P1 and P2 — the exact interruption profile PRODUCT.md describes for this audience is the one that loses the reassurance message. **Riley:** would find P1 within minutes (kill the tab right after "Não estou bem," reopen) and would also flag FollowUpCard's pop-in-after-load as inconsistent with HistoryChartCard's handled loading state on the same page.

## Minor Observations

- `IconBadge`'s default tone (`bg-surface-brand`) sits inside `CardButton`'s `tone="accent"` (`bg-brand/5`) — two adjacent, slightly different brand tints layered on the hero CTAs; likely imperceptible, worth a live check once browser tooling exists.
- `InstitutionLinkCard`'s own `justDismissedNudge`/`justUnlinkedIntoQuiet` share the same "lost on remount" shape as `justAnswered` — but those are low-stakes toasts ("Tudo bem, sem pressa.", "Desvinculado."), not a support link, so not worth fixing on their own.

## Questions to Consider

- The follow-up's answer already survives a remount (`answeredAt` persists) — should the *message itself* survive the same way, given it may be the most important six words on the page?
- If the follow-up prompt and the institution nudge both want the screen on the same visit, nothing currently decides who yields — should there be an explicit rule, written down the way the CTA ordering already is?
- Does the institution ask need to wait for at least one completed check-in before it can appear?
