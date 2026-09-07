# Zelo — Design Improvements, Round 8

Eighth Impeccable `/critique` of `apps/web`, run after round 7's remediation landed on `main`. Two
isolated agents — a design-director review and a deterministic detector + live-browser evidence
pass — independently re-examined the running app.

Round 6: [design-improvements-round-6.md](./design-improvements-round-6.md).
Round 7: [design-improvements-round-7.md](./design-improvements-round-7.md).

**Design health: 29/40 (73% — Good, best of the series so far). Trend: 25 → 27 → 26 → 24 → 24 → 28
→ 27 → 29.**

**Status: closed.** Both confirmed P1s (a real WCAG 1.4.11 contrast failure and a bar-chart legend
that could point at a color nothing on screen used) are fixed on both charts they affect. The
notification-resend claim was investigated and confirmed as pre-existing seed data, not a
regression. The admin table's truncated Papel column is fixed. The one item framed as a legal/product
question — whether the `/consent` screen's single accept button improperly bundles a genuine data-use
authorization with two informational disclosures — was put to the user directly and implemented as an
architectural change, not a unilateral fix. Assessment B's detector + browser evidence pass
independently confirms the app has converged on the mechanical/deterministic side: zero CLI findings,
and every browser-evidence pattern is either a known, already-dismissed false positive or verified as
one here — no additional real issues.

Legend: ✅ fixed · ❌ investigated, not a bug or not this pass's scope.

---

## Method note — a claim that contradicted my own passing tests, checked against the live database

Assessment A reported the notification "Reenviar convite" button doesn't render and that the API
serves `INVITE_EXPIRED`/`INVITE_EMAIL_FAILED` payloads with no `id` field on any notification —
directly contradicting round 6/7's own fix and its currently-green unit tests
(`toMatchObject({ ..., id: ... })` across five call sites). Rather than trust either side, I queried
the live dev database directly (adapter-based `PrismaClient`, matching `prisma.service.ts`'s
construction pattern) and found the most recent `INVITE_EXPIRED` rows for two seeded managers
genuinely lack `id`. The reason isn't a code regression: `RecordSignalCheckinUseCase`'s sibling,
`SweepLapsedInvitesUseCase`, dedups on `kind:id:expiresAt`, and `skipDuplicates: true` means a lapsed
invite that was first swept *before* the round 6/7 fix landed will never get a fresh row — every later
sweep hits the same dedup key and no-ops forever, until that invite is resent (rotating the expiry) or
the row ages out. The client already handles this gracefully: `ManagerNotificationsPage.tsx` gates the
resend button on `typeof notification.payload.id === "string"`, so old rows just don't show a button
rather than crashing. No code change; this is expected behavior for data that predates the fix.

---

## Assessment B — detector + browser evidence, verified

Assessment B's CLI scan found **0 findings** across 433 files (exit code 0), independently confirmed
non-broken with a positive-control test (a synthetic `<img src="">` file correctly returned a
`broken-image` finding, exit 2). Its live-browser pass, driven across 14 authenticated and
unauthenticated routes, surfaced four patterns — all either self-flagged as likely false positives by
the agent itself, or verified as such here:

- **`layout-transition` on `<body>`** (global `transition: width`, all 14/14 routes) and **on
  `div.h-full.rounded-pill`** (the PHQ-9 progress bar) — already investigated in earlier rounds as
  deliberate, harmless CSS; nothing changed since.
- **`layout-transition` on `aside.hidden.flex-none`** — the agent's own report calls this a likely
  false positive, since the element carries Tailwind's `.hidden` (`display:none`) and an animated
  property on a non-rendered element has no visible effect. Agreed; no action.
- **`nested-cards` on `/chat`'s message composer** — the same "card inside a card" pattern
  investigated and dismissed in an earlier round (the composer bar is deliberately styled as a
  distinct surface at the bottom of the chat card, not an accidental nesting).
- **`clipped-overflow-container` on `/manager`, `/manager/admin/managers`, `/manager/admin/peers`** —
  flagged by the agent as "not obviously a false positive... worth a look." Checked: the ancestors
  named (`ManagerShell`'s `div.flex.h-dvh.overflow-hidden`, its content column, and the admin tables'
  `rounded-card` wrapper) are a standard app-shell scroll-lock (fixed sidebar, independently-scrolling
  content) and a table's routine corner-clipping wrapper. Neither of these three pages renders any
  tooltip, dropdown, or popover that would need to escape those bounds — the only kind of element this
  detector rule exists to catch. Assessment B's own visual inspection of `/manager/admin/managers`
  found no clipped or truncated text either. Confirmed false positive; no action.

No genuine new issue from this half of the pair — it independently confirms Assessment A's report was
complete rather than surfacing anything additional.

---

## P1 — Major

1. ✅ **Non-highlighted trend bars failed WCAG 1.4.11 (Non-text Contrast) in both directions.**
   `bg-track` (a token meant for scrollbar chrome) painted every bar that wasn't the peak or the
   latest week, measuring ~1.43:1 against `bg-surface` and ~1.26:1 against `bg-canvas-alt` — both
   independently recalculated by hand from the token hex values, confirming the claim exactly. Fix:
   repainted every such bar `bg-control-edge` instead (a border token already used elsewhere, now
   reused for fill; ~4.0:1 against white, ~3.5:1 against canvas-alt, ~4.0:1 in dark mode — all clear
   the floor). Five occurrences across `ManagerDashboardPage.tsx` (desktop + mobile trend bars,
   "Sinais por setor" segment bars) and one in `HistoryChartCard.tsx`. `--color-track` itself was left
   untouched — it still backs the scrollbar, which doesn't need 3:1 contrast.

