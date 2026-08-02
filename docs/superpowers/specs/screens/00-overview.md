# Screen map & conventions

13 screens, one spec file each. Every screen spec follows the same template:

- **Route / File** — where it lives.
- **Purpose** — one line.
- **Layout** — structure top-to-bottom, with tokens.
- **Components** — primitives from `ui-primitives.md` it composes.
- **Copy (PT-BR)** — normative strings.
- **Data / logic** — which use-case/hook/store it consumes.
- **Interactions** — taps and where they go.
- **Acceptance criteria** — how to know it's done.

## Screen index
| # | Screen | Route | File |
|---|---|---|---|
| 01 | Splash | `/` | `01-splash.md` |
| 02 | Privacy transparency | `/privacy` | `02-privacy.md` |
| 03 | Consent | `/consent` | `03-consent.md` |
| 04 | Home / hub | `/home` | `04-home.md` |
| 05 | Assessment select | `/assessment` | `05-assessment-select.md` |
| 06 | Assessment question | `/assessment/phq9` | `06-assessment-question.md` |
| 07 | Result | `/assessment/result` | `07-result.md` |
| 08 | Crisis — offer | `/crisis` | `08-crisis-offer.md` |
| 09 | Crisis — accept | `/crisis/connect` | `09-crisis-accept.md` |
| 10 | Crisis — decline | `/crisis/line` | `10-crisis-decline.md` |
| 11 | Chat (acolhimento) | `/chat` | `11-chat.md` |
| 12 | Peers | `/peers` | `12-peers.md` |
| 13 | Manager dashboard | `/manager` | `13-manager.md` |

## Screens added after the original 13

Not covered by `AGENTS.md`'s Phase 0–7 build plan (written before these existed), but real
routes with their own spec file, following the same template:

| # | Screen | Route | File |
|---|---|---|---|
| 14 | Manager login | `/manager/login` | `14-manager-login.md` |
| 15 | Você (consent status & revoke) | `/you` | `15-you.md` |
| 16 | Vincular ao hospital (institution linking) | `/you/link` | `16-link-institution.md` |

## Global conventions (apply to every screen)
- Wrap in `PhoneShell`. Screen padding `px-6`.
- Back affordance: `ChevronLeft` + text, `text-muted font-semibold text-label`, top-left, 16px
  below the status area.
- Titles are `h1` Newsreader on onboarding/hub; questions are `h2`.
- Primary CTA is a single full-width `Button variant="primary"` pinned near the bottom of the
  content (not a fixed bar) unless noted.
- Every authenticated screen (04–13) shows `PrivacyBadge variant="chip"` in its header.
- All eyebrows are `SectionLabel`.
- Icon-only buttons need `aria-label`.
- The reference visual is Direction **1A "Sereno"** in `Zelo Fluxo.dc.html` (option `#1a`).
