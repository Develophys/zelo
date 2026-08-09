# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: hospital doctors and clinical staff ("médicos", e.g. plantão noturno, pronto-socorro,
UTI, clínica médica) checking in on their own mental health/burnout during or after shifts, in a
PWA on their phone. They want a private, fast (~5 min) self-assessment and a way to reach human
or AI support without exposing their identity to their employer.

Secondary: hospital managers/coordinators who need visibility into team-level burnout trends to
act on them, without ever being able to see or infer who an individual staff member is.

## Product Purpose

An anonymous mental-health check-in and support app for hospital staff: PHQ-9/GAD-7
self-assessment scored on-device, an AI "acolhimento" (non-diagnostic supportive) chat, a
crisis-escalation path to a human professional or the CVV 188 line, anonymous peer support, and
an aggregated, k-anonymized (k=5) dashboard for managers. Success is doctors trusting it enough
to check in regularly and institutions adopting it as a real tool for supporting their staff.

## Positioning

Originated as a hackathon PoC but is being actively developed into a real product, not a
one-off demo — the goal is a tool doctors would trust and hospitals would adopt in production.
The mechanism a competitor couldn't casually copy: assessment scoring and risk-signal detection
happen entirely on-device and `riskSignal` never crosses the network; the human-handoff shortcut
is deliberately synchronous and works even if the AI provider is down; and manager-facing
aggregation enforces k-anonymity (k=5) server-side, so no segment small enough to re-identify an
individual is ever constructed, let alone sent to the client.

## Operating Context

Brazilian hospitals; PT-BR is the only language. Staff use the PWA on a personal phone, often
between or after shifts. Sectors referenced in the product: Plantão noturno, Pronto-socorro,
UTI, Ambulatório, Clínica médica. Crisis decline path points to CVV 188 (Brazil's suicide
prevention line). Manager dashboard is used on desktop/tablet as well as phone (responsive
breakpoint at 768px).

## Capabilities and Constraints

- Assessment scoring (`ScoreAssessmentUseCase`) runs on-device; raw answers are never posted for
  server-side scoring, and `riskSignal` never crosses the network as part of the assessment
  payload.
- The human-handoff shortcut (`RequestHumanHandoffUseCase`) is synchronous and I/O-free by
  design — it and the CVV 188 line must render even if the AI provider is down.
- AI chat is supportive ("acolhimento"), never diagnostic; its disclaimer is always visible and
  non-dismissable.
- `MBI-HSS` (Maslach Burnout Inventory) is not implemented — the item text is licensed
  (Mind Garden) and not procured. It's shown as "em breve" and disabled; do not wire it up.
- Anonymity is visible, not just real: every authenticated screen shows an "anônimo" privacy
  badge. Identity is only ever revealed by explicit user action (crisis accept).
- Manager dashboard aggregation is currently built on fabricated/seeded demo data
  (`SimulatedSignal`), not real doctor assessments — real assessments are end-to-end encrypted
  and structurally cannot feed it as currently architected. This is a known, deliberate gap, not
  a bug to silently "fix" by inventing a data path.
- Manager auth session lives in `sessionStorage` + bearer token (not an `HttpOnly` cookie) —
  an accepted, documented trade-off (see `docs/superpowers/specs/technical-debt.md` TD-001), not
  an oversight.
- Undecided / open product questions (do not resolve unilaterally): the exact metric behind the
  manager-facing "burnout signal" aggregate; whether `department`/sector is free text or a fixed
  picklist per institution; how a user is granted the `MANAGER` role; doctor-side identity for
  real (non-simulated) peer matching and manager aggregation is designed
  (`docs/superpowers/specs/identity-and-aggregation.md`) but not built.

## Brand Commitments

Name: **Zelo**. Voice: calm, clinical-but-warm, PT-BR, never clinical-cold or casual-flippant —
copy in the screen specs is normative, not to be paraphrased. Visual system ("Sereno" direction:
sage green, warm serif headings, generous whitespace) is recorded separately in the project's
design tokens, not here.

## Evidence on Hand

No real customer testimonials, case studies, or hospital-partner logos exist yet — do not
fabricate any. The manager dashboard's numbers are seeded/simulated demo data by design (see
Capabilities and Constraints); do not present them as real outcomes in any future copy or
marketing surface without an explicit product decision to do so.

## Product Principles

1. **Anonymity is a promise, not a feature.** No surface may require PII to check in or chat;
   any future identity layer (peers, manager) must never weaken that promise for the surfaces
   that don't need it.
2. **Score locally, escalate honestly.** Scoring and risk detection happen on-device; the
   crisis/human-handoff path must keep working even if the network or AI provider is down.
3. **Aggregate, never re-identify.** Manager-facing data is k-anonymous (k=5) enforced
   server-side; no drill-down to individuals, ever, by design.
4. **Building for real adoption, not a demo.** Decisions should move this toward a product a
   hospital would actually deploy and a doctor would actually trust — even where the current
   implementation is still simulated or PoC-scoped in places.

## Accessibility & Inclusion

WCAG 2.1 AA. Concretely: body text ≥4.5:1 contrast, large text ≥3:1, hit targets ≥44×44px,
`prefers-reduced-motion` respected on all transitions/animations, icon-only buttons carry
`aria-label`, every flow operable by keyboard alone, axe-core clean on each route.
