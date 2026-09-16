# Zelo — "Sereno" UI Build Plan (Direction 1A)

> **Historical.** This is the July 2026 build plan for the Sereno UI direction — every screen it
> describes has since shipped. Kept for history, not as current instruction. For how to build a
> new feature in this repo today, start at `CLAUDE.md` and `docs/conventions/README.md`.

---

> **Purpose.** This is the top-to-bottom build plan for implementing the **Sereno** visual
> direction across all 13 screens of the Zelo PWA. Follow the phases in order. Each phase
> links to a topic file with exact tokens, prop signatures, layout structure, and acceptance
> criteria. Do **not** skip ahead — later phases assume the design system from Phase 1 exists.
>
> **Target repo.** `apps/web` — React 18 + Vite + Tailwind + `react-router` v6 (data router),
> Zustand for UI state, clean-architecture layering already in place.
>
> **Scope of this plan.** *Presentation layer only.* Domain, ports, use-cases, and
> infrastructure already exist and are correct — you consume them, you do not rewrite them.
> The only non-presentation edits allowed are (a) `tailwind.config.ts`, (b) `src/app/index.css`,
> (c) `src/app/router.tsx` (adding routes), and (d) new files under `src/presentation/`.

---

## Golden rules (read before touching anything)

1. **Never send `riskSignal` to the backend.** It lives only in `AssessmentRecord`
   (`src/domain/assessment-record.ts`), never in `@zelo/domain`'s `Assessment`. The
   submit pipeline already strips it — do not re-introduce it into any network payload.
2. **The score is computed on-device.** Use `ScoreAssessmentUseCase` via the existing
   container/hook. Never post raw answers for server-side scoring. The "🔒 processado no seu
   aparelho" affordance in the UI is a *promise* — keep it true.
3. **`MBI-HSS` is not implemented.** `ScoreAssessmentUseCase` throws for it (item text is
   licensed / Mind Garden, not procured). The picker shows it as **"em breve"** and disabled.
   Do not wire it up.
4. **The human-handoff shortcut must never depend on the network.** `RequestHumanHandoffUseCase`
   is deliberately synchronous and I/O-free (FR-6b). The "Falar com uma pessoa real" button and
   the CVV 188 line must render even if the AI provider is down.
5. **AI chat is acolhimento, never diagnosis.** The disclaimer banner is non-dismissable and
   always present on the chat surface.
6. **Anonymity is visible, not just real.** Every authenticated surface shows the "🔒 anônimo"
   badge. Identity is only ever revealed by explicit user action (crisis accept).
7. **Design tokens only.** No raw hex in components. If a value isn't in the token file, it
   doesn't go in the UI. Add it to the token file first, with a rationale.
8. **PT-BR copy is normative.** The exact strings in the screen specs are the copy. Do not
   paraphrase, translate, or "improve" them without a copy review.

---

## Phase 0 — Orient (no code)

- [ ] Read `design-tokens.md`, `tailwind-and-css.md`, `ui-primitives.md`, `routing-and-state.md`.
- [ ] Skim all of `screens/`. Build a mental model of the nav graph in `screens/00-overview.md`.
- [ ] Confirm the existing use-cases/hooks you'll consume: `ScoreAssessmentUseCase`,
      `SubmitAssessmentUseCase`, `RequestHumanHandoffUseCase`, `useChatConversation`,
      `useSubmitAssessment`, container exports in `src/app/container.ts`.

## Phase 1 — Design system (do this first, all of it)

- [ ] **1.1** Apply `tailwind-and-css.md`: replace `tailwind.config.ts` and `src/app/index.css`
      with the versions given. Add the three Google Font `<link>`s to `index.html`.
- [ ] **1.2** Verify tokens resolve: a scratch component using `bg-brand text-ink font-serif`
      renders sage-green background, near-black serif text. Delete the scratch after.
- [ ] **Acceptance:** `pnpm --filter web build` passes; Tailwind emits the custom colors
      (`brand`, `ink`, `surface`, `danger`, `warn`); the three font families load (no FOUT of
      the wrong family).

## Phase 2 — UI primitives

Build the shared primitives in `ui-primitives.md` **before** any screen. Screens are composed
almost entirely from these, so getting them right once removes 80% of per-screen work.

- [ ] **2.1** `PhoneShell` / layout scaffolding (safe-area padding, scroll container).
- [ ] **2.2** `Button` (variants: `primary`, `ghost`, `outline`, `danger`).
- [ ] **2.3** `Card`, `IconBadge`, `PrivacyBadge`, `ProgressBar`, `SectionLabel`.
- [ ] **2.4** `BottomNav` (4 tabs, active state).
- [ ] **Acceptance:** each primitive has the prop signature in the spec; Storybook-style
      manual check or a `/kitchen-sink` throwaway route renders every variant correctly.

## Phase 3 — Onboarding & consent (linear, no data)

Order matters — this is the first-run funnel. Build and wire navigation as you go.