2. ✅ **Both trend-chart legends could name a color nothing on screen actually used.** Found while
   fixing the contrast issue above, not flagged as two separate bugs by either critique agent:
   `ManagerDashboardPage.tsx`'s legend showed "Mais recente" unconditionally whenever the trend had
   any non-zero week, but its own bars only ever render `bg-brand` for the *latest* week and
   `bg-warn` for the *peak* week — on any non-decreasing series (the common case), those coincide and
   no bar ever uses `bg-brand`, orphaning the "Mais recente" swatch. `HistoryChartCard.tsx` had the
   mirror-image bug (its ternary checks `latestIndex` before `peakIndex`, the opposite precedence, so
   "Pico" could go orphaned instead). Fix: both legends now render each entry conditionally — "Mais
   recente" only when the latest bar has data and isn't also the peak bar; "Pico" only when a peak
   exists and isn't also the latest bar. New tests on both pages cover the coinciding-index case
   explicitly (`ManagerDashboardPage.test.tsx`, `HistoryChartCard.test.tsx`).

## P2 — Minor

1. ❌ **Notification resend button "doesn't render."** Investigated against the live dev database —
   see the Method note above. Pre-existing seed data from before the round 6/7 fix, not a regression;
   no code change.

2. ✅ **`/consent` bundles a genuine data-use authorization with two disclosures behind one accept
   button.** Item 2 ("Autorizo o uso anônimo e agregado...") is the only one of the three rows that
   actually authorizes anything — items 1 and 3 are informational regardless of what's chosen. Framed
   as an LGPD/product question rather than fixed unilaterally; the user chose to split it into two
   independent actions rather than leave it as one gate or add a merely-cosmetic checklist. Investigation
   found the natural seam: `RecordSignalCheckinUseCase`'s check-in endpoint already carries no user
   identity (a pure per-sector-per-week counter), so the toggle only needed to gate whether the client
   calls it at all — no backend schema change. Implemented:
   - `consent.store.ts` gains a persisted `aggregateOptIn` boolean (default `true`) and a
     `setAggregateOptIn` action; `grant()` now takes the choice as a parameter. Existing médicos'
     persisted state predates this field, and zustand's default merge falls back to the store's
     default for a missing key — so everyone already using the app is grandfathered in as opted-in
     with no migration code.
   - `ConsentPage.tsx`: items 1 and 3 stay fixed, always-accepted cards; item 2 becomes an interactive
     card with a pre-checked `Checkbox`. "Aceitar e entrar" saves whatever the checkbox reads at that
     moment and proceeds regardless — declining it never blocks entry.
   - `useSubmitAssessment.ts`: the existing institution-link gate before firing the anonymous signal
     check-in now also requires `aggregateOptIn`.
   - A new `YouPage/AggregateOptInSection.tsx` exposes the same toggle later, next to (but separate
     from) `RevokeConsentSection` — flipping it needs no confirmation step, unlike a full revoke.

## P3 — Layout

1. ✅ **`/manager/admin/managers`'s Papel column truncated "Gestor do hospital" to "Gestor do
   hospi..." while Status carried more width than its own content (short pills, or "Convite
   pendente") needed.** Confirmed visually via Playwright screenshot before touching anything. Fix:
   rebalanced the five column widths (`ManagerAdminManagersPage.tsx`) — Papel 16%→22%, and Nome/Email
   trimmed slightly to fund it — through two more screenshot passes, since the first rebalance fixed
   Papel but pushed the same truncation onto Setores and Status, and the second overcorrected into
   truncating Nome. Final split: Nome 18%, Email 20%→23% (bumped back up after the middle pass wrapped
   every email, even short ones, more than necessary), Papel 22%→19% (had visible slack at 22%), Setores
   17%, Status 23%. Verified all five columns render every seeded row's content in full.

---

## Also fixed

- **`/settings`'s header subtitle was stale.** It still read "Aparência do app." after round 7 added
  a "Sou gestor ou par voluntário" staff-access section to that same screen. Fix: subtitle now reads
  "Aparência do app e acesso da equipe." (`app-header-meta.ts`), within the two-line character budget
  the existing `app-header-meta.test.ts` already enforces for every route.

## Persona Red Flags Addressed

**Sam (accessibility-dependent):** the 1.4.11 contrast failure on both trend charts is fixed, in both
light and dark mode.

**Rita (privacy-conscious, LGPD-aware):** the specific-consent gap on `/consent` — where declining to
have her signals aggregated meant declining the app entirely — is closed. She can now use Zelo fully
while opting out of the aggregate signal, and can change that choice later from `/you`.

## Minor Observations Remaining

- The peer partner's bottom nav still puts "Sair" at equal visual weight beside the actual navigation
  tabs — a mistap risks ending the session. Deferred; not attempted this round.
- The peer-partner-facing `/settings` header subtitle still just says "Aparência do app." — left
  as-is since `PeerPartnerSettingsPage` has no staff-access section to describe.
- `/chat`'s empty state has unused vertical space below the composer on a tall viewport. Cosmetic;
  deferred.
- Seeded demo data hygiene: a manager literally named "Debug Teste" and a peer-partner specialty of
  "Amigo" are visible in the admin tables during a live demo. Not a code issue; worth a seed-script
  pass before the next demo, not this round.
