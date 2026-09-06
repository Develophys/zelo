# Zelo — Design Improvements, Round 7

Seventh Impeccable `/critique` of `apps/web`, run immediately after round 6's remediation landed on
`main`. Two isolated agents — a design-director review and a deterministic detector + live-browser
evidence pass — independently verified round 6's fixes against the running app.

Round 5: [design-improvements-round-5.md](./design-improvements-round-5.md).
Round 6: [design-improvements-round-6.md](./design-improvements-round-6.md).

**Design health: 27/40 (68% — Good, within noise of round 6's 28). Trend: 25 → 27 → 26 → 24 → 24 →
28 → 27.**

**Status: closed.** Both confirmed P1s and the confirmed P2 accessibility regression are fixed; the
notification-resend gap is closed; the one item framed as a product question (the médico's own nav
permanently advertising "Administração") was put to the user directly, approved, and implemented.

Legend: ✅ fixed · ❌ investigated, not a bug or not this pass's scope.

---

## Method note — two of round 6's own fixes only half-landed

Both agents independently verified round 6's seven fixes; five held up cleanly, and two were caught
mid-review as incomplete — I verified both empirically before trusting the report:

- The trend-chart rescale (`toTrendBarHeights`) was min-max normalization: the series' minimum
  *always* rendered at the 8px floor and the maximum *always* at 100%, so a 6-point move and an
  80-point move drew the identical "empty to full" shape. Confirmed by walking the math directly.
- The "demote Revogar consentimento" fix changed the button's `variant` but not its rendered color:
  `variant="ghost"` already emits `text-muted`, and the `className="text-danger"` addition lost that
  CSS specificity tie (both single-class utilities; Tailwind's own stylesheet order decided it).
  Confirmed by measuring the actual computed style in a real browser — `rgb(92, 107, 100)`, plain
  grey, not danger red.

Both are the kind of bug a unit test asserting on class-name presence cannot catch, because jsdom
doesn't apply Tailwind's generated stylesheet — the class was present in the DOM, it just lost the
cascade. Fixed this round with real computed-style verification, not just a class-list check.

---

## P1 — Major

1. ✅ **The trend-chart fix over-corrected into a misleading chart.** Fix: `toTrendBarHeights` now
   pads the domain (`min − 10pp` to `max + 10pp`, clamped to 0–100) instead of stretching the
   series' exact min/max to the floor/ceiling — a small move gets a visible but proportionate bump,
   a genuinely wide swing still uses most of the plot. `manager-trend-chart.ts`, with new tests
   guarding both cases explicitly (`manager-trend-chart.test.ts`).

2. ✅ **The revoke-consentimento demotion changed shape but not color.** Fix: switched to
   `variant="unstyled" size="sm"` — the one combination documented directly in `Button.tsx`'s own
   prop comments for keeping shared geometry while bringing fully custom, uncontested colors — plus
   an underline as a non-color affordance. Verified the actual computed color in a real browser:
   `rgb(162, 69, 58)`, genuine danger red. `RevokeConsentSection.tsx`.

## P2 — Minor

1. ✅ **The collapsed chat shortcut's visible label wasn't contained in its accessible name (WCAG
   2.5.3).** `aria-label="Falar com uma pessoa real"` while the visible text read "Falar com
   alguém" — a regression from round 5's own copy change (the previous text, "Pessoa real", passed
   this check; the warmer replacement didn't). Fix: removed the mismatched `aria-label` so the
   accessible name derives from the visible text itself. `ChatActionTray.tsx`, with a dedicated
   regression test plus updates to every existing test that queried the collapsed button by the old
   aria-label.

2. ✅ **The notification resend action had no live example and didn't cover the more common
   failure type.** `INVITE_EXPIRED` (more rows in real data than `INVITE_EMAIL_FAILED`) never
   carried an account `id`, so it structurally could never get a resend button even going forward.
   Fix: added `id` to the `INVITE_EXPIRED` payload (`sweep-lapsed-invites.use-case.ts`) and widened
   the notification page's resend eligibility to both types (`ManagerNotificationsPage.tsx`).

## P3 — Product decision, put to the user

1. ✅ **The anonymous médico's own nav permanently advertised "Administração"** (a link to the
   manager panel most médicos have no credentials for) and "Par anônimo" as top-level destinations,
   in the same nav as the persona whose entire value proposition is employer-blind anonymity. Framed
   explicitly as a product question rather than a unilateral fix; the user approved the change.
   Fix: both moved off `SECONDARY_NAV_ITEMS` (now just Configurações) into a new "Sou gestor ou par
   voluntário" section on the Configurações screen itself (`SettingsPage.tsx`), using the same
   `NavDestination` data (`STAFF_NAV_ITEMS` in `nav-tabs.ts`) so the links can't drift from their
   single source of truth. Updated the sidebar, bottom-nav sheet, and every test that exercised the
   old location (`Sidebar.test.tsx`, `BottomNav.test.tsx`, `router.test.tsx`, `HomePage.test.tsx`).

   Side effect worth noting: the médico's "Mais" bottom-sheet toggle now opens to reveal a single
   item (Configurações) instead of three. Left as-is rather than redesigning the overflow mechanism
   itself, which was out of scope for this change — see the sheet in
   `.impeccable/critique/2026-09-06T15-18-54Z__apps-web.md` for the before/after.

---

## Persona Red Flags Addressed

**Sam (accessibility-dependent):** the 2.5.3 mismatch is fixed; the revoke control now has both a
real color and an underline, not a color-only signal that was silently failing anyway.

**Casey (distracted mobile):** the "Falar com um par" → "Falar com um colega" → "Falar com alguém"
naming drift across screens (noted this round) was not addressed — flagged as a copy-consistency
pass for a future round, not attempted here since it touches copy across three separate screens with
no single fix point.

## Minor Observations Remaining

- `peakTrendIndex` still breaks an exact tie toward the earlier week (noted in round 6, still
  low-impact, still deferred).
- The peer partner still has no way to go unavailable short of logging out (the explicitly-deferred
  availability toggle from round 5).
