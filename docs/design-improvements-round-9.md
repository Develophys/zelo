# Zelo — Design Improvements, Round 9

Ninth Impeccable `/critique` of `apps/web`, run after round 8's remediation landed on `main`. Two
isolated agents — a design-director review and a deterministic detector + live-browser evidence
pass — independently re-examined the running app.

Round 7: [design-improvements-round-7.md](./design-improvements-round-7.md).
Round 8: [design-improvements-round-8.md](./design-improvements-round-8.md).

**Design health: 28/40 (70% — Good, down slightly from round 8's 29 as a new P0 surfaced).
Trend: 24 → 24 → 28 → 27 → 28.**

**Status: closed.** The one P0 (sector filter pills inverting the user's intent) and both P1s
(trend-chart scale mismatch across breakpoints, invisible/overclaiming chat redaction) are fixed.
One P2 (missing per-bar values on the médico's own chart) is fixed. The other P2 — the pre-ticked
aggregate-signal consent toggle — revisited round 8's own explicit decision; the user chose to keep
it as-is, so no code change.

Legend: ✅ fixed · ❌ investigated, not a bug or not this pass's scope · ⚪ raised, kept as-is by
explicit user decision.

---

## Method note — verifying claims that touched a decision already made deliberately

Every concrete claim was checked against the actual codebase before being trusted, matching this
session's established practice:

- The P0 sector-filter claim was traced directly in `ManagerDashboardPage.tsx`: `effectiveSelected`
  defaults to *every* sector id when nothing is explicitly filtered, and `toggleSector` removes an id
  already present in that set — so a first click on any pill, from the resting "Todos" state, silently
  executed "exclude this one" instead of "show only this one." Confirmed live via Playwright before
  and after the fix.
- The chat-anonymization claim was traced to `send-chat-message.usecase.ts`'s own code comment
  ("params.history ... stores raw text for UI display") — the network payload really was redacted;
  the transcript bubble was the only place showing evidence of it wasn't.
- The consent-toggle P2 explicitly revisits a decision the user made with full context in round 8
  (they were asked directly and chose "on by default"). This round surfaced the tension but did not
  act on it unilaterally — see the Ask the User answers below.

---

## P0 — Blocking

1. ✅ **Sector filter pills inverted the user's intent on first click.** From the default "Todos"
   state, clicking a single sector pill (e.g. "Ambulatório") silently removed *that* sector from the
   filter and left the *other three* selected — the opposite of "show me just this one." Root cause:
   `SectorFilter`'s `toggleSector` always operated on the full implicit selection, so a pill already
   "in" that set took the *remove* branch. Fix: when nothing is explicitly chosen yet, the first click
   now sets the selection to just the clicked sector instead of subtracting from the implicit full
   set. `ManagerDashboardPage.tsx`, five existing tests updated to the corrected semantics (their
   assertions had quietly enshrined the bug as "expected" toggle behavior), one new regression test.
   Verified live via Playwright: clicking a pill now shows only that pill pressed and only its data.

## P1 — Major

1. ✅ **The same trend series rendered at genuinely different visual proportions on desktop vs.
   mobile.** Desktop used the padded-domain scale (`toTrendBarHeights`); mobile used the older
   literal 0–100 scale (`toTrendBars`) — the same 40%→47% move drew as a 1.67× spread on one
   breakpoint and a 1.18× spread on the other. Fix: mobile's bar width now reuses the same
   padded-domain values desktop's bar height already uses. `ManagerDashboardPage.tsx`, new test
   asserting both breakpoints render the identical proportion for the same data.

2. ✅ **Chat redaction was real but invisible, and the copy overclaimed its scope.** The network
   payload was genuinely redacted before send, but the médico's own sent bubble kept showing the raw
   text — a médico testing the claim by typing their CRM number saw it sitting unredacted in their own
   transcript. Fix: the message is now anonymized before it's stored for display, not just before the
   network call, so `[CRM]`/`[EMAIL]`/`[TELEFONE]` show up in the sent bubble itself. Copy narrowed
   from the unqualified "anonimizado antes do envio" to state exactly what's covered: the header now
   reads "CRM, e-mail e telefone removidos", and the chat empty state spells out the same three
   categories plus "evite escrever seu nome." `useChatConversation.ts`, `ChatEmptyState.tsx`,
   `app-header-meta.ts`, new tests on the hook and the empty state; existing header-budget tests
   updated to the new (shorter) string.

## P2 — Minor

1. ✅ **The médico's own history chart carried no visible values; the manager's equivalent chart
   prints one on every bar.** Fix: `HistoryChartCard.tsx` now prints each week's percentage above its
   bar, blank for weeks with no check-in, matching the manager dashboard's pattern. New test.

2. ⚪ **The aggregate-signal consent toggle is pre-ticked, with no confirmation feedback when
   flipped.** This directly revisited round 8's own explicit decision (the user was asked and chose
   "on by default," reasoning that it matches prior behavior and lowers friction). Raised again this
   round as a genuine tension — in a product whose whole premise is employer-blind anonymity, should
   an optional data-sharing default favor the médico instead? — but not acted on unilaterally. Asked
   directly again; the user reaffirmed the round-8 decision. No code change.

---

## Also verified, no action needed

- **`clipped-overflow-container` (manager admin routes), flagged by Assessment B as needing manual
  confirmation.** Traced the only popover-like component on those routes (`Modal.tsx`): it renders via
  a native `<dialog>`, which paints in the browser's top layer and is immune to any ancestor's
  `overflow: hidden` regardless of DOM nesting. No `createPortal` usage exists anywhere else in the
  codebase that could be at risk. Confirmed false positive, same conclusion as round 8's independent
  investigation of the same pattern.
- **CLI detector: zero findings across 433 files**, verified non-broken via a positive-control test
  (a synthetic broken `<img>` correctly triggered a finding, exit code 2).

## Persona Red Flags Addressed

**Alex (gestor under time pressure):** the sector filter now does what it visibly claims — clicking a
sector isolates to it, rather than excluding it while lighting up everything else.

**Casey (privacy-skeptical médico):** the anonymization promise now has visible evidence in the one
place a skeptical user is most likely to test it — their own sent message.

## Minor Observations Remaining

- Mobile bottom nav is 6 items across 390px with ~0 gutter left — one item over the usual convention,
  though still above the 12px label floor. Deferred.
- `/peer` is a single ~180px card in a 900px desktop viewport; a peer volunteer has no session history
  and no way to mark themselves unavailable short of closing the tab. Deferred (same item noted since
  round 5).
- `/peer/settings` lacks the density control `/manager/settings` has, otherwise the same panel.
- `/manager/notifications` has 4 consecutive identical failed-invite rows with no dedupe or retry, in
  an 18-row list with no filter across 6 distinct types.
- `/assessment` lists MBI-HSS as permanently "em breve" beside two live scales.
