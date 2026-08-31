# Zelo — Design Improvements, Round 3

Third Impeccable `/critique` of `apps/web`, run against `main` at `9f87e15` (PR #20 + #21 merged). Two isolated agents: a design-director review and a deterministic evidence pass, neither told what had changed.

Rounds 1 and 2 and their remediation are in [design-improvements.md](./design-improvements.md).

**Design health: 26/40 (65% — Acceptable). Trend: 25 → 27 → 26.**

**Status:** **all P0s and all P1s are closed** (items 1–7). **Open: P2 (8–11) and P3.** Re-run `/impeccable critique apps/web` to
score the current code — the 26 above measures the surface before this remediation.

**The score fell while the surface improved.** Every item from rounds 1 and 2 that was fixed stayed fixed. This round simply looked harder at error paths than either previous round, and found defects that were present in all three. That is the trend line working as intended: it tracks what has been *found*, not how much work has been done.

---

## Method note — what "detector clean" is actually worth here

The HTML engine now runs at full strength; the parser modules installed after round 2 work, verified with a control file where `low-contrast`, `dark-glow`, `overused-font` and `bounce-easing` all fired.

But `.tsx` routes to a **regex engine whose CSS patterns are kebab-case only**. It cannot see JSX style objects or Tailwind arbitrary values — which is how 100% of this codebase is written. The entire computed-style rule family (`low-contrast`, `tiny-text`, `text-overflow`, `cramped-padding`, `line-length`, `design-system-*`) is structurally unreachable for all 182 `.tsx` files.

**So a clean detector run over `src/presentation` means very little.** This is the second correction to this claim: round 2 walked back an over-broad alarm by saying the undercount applied to `index.html` alone, and that was also wrong. The contrast and text-size findings below were reproduced by hand precisely because the tool could not reach them.

The executable guards in the repo — `theme-contrast.test.ts`, `token-pairing.test.ts`, `focus-visible.test.ts`, `a11y.test.tsx` — are doing far more real work than the detector is.

---

## P0

### 1. A failed assessment upload reports itself as a success — ✅ FIXED

`use-cases/submit-assessment.usecase.ts:43-57` returns `submissionSucceeded: false` when the upload fails. **No production code reads it** — `grep` finds the field only in tests. `ScaleAssessmentPage.tsx:54-62` reads `totalScore` and `riskSignal` and navigates to the result screen either way.

Hospital wifi. A basement UTI. A lift. A doctor completes a nine-item instrument *including the self-harm question*, sees an ordinary result screen, and reasonably believes the check-in counted. It never reached the server, so it never reached the institution's aggregate — which therefore under-counts precisely the shifts with the worst connectivity.

The `submitError` branch at `ScaleAssessmentPage.tsx:134-145` — *"Não foi possível enviar suas respostas. Elas continuam salvas aqui."* — is effectively dead for the failure it was written for.

**Fix.** Thread `submissionSucceeded` into the result navigation state, widen `ResultLocationState`, and render one honest line on the result screen. The record is already durably in IndexedDB (`submit-assessment.usecase.ts:113`), so the *saved locally* half is true — only the UI is silent.

*(The original wording of this fix proposed "Vai sincronizar quando a conexão voltar." That was checked before implementing and is false: nothing retries. See below.)*

**Noted in rounds 1 and 2 and not acted on both times, including by me.** It was filed as a minor observation twice; it is a P0.

**Shipped.** `pendingSync: !result.submissionSucceeded` is threaded into the result navigation
state, `ResultLocationState` gained an optional `pendingSync` (absent is treated as uploaded, so
an older navigation state degrades safely), and the result screen states it plainly.

**The copy makes no promise of a later sync, deliberately.** Verified first: the local store
exposes only `save` and `listAll`, nothing retries the upload, and no service worker or queue
exists — so "vai sincronizar quando a conexão voltar" would have been false. It says what is
true instead: *"Salvo só neste aparelho. A conexão falhou, então este check-in não entrou nos
números anônimos do hospital. Ele continua no seu histórico, aqui."* A test asserts the notice
does **not** match /sincroniza|assim que|quando a conex/, so a future edit cannot quietly add the
promise back.

**Still open:** there is no retry. Re-submitting needs the raw answers, which the result state
does not carry, so a manual retry is a separate change — and a background queue is a feature.

### 2. `usePeerRequest` cannot express a failure — ✅ FIXED

`presentation/hooks/usePeerRequest.ts:6` declares `"idle" | "searching" | "matched" | "no_peer_available"` — no error member — and registers no `connect_error` or `disconnect` listener. A dropped socket leaves a doctor on *"Procurando um colega disponível…"* indefinitely.

**This is the doctor-side twin of a bug fixed on the volunteer side one round ago.** `usePeerPartnerConnection.ts` gained an `error` member last round, with a comment reading *"error is load-bearing"* — and the same fix was never carried across to the person in distress. Same pattern as the `ManagerSidebar` / `Sidebar` miss: half a defect fixed, the mirrored half left standing.

Partially mitigated: `PeersPage.tsx:94-99` shows a 15s slow-search notice offering the CVV number, so there is an exit. But the state itself never resolves.

**Shipped.** Mirrored from `usePeerPartnerConnection` exactly: an `error` member on the union,
`connect_error` and `disconnect` listeners, and a failure state on `PeersPage` that says *"Não
foi possível conectar agora. Você não está na fila de espera."* — naming the consequence, not
just the fault — with a retry and the crisis line promoted into the actions rather than left in
the footer alone. `disconnect` does not clobber `matched`, so ending a real conversation is not
reported as a failure.

---

## P1

### 3. No root error boundary, no 404 — ✅ FIXED

`ErrorBoundary` exists and is used in **exactly one place** — `ChatPage.tsx:103`. `router.tsx` declares no `errorElement` and no `path: "*"`.

A render error on any of the other 28 pages, or a mistyped URL, or a stale bookmark, yields React Router's unstyled English default: no Zelo branding, no Portuguese, and **no CVV number** — in a product whose non-negotiable property is that the crisis line is always reachable. The chat already models the correct behaviour; it just was never applied at the root.

**Shipped.** `FallbackPage` serves both: a `{ path: "*" }` catch-all placed last, and an
`errorElement` on the root route covering every child. Two copy variants — an unknown URL says
the link may be stale, a crash says the fault is ours — and both carry a serif heading, a way
home, and `CrisisCallLink`. The thrown value is read only in `RouteErrorFallback`, logged to the
console in dev and never shown to a doctor, so `FallbackPage` stays renderable anywhere.

### 4. The dashboard renders a failed fetch as data — ✅ FIXED

`ManagerDashboardPage.tsx:150-152` — a non-401 failure falls through `?? 0`, so a coordinator sees **0%** and **0 questionários respondidos** as if measured. Three other pages render a failed load as an empty state: `AdminInstitutionsPage.tsx:138`, `ManagerInsightHistoryPage.tsx:188-193`, `LinkInstitutionSectorStep.tsx:26-30`.

"Nothing happened" and "we could not find out" are different facts, and only one of them is safe to act on.

**Shipped, on all four surfaces.** The dashboard now withholds the KPI cards and both charts
entirely on a non-401 failure and says so — *"Nada aqui foi medido — estes números não existem
até a próxima tentativa."* — with a retry. Rendering `0%` was worse than rendering nothing,
because a coordinator can act on it.

`AdminInstitutionsPage` gained all three states where it previously had none, so a failed load no
longer reads as an empty register. `ManagerInsightHistoryPage` shows `DataTableError` instead of
"Nenhuma análise gerada ainda". `useLinkInstitutionFlow` now exposes `isError` separately from
`hasSectors`, so "your hospital has not registered its sectors" is no longer shown for a network
failure — only one of those is the hospital's fault.

### 5. Sector managers navigate to three destinations that bounce them back — ✅ FIXED

`MANAGER_ADMIN_NAV` renders unconditionally (`ManagerSidebar.tsx:124`, `ManagerBottomNav.tsx:122`), while `router.tsx:50-52` redirects any non-`HOSPITAL_ADMIN` away. The sidebar already reads `role` (`ManagerSidebar.tsx:74`) — for a tooltip label.

A `SECTOR_MANAGER` sees Gestores, Setores and Pares anônimos permanently, taps one, and lands back on Tendências with no message. On mobile the sheet just closes. The likeliest reading is that the app is broken — and on an iPad in a meeting, in front of their director.

**Shipped.** `managerNavFor(role)` in `manager-nav.ts` returns the admin group only for
`HOSPITAL_ADMIN` — and for an unknown role too, since a null role is not yet an entitlement.
Both navs consume it, and each suppresses the "Administração" heading when the group is empty
rather than leaving a label over nothing. `ManagerRole` had to be exported from the session
store; it was previously module-private, which vitest would never have caught since it does not
typecheck.

### 6. The result screen leads with the alarm and reassures afterwards — ✅ FIXED

`AssessmentResultPage.tsx:30-63` has **no heading in its body** — the only heading on the route is `AppHeader`'s 15px sans "Resultado". On a 375×667 phone the first viewport after item 9 is: a 13px caption, a 64px band-toned number, and a red pill. *"Isto é um sinal, não um diagnóstico"* sits below it.

The reassurance arrives after the alarm. Then two full-width, same-weight buttons ask a person in distress to choose between "Falar com alguém agora" and "Conversar com o acolhimento".

**Shipped, with the heading *not* keyed to the band.** The original proposal was two variants —
calm for minimal/mild, warm for high/severe. That was rejected on review: a doctor who checks in
weekly would decode it, so "Obrigado por responder até o fim" would become a tell that the number
is bad *before they had read the number*. The severity-specific warmth already lives in
`BandSupportCard` and `RiskSignalCallout`, which appear after the frame and exist for exactly
that. The heading is the same at every severity.

- `<h2 className="font-serif text-h2">Obrigado por responder até o fim.</h2>` — the screen's first
  entry point, and the first serif headline in the doctor's core loop since the shared-header
  change.
- The reframing line moved **above** the score, unchanged in wording. Reassurance that arrives
  after a 64px band-toned number has already been read is not reassurance.
- The chat CTA drops to `outline` when `riskSignal || bandNeedsSupport(band)`, so the support
  card's own primary is the only full-weight action on the screen.

Tests assert the heading is byte-identical at 24/27 and at 2/27, so the tell cannot be
reintroduced.

### 7. Manager severity is painted in the brand's affirmative colour — ✅ FIXED

`ManagerDashboardPage.tsx:220,271` — every trend and segment bar is `bg-brand` sage. A sector at 90% concerning draws a long, healthy-looking **green** bar. A coordinator scanning for the worst sector scans for the longest green bar.

The doctor's own chart already gets this right: `HistoryChartCard.tsx:68-76` paints the peak `bg-warn` and only the latest reading `bg-brand`.

**This does not require resolving the open burnout-metric question.** Round 2 deferred band-colouring on those grounds, but "peak vs latest" needs no thresholds at all — it is the same relative treatment the doctor's chart already uses.

**Shipped.** `peakTrendIndex` and `peakSegmentLabel` mark the highest week and the highest sector
in `bg-warn`; everything else is `bg-track`, and only the most recent week keeps `bg-brand`. Both
return "no peak" when nothing has been measured, so an all-zero period is not given a false
worst. The trend card gained the same **Pico / Mais recente** legend the médico's chart carries —
without it the colours are a guess.

Still relative, not threshold-based: it says "this is the highest here" without claiming what
counts as bad, so PRODUCT.md's open metric question stays open.

---

## P2

### 8. Every border hairline fails WCAG 1.4.11

Independently computed, light / dark:

| Pair | Ratio | Needs | Where |
|---|---|---|---|
| `line` on `surface` | 1.29 / 1.33 | 3:1 | `TextField.tsx:4` — every input |
| `line` on `canvas` | 1.17 / 1.47 | 3:1 | `ChatComposer.tsx:161` |
| `track` on `surface` | 1.43 / 1.74 | 3:1 | unchecked `Checkbox`, `Radio` |
| `surface-brand` as border on `canvas` | 1.10 / 1.34 | 3:1 | `ManagerSidebar.tsx:82` |
| `danger-border` on `danger-bg` | 1.34 / 1.36 | 3:1 | error states |
| `faint` on `surface` | 2.50 | 3:1 | `QuestionCard.tsx:58` hover |

Most consequential on `TextField`, where the border is the *only* boundary cue — the fill is 1.11:1 from the page.

### 9. Two alpha-composited text failures the token tests cannot see

- `text-muted-2` on `bg-warn-bg/40` over canvas: **4.47:1** (`ManagerNotificationsPage.tsx:64`). The untinted pair is 4.57 and passes; the `/40` tint alone pushes it under.
- `text-brand` on `bg-track` (soft button hover): **4.29–4.36:1** across all four accents (`Button.tsx:22`). `theme-contrast.test.ts:174` does test this pair — but at the 3:1 *graphic* threshold, while it is used as a text pair.

`theme-contrast.test.ts` parses literal hex from `index.css`, so every `/5`, `/10`, `/40`, `/75` in TSX is unchecked, as is every `opacity-*` group composite. That is the gap to close, not the individual pairs.

### 10. A result cannot be reopened

`AssessmentResultPage.tsx:15-25` is `location.state`-only. Refresh, share, or return later and it redirects to the scale picker — while the encrypted record sits in IndexedDB on the same device.

### 11. Other

- **No skip link anywhere.** A keyboard user on a manager admin page tabs through 8 sidebar destinations before reaching the table.
- **All 14 `--text-*` tokens are `px`**, so the app answers page zoom but not the browser's font-size preference. Four sub-12px sites (`Sidebar.tsx:37`, `ManagerSidebar.tsx:52` at 10px; `BottomNav.tsx:63`, `ManagerBottomNav.tsx:16` at 11px); 28 bracketed `text-[Npx]` bypass the scale.
- **The accent picker ships four brand colours to the doctor.** `index.css:225` states outright that changing the brand colour "is not what this preference is for", then ships exactly that to the audience for whom sage green *is* the promise. Same for the corners toggle against the stated corner scale.
- **`/peers` is consent-gated but not authenticated** — it opens a live peer-to-peer chat rendering another person's messages. The API accepts a token-less socket as an anonymous connection by design; worth confirming that is intended.

---

## P3

Dead `useApiHealth` (zero references, plus a six-symbol chain behind it that ships nothing) and `QuestionCardSkeleton`. `"Voltar ao início"` navigating to `/assessment`. Three `className="p-2 cursor-pointer"` overrides on `ManagerDashboardPage` fighting their own Button variant. `no-scrollbar` at all breakpoints in `DataTableToolbar` and `TranscriptScroller`, hiding the desktop scroll cue. Two greetings stacked in the Home header. `/peer` missing from `APP_HEADER_META`. `ManagerNotificationsPage` and `ManagerInsightHistoryPage` rendering nothing at all while loading. `ChatDisclaimerBanner` at `text-[12.5px]`, the only fractional size in the codebase, on the one non-dismissable legal notice.

---

## What is genuinely strong

Verified independently this round rather than taken on trust:

- **Token discipline is total** — 0 hardcoded colours and 0 arbitrary colour values across 182 `.tsx` files.
- **Hit targets are solved structurally.** All four bleed users compute to exactly 44px at both breakpoints, and compact density provably cannot breach it — every `py-control-y` consumer also carries `min-h-11`.
- **Icon-only buttons cannot ship unlabelled.** `IconButton` omits `aria-label` from its props type and applies it *after* the spread, with a comment explaining that TS cannot excess-check hyphenated JSX attributes.
- **Reduced motion is complete and reasoned** — a global kill with a `motion-essential` opt-back-in, correctly applied to the three indefinite indicators and correctly withheld from `WaveText`, whose text stays legible at rest.
- **`focus-visible.test.ts`'s allowlist was independently re-derived and found accurate**, including its second test that fails if an allowlisted file stops suppressing.
- **1682 tests, `tsc`, `eslint`, `depcruise` all clean**, with `a11y.test.tsx` running axe across ~21 screens.

---

## Two recurring patterns worth naming

**Mirrored fixes get applied to one side.** Twice now: `ManagerSidebar` fixed while `Sidebar` kept the identical 768px defect; `usePeerPartnerConnection` given an error state while `usePeerRequest` — the side used by the person in distress — kept none. When a fix lands on one of a pair, the other half needs checking in the same pass.

**The doctor surface gets less than the manager surface.** The manager's chart has week labels; the doctor's has six bare bars. The manager's tables have loading, error and empty states; `AdminInstitutionsPage` has none. The person whose data it is consistently gets the less finished view of it.
