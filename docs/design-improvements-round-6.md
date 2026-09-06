# Zelo — Design Improvements, Round 6

Sixth Impeccable `/critique` of `apps/web`, run immediately after round 5's remediation landed on
`main`. Two isolated agents — a design-director review and a deterministic detector + live-browser
evidence pass — independently verified round 5's fixes against the running app and looked for
anything new.

Round 4: [design-improvements-round-4.md](./design-improvements-round-4.md).
Round 5: [design-improvements-round-5.md](./design-improvements-round-5.md).

**Design health: 28/40 (70% — Good). Trend: 25 → 27 → 26 → 24 → 24 → 28.**

**Status: closed.** Every P1/P2/P3 this round was fixed, deliberately left as an already-correct
prior decision, or explicitly deferred with a reason (see below). No open items carry into round 7
without a note.

Legend: ✅ fixed · ⬜ open · ❌ won't fix.

---

## Round-5 verification

Both agents independently confirmed all 13 round-5 fixes actually landed as claimed — none failed.
Two landed narrowly: the trend chart printed correct values but the *bars* still didn't visually
encode them (fixed this round, see P1 below), and the delete-confirmation fix named single-row
targets but multi-row deletes still show a bare count (acceptable — the report never asked to list
every name in a bulk dialog).

## What's Working

1. The crisis path is designed as infrastructure, not a feature — `nav-tabs.ts:22-27` documents why
   "Apoio" is a standing tab rather than conditional on already being in trouble.
2. Contrast is clean across the whole app — measuring every leaf text node on `/home`, `/peers`, and
   `/manager` at 390px found zero WCAG AA failures.
3. The manager trend chart's peak-marking documents *why* it uses a relative peak instead of a
   threshold (`manager-trend-chart.ts:49-58`) — a written-down product boundary, not an oversight.

---

## P1 — Major

1. ✅ **Desktop trend chart bars encoded nothing.** Values were printed (round 5) but a real
   40%→46% rise still collapsed into a ~3px height difference on the fixed 0-100 axis — the graphic
   contradicted the numbers above it.
   Fix: `toTrendBarHeights` (`manager-trend-chart.ts`) rescales desktop bar heights to the series'
   own min/max range. Mobile's literal-percentage width bars are untouched — they're read next to a
   printed number and are correct as absolute values, which is why `toTrendBars` still exists
   unchanged and is now used for mobile only. Full test coverage in
   `manager-trend-chart.test.ts`.

2. ✅ **Three destinations were mostly void.** `/peers` unlinked, and the peer-partner inbox idle
   state, each rendered a small card over a large empty field.
   Fix: `/peers` gets a 2-step "Como funciona" explainer using the app's existing numbered-badge
   card pattern (`PeersPage.tsx`); the peer-partner inbox states what happens next ("Você recebe um
   alerta assim que alguém pedir para conversar", `PeerPartnerInboxPage.tsx`). `/assessment` select's
   remaining whitespace is inherent to the app's consistent mobile-first centered-column layout
   (matches `/privacy`, `/consent`) and was not treated as a defect.

## P2 — Minor

1. ✅ **Invite-failure notifications offered no recovery.** Four duplicate "Falha no envio do
   convite" rows for the same address, each just restating the failure with no way to act on it —
   even though the admin table already has a working "Reenviar" action for the same account.
   Fix: `INVITE_EMAIL_FAILED` notification payloads now carry the account `id` (added at all four
   API call sites that publish this event: `create-manager`, `create-peer-partner`,
   `send-manager-set-password-email`, `send-peer-partner-set-password-email`). The notification row
   renders a "Reenviar convite" button when the id is present, calling the existing resend mutation
   and marking the notification read on success. Notifications that predate this field (already in
   the database) fall back to no button rather than crashing — verified in the running app.

2. ⬜ **18 notifications have no type/grouping facet.** "3 convites precisam de reenvio" would beat
   seven amber rows describing the same underlying failure. Deferred — this is an interaction/IA
   change bigger than this round's scope, not a quick fix.

## P3 — Polish

1. ✅ **`Revogar consentimento` outranked everything else on `/you`.** Full-width `variant="danger"`
   made the destructive, already-inline-confirmed action the single loudest element on the médico's
   profile screen — a hierarchy problem, not a safety one.
   Fix: demoted to a plain text-danger link (`variant="ghost"`, not full-width), confirm step
   unchanged. `RevokeConsentSection.tsx`.

2. ✅ **`/assessment` printed "Leva cerca de 5 minutos." twice** on one 390px screen — once in the
   header subtitle, once again in the body lead. Fix: dropped the duplicate from the body copy.
   `AssessmentSelectPage.tsx`.

3. ✅ **A new detector finding, caught before it shipped.** Round 5's fix for the chat action tray's
   collapse tab (making it read as a control, not a glitch) added a `shadow-lift` treatment that
   this round's browser evidence flagged as a "thin border + wide shadow" anti-pattern — a
   recognizable generic/AI-slop visual signature. Fixed by swapping the shadow for a plain
   fill-contrast (`bg-canvas-alt`) treatment before this round's report was even finalized.
   `ChatActionTray.tsx`.

---

## Investigated and found already correct — not fixed

- ⬜ **Chat action tray toggle uses `aria-pressed`, not `aria-expanded`.** Flagged as a
  disclosure-semantics bug. It's a deliberate, tested decision — see
  `ChatPage.test.tsx:1300` ("announces the tray tab as a density toggle rather than a disclosure,
  since neither state hides either shortcut from a screen reader"). Both shortcuts stay in the
  accessible tree and clickable in both states; `aria-expanded` would misrepresent an interaction
  where nothing is actually shown or hidden. Left unchanged.
- ⬜ **Mobile manager nav shows a dot instead of an unread count**, while the collapsed sidebar rail
  gets the same dot but the expanded rail gets a real number. The accessible name always carries
  the true count either way (`ManagerUnreadBadge.tsx`'s own doc comment). The existing numeric badge
  variant assumes a horizontal row layout that doesn't fit the bottom nav's vertical icon-over-label
  slot without a new positioned-badge treatment — deferred rather than shipping a cramped fix.

## Minor Observations Remaining

- `peakTrendIndex` uses strict `>` for tie-breaking: on an exact tie between two weeks, the earlier
  one keeps the "Pico" label rather than the most recent one. Both weeks are still visually
  distinguished by color (peak vs. "mais recente"), just under different labels. Low-impact,
  deferred.
- Bulk "Marcar todas como lidas" has no undo, unlike single-item actions elsewhere in the app.
  Deferred — not raised as a priority issue this round.

## Questions to Consider

- What if the manager dashboard led with the delta ("+6 pontos em 6 semanas, UTI puxando") instead
  of the level ("46% da equipe"), sidestepping the still-undecided burnout metric entirely?
- What if notifications were grouped by what the manager should do, rather than by event type?