- [ ] **3.1** `screens/01-splash.md`
- [ ] **3.2** `screens/02-privacy.md`
- [ ] **3.3** `screens/03-consent.md` — persists consent to `consent.store.ts` (see routing spec).
- [ ] **Acceptance:** cold start with no stored consent → Splash → Privacy → Consent → Home.
      Warm start with stored consent → straight to Home. Consent is revocable (see spec).

## Phase 4 — Home & assessment vertical (the core loop)

- [ ] **4.1** `screens/04-home.md`
- [ ] **4.2** `screens/05-assessment-select.md`
- [ ] **4.3** `screens/06-assessment-question.md` — **rebuilds `AssessmentForm` as one-question-per-screen.**
- [ ] **4.4** `screens/07-result.md` — score band + risk-signal branch.
- [ ] **Acceptance:** complete a PHQ-9 → correct total & band shown; answering item 9 > 0
      surfaces the crisis affordance on the result screen; submit persists via
      `useSubmitAssessment` without `riskSignal` on the wire.

## Phase 5 — Crisis escalation (highest-stakes surface)

- [ ] **5.1** `screens/08-crisis-offer.md`
- [ ] **5.2** `screens/09-crisis-accept.md` (ephemeral token, connect to psychologist)
- [ ] **5.3** `screens/10-crisis-decline.md` (CVV 188, no penalty)
- [ ] **Acceptance:** both branches reachable from result *and* from chat; CVV 188 renders with
      no network; "Agora não" returns the user gently without dead-ends.

## Phase 6 — Support surfaces

- [ ] **6.1** `screens/11-chat.md` — wraps existing `useChatConversation`, adds Sereno styling +
      persistent handoff button + disclaimer.
- [ ] **6.2** `screens/12-peers.md` — anonymous peer matching list.
- [ ] **6.3** `screens/13-manager.md` — aggregated, anonymized dashboard (n<5 suppressed).
- [ ] **Acceptance:** chat streams tokens with correct bubble styling; handoff button always
      visible; manager view shows no segment with n<5.

## Phase 7 — Polish & a11y pass

- [ ] Focus states on every interactive element (keyboard reachable).
- [ ] Hit targets ≥ 44×44px.
- [ ] Contrast: body text ≥ 4.5:1, large text ≥ 3:1 against its surface.
- [ ] `prefers-reduced-motion` respected on the progress bar + any transition.
- [ ] Screen-reader labels on icon-only buttons (back arrows, send).
- [ ] **Acceptance:** axe-core clean on each route; full flow operable by keyboard only.

---

## File map (what you will create)

```
apps/web/
  index.html                                  (edit: add font links)
  tailwind.config.ts                          (replace)
  src/app/index.css                           (replace)
  src/app/router.tsx                          (edit: add routes)
  src/stores/consent.store.ts                 (new)
  src/presentation/
    layout/
      PhoneShell.tsx                          (new)
      BottomNav.tsx                           (new)
    ui/
      Button.tsx  Card.tsx  IconBadge.tsx     (new)
      PrivacyBadge.tsx  ProgressBar.tsx        (new)
      SectionLabel.tsx  ScoreDial.tsx          (new)
    pages/
      SplashPage.tsx  PrivacyPage.tsx  ConsentPage.tsx        (new)
      HomePage.tsx                            (replace scaffold)
      AssessmentSelectPage.tsx                (new)
      Phq9AssessmentPage.tsx                  (replace: one-question-per-screen)
      Gad7AssessmentPage.tsx                  (replace: same pattern)
      AssessmentResultPage.tsx                (new)
      CrisisOfferPage.tsx  CrisisAcceptPage.tsx  CrisisDeclinePage.tsx  (new)
      ChatPage.tsx                            (restyle existing)
      PeersPage.tsx  ManagerDashboardPage.tsx (new)
    components/
      QuestionCard.tsx                        (new; replaces AssessmentForm usage)
      ResultBandCard.tsx  RiskSignalCallout.tsx (new)
```

> Anything under `domain/`, `ports/`, `use-cases/`, `infrastructure/` is **off-limits** for this
> plan. If you believe a screen needs a capability those layers don't expose, STOP and flag it —
> do not invent a use-case to fill the gap.

---

## How to consume the rest of this spec

- **`design-tokens.md`** — the single source of truth for color, type, spacing, radius, shadow,
  and the PHQ-9 score-band palette. Everything else references these names.
- **`tailwind-and-css.md`** — paste-ready `tailwind.config.ts` + `index.css` + font links.
- **`ui-primitives.md`** — every shared component with its TypeScript prop signature.
- **`routing-and-state.md`** — the route table, the consent store, and how screens navigate.
- **`screens/NN-*.md`** — one file per screen: route, files, layout, tokens, components, states,
  interactions, data source, and acceptance criteria.

Each screen spec is self-contained enough to be handed to a sub-agent as a single task.
