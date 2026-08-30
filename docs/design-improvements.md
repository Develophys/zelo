# Zelo — Design Improvements

Backlog from an Impeccable `/critique` of `apps/web` (2026-08-30). Two isolated assessments: a design-director review and a deterministic evidence pass.

**Design health: 25/40 (62% — Acceptable).** The token layer and the chat surface are genuinely excellent. The two paths a user reaches when they are least okay — the assessment instrument and the crisis-accept branch — are the weakest in the product.

Every claim below cites a file and line.

**Legend.** A heading ending `— ✅ FIXED` is done and covered by tests. A ✅ *inside* a finding's body means that specific claim was independently re-verified when the critique was written — it marks a confirmed bug, not a completed fix.

**Status:** P0 (items 1–3) is closed. P1 items 4, 5, 6, 7, 9, 10, 11 and 12 are closed; **item 8 is won't-fix by product decision**. P2 items 13 and 14 are closed. **Open: P2 items 15–17, and P3** (plus the route-announcement half of item 14). One part of item 7 is deliberately not done — see its entry.

---

## P0 — Safety-critical. ✅ Fixed 2026-08-30.

All three landed with tests written first. Suite went 1556 → 1578 passing; typecheck, lint, dependency-cruiser and the Impeccable detector are all clean.

### 1. The CVV number is not tappable on either crisis screen — ✅ FIXED

`pages/CrisisOfferPage.tsx:33-39` and `pages/CrisisAcceptPage.tsx:53-55` render `{line.label} · {line.phone}` inside a `<p>`. `getCrisisLine()` already returns a ready `telHref` (`crisis-line.ts:18`), and three *less* critical surfaces use it: `ChatAlerts.tsx:14-23`, `ChatTranscriptFallback.tsx:48-54`, `CrisisDeclinePage.tsx:28-33`.

A person in acute distress must read 188 off the screen, hold it in working memory, leave the app, open the dialer, and type it — in exactly the cognitive state where that chain breaks. The path they *declined* can dial. The path they *accepted* cannot.

**Shipped.** `CrisisCallLink` extracted to `presentation/components/CrisisCallLink.tsx`; `ChatAlerts` now imports it rather than defining its own. Both crisis screens use it, and the offer page's card moved above the flex spacer so it sits with the two choices instead of on the bottom edge. `CrisisAcceptPage` was rebuilt around it — see item 4.

Guarded by `pages/crisis-call-reachability.test.tsx`, a `describe.each` sweep over all three crisis routes asserting a `tel:188` anchor. Verified it genuinely fails (0 dialable links) when run against the previous `CrisisOfferPage`.

### 2. An assessment answer cannot be changed, and item 9 auto-submits — ✅ FIXED

`pages/ScaleAssessmentPage.tsx:28-54` advances on selection and only ever increments: `setQuestionIndex((index) => index + 1)`. There is no decrement anywhere in the file. The page mounts `PhoneShell bottomNav centered` (line 57), so `backFor(false, true)` returns `'from-md'` (`PhoneShell.tsx:39-44`) and `BACK_CLASS['from-md'] = 'hidden md:flex'` (`AppHeader.tsx:19`).

**On a phone there is no back control for the entire 9-item PHQ-9.**

PHQ-9 item 9 is "Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)" (`phq9.ts:10`). It is the last item, so tapping any option fires `mutateAsync` and navigates to the score in the same frame. No pause, no confirm, no recourse.

Two harms. Clinically, PHQ-9 validity assumes the respondent can review and revise; a mistap at 3am silently corrupts a score that drives risk detection and feeds the manager aggregate. Emotionally, the most consequential disclosure in the product is one unbuffered, irreversible tap followed immediately by a red screen.

**Shipped — with one correction to the plan above.** `backFor` was left alone.
`PhoneShell.tsx:33-38` documents the header back as *an escape hatch, not a step backwards*, and `AppHeader.tsx:52` confirms it: `onClick={() => navigate(routes.home)}`. Routing the assessment through it would have produced a control that silently discards every answer — the exact failure this item is about. The page owns its own step-back control instead.

- `ScaleAssessmentPage` gained a `BackButton` in the progress row, disabled on the first question. `BackButton` took an optional `testId` prop so the in-body control and the header escape hatch stay distinguishable.
- `questionIndex` now runs `0..total`, where `total` is a review step. Answering the last item advances to the review; it no longer submits.
- New `components/AssessmentReview.tsx` lists every question with its chosen answer, each row tappable to jump straight back to that item, above one "Enviar respostas" button that owns the mutation.
- The submit-failure copy no longer tells the user to re-select an option they already selected; it keeps the answers and offers "Tentar novamente".

The old tests encoded the old contract (`'auto-advances on selection, with no way back'`, `'offers no back control in the body'`) and were rewritten. The decisive new one — `'answering the last question opens a review instead of submitting'` — was watched failing with `expected "execute" to not be called at all, but actually been called 1 times`.

### 3. Selected sector pills measure 1.49:1 in dark mode — ✅ FIXED

`ui/SectorPillPicker.tsx:6` — `selected ? 'border-brand bg-brand text-on-fill'`. In dark, `--color-brand: #a8d8c9` (light mint, `index.css:153`) and `--color-on-fill: #f4faf8` (near-white, `index.css:159`).

**Computed: 1.49:1. Needs 4.5:1.** Light mode is fine at 6.20:1.

`brand` is the *text* role; `brand-fill` is the fill role. The tokens were inverted. `theme-contrast.test.ts:130` checks `['on-fill', 'brand-fill', 4.5]` but never `['on-fill', 'brand']` — the pair matrix has a hole exactly where the contract was broken.

This is the manager dashboard's primary filter (`ManagerDashboardPage.tsx:104-113`) *and* the sector assignment control in the create/edit-manager modal (`ManagerAdminManagersPage.tsx:85-91`). In dark mode a coordinator cannot read which sectors are selected — while assigning a manager's data access. Every accent inherits the inversion; clay (`#e6c7bb`) is worse.

**Shipped — the test guidance above was wrong and was not followed.** Adding `['on-fill', 'brand', 4.5]` to `theme-contrast.test.ts` would assert that a pair which must *never* be used is safe, and it would fail permanently, since `brand` is a light mint in dark mode by design. The token is fine; the call site was wrong.

`SECTOR_PILL_CLASS` is now `border-fill-edge bg-brand-fill text-on-fill`, which measures **4.98:1** in dark and 6.20:1 in light.

The guard went in at the call site instead: `ui/token-pairing.test.ts` extracts every string literal under `src/presentation` and fails on any that pairs a text role (`bg-brand`, `bg-danger`, `bg-warn`, `bg-success`) with `text-on-fill`. On the unfixed code it found exactly one offender — `SectorPillPicker.tsx` — and no false positives, so it closes the class of bug rather than this one instance.

---

## P1 — Fix before release. ✅ Fixed 2026-08-30 (item 8 excepted — won't fix).

### 4. The crisis-accept screen promises a person and delivers a directory — ✅ FIXED

The user taps "Sim, quero falar com um psicólogo" and the next screen asks **"Você é atendido pelo SUS ou por um plano de saúde/rede privada?"** (`CrisisAcceptPage.tsx:27-29`) — an insurance-triage question at 13px `text-caption text-muted`, to someone who just disclosed suicidal ideation. Answering yields a static paragraph pointing at a CAPS (`get-crisis-direction.usecase.ts:10-19`), a non-tappable CVV number, and one "Entendi" button home.

Psychologist matching is documented as unbuilt scope (PRODUCT.md), and that is fine. The design failure is separate and fixable today: the screen makes a person in crisis do bureaucratic self-classification to reach a static answer.

**Shipped alongside P0 #1** — same screen, same edit. `CrisisAcceptPage` now opens on a serif heading ("Você pode falar com alguém agora."), then a full-bleed brand card carrying the number at 40px with a tappable call button, and only then the bond question, reframed as "Quer que eu te indique onde procurar acompanhamento depois?". The CAPS/plano direction still renders on choosing, and `GetCrisisDirectionUseCase` was not touched. Tests assert the call link precedes the bond question in DOM order and survives a bond being chosen.

### 5. The consent copy overstates what is revealed — resolved as a copy question

**Investigated 2026-08-30.** `RequestHumanHandoffUseCase` is a pure function returning `{ label: "CVV…", phone: "188" }` — no identity, no network, no PII, and its own test asserts it is I/O-free. Nothing is disclosed today, because psychologist matching is unbuilt.

So this is not a missing disclosure screen; it is `ConsentPage.tsx:21-23` promising control over a reveal that does not yet happen. The fix is to soften that copy to match reality now, and add the disclosure step when matching actually ships. Left open because the copy is normative per PRODUCT.md and is yours to word.

`ConsentPage.tsx:21-23` promises: "Minha identidade só é revelada se **eu escolher** falar com uma pessoa." PRODUCT.md names crisis-accept as the one explicit-action reveal.

No screen in `/crisis/connect` asks for, mentions, or confirms any identity disclosure. So the user who taps "Sim" does not know whether they just gave up their anonymity — the single thing the product told them to trust it about.

Either the promise is currently vacuous (nothing is revealed and the copy overstates the stakes) or the disclosure is implicit and unannounced. Both are trust problems.

**Fix.** This needs a product decision, not just a UI change. If nothing is revealed today, soften the consent copy to match reality. If something is, add a deliberate "você está prestes a deixar de ser anônimo(a) — eis exatamente o que uma pessoa vai ver" step before the handoff.

### 6. The shared header ships doctor anonymity chrome into the manager panel — ✅ FIXED

`ManagerShell.tsx:23` renders `<AppHeader />` with no override, and `AppHeader.tsx:65-68` unconditionally renders `ThemeSwitchButton` **and** `PrivacyBadge` (label "anônimo"), which opens `EncryptionInfoModal` — a modal stating "sua identidade permanece anônima" (`EncryptionInfoModal.tsx:26`).

A hospital coordinator is authenticated by name and role (`ManagerSidebar.tsx:18-21` displays their role label). Telling them on every panel screen that they are anonymous is factually wrong for their session, and it dilutes the badge for the audience it was built for: if "anônimo" appears on the employer's dashboard too, it stops reading as a promise to the doctor.

The "one shared header" refactor made the header uniform without making its *contents* role-aware.

**Shipped.** `AppHeader` took a `chrome?: 'doctor' | 'manager'` prop, defaulting to `doctor`; `ManagerShell` passes `manager`. The privacy badge now renders only on the doctor surface. The theme switch stays on both.

Nothing was put in the vacated slot. The k=5 rule is already stated on the dashboard itself (`DASHBOARD_DISCLOSURE`), and repeating it as a header chip on every panel screen would be decoration, not information. Two tests cover it: the manager chrome withholds the badge, and `ManagerShell` does not tell a named manager they are anonymous.

### 7. The manager's charts are unreadable, and the trend chart misrepresents zero — ✅ FIXED (except bar tone, see below)

`ManagerDashboardPage.tsx:188-192` renders bare `<div>` bars with no axis, no week labels, no values, no tooltip, and **no accessible text of any kind** — while the *doctor's* equivalent chart carries a full `sr-only` week-by-week description (`HistoryChartCard.tsx:24-28`).

- `toTrendBarHeights` (line 29-31) applies `MIN_TREND_BAR_HEIGHT = 8`, so a 0% week draws a visible bar indistinguishable from a real low value.
- All bars are `bg-brand` — sage — so a rising burnout trend is drawn in the reassurance color, and worse weeks look identical to better ones.
- `Sinais por setor` (lines 203-215) has the same problems plus raw `n={segment.n}` statistical notation, unexplained, to a coordinator.
- The burnout KPI is `text-warn` **unconditionally** (line 163). At a 0% concerning rate the number is still amber — the color carries no information and at low values actively lies.
- `lg:grid-cols-4` (line 153) with only three KPI cards (162-174) leaves a permanently empty fourth column on every desktop view. It reads as a failed load.

This is the entire justification for the manager surface, and it is illegible.

**Shipped.** New `lib/manager-trend-chart.ts` holds the chart maths, mirroring the doctor-side `weekly-history-chart.ts`, with its own unit tests:

- Both cards gained `sr-only` description lists. A screen-reader user now gets "Semana de 8 de jun.: 50% (mais recente)" per week and "UTI: 44%, 9 respostas" per segment, where previously they got nothing at all.
- `MIN_TREND_BAR_HEIGHT = 8` is gone. A zero week draws at 2px in `bg-track`, a non-zero week at no less than 8px in `bg-brand`, so 0% is no longer indistinguishable from a real low value. Values above 100% clamp instead of overflowing.
- Week labels sit under the bars, formatted from `weekStart` **in UTC** — `weekStart` is a UTC week boundary, and local formatting shifts the label a day for everyone in Brazil.
- `n={segment.n}` became "18 respostas", agreeing in number for n=1.
- `lg:grid-cols-4` with three cards became `lg:grid-cols-3`, closing the permanently empty column.

**Deliberately not done: band-scale bar colouring.** Colouring bars by severity requires deciding what rate counts as bad, and PRODUCT.md lists *"the exact metric behind the manager-facing burnout signal aggregate"* among the open questions not to resolve unilaterally. Inventing thresholds here would answer a product question in a stylesheet.

For the same reason the burnout KPI is now `text-ink` rather than an unconditional `text-warn`. Amber at 0% was a signal that wasn't there; neutral states the number without asserting a threshold nobody has agreed. Once the metric is settled, the `--color-band-*` scale is ready and this becomes a small change.

### 8. "Administração" sits in the doctor's own navigation — ❌ WON'T FIX (product decision, 2026-08-30)

**The finding was wrong, and the reason is worth recording.**

`nav-tabs.ts:101-111` puts `ADMIN_NAV_ITEM → routes.manager` into `SECONDARY_NAV_ITEMS`, which both `Sidebar.tsx:71-73` and `BottomNav.tsx:91-102` render for every consented doctor.

The critique read that as a trust hazard: a link to the employer-facing dashboard, one tap from the privacy screen, inside the app that promises the employer cannot see you.

**That reasoning assumed the doctor and the coordinator are always different people. They are not.** In a real hospital the same person is frequently both — a clinician who checks in on their own mental health, and the coordinator responsible for their sector's aggregate. Removing the entry point does not protect that person from their employer; it just makes them type a URL to reach a panel they are authorised to use.

It was removed and then restored the same day. Nothing in the nav is changed from where it started.

**What is actually true here:**

- The link goes to `routes.manager`, which redirects to `/manager/login` without a valid manager session. A doctor who is not a manager taps it, sees a login screen they cannot pass, and learns nothing about themselves or anyone else. No doctor data is exposed by the link's existence.
- The `HOSPITAL_ADMIN`-only routes are separately guarded in `router.tsx`, and `router.test.tsx` covers a `SECTOR_MANAGER` being redirected away from them.
- `/admin` (platform admin) and `/peer` (peer partner) remain URL-only, with no nav entry. That asymmetry is deliberate: those are not roles a doctor holds.

**If this is revisited,** the question to answer first is not "should the link exist" but "should it be conditional on the viewer having ever held a manager session" — which trades the trust concern against a first-run problem, since a manager needs the doorway before they have a session to condition on.

### 9. The crisis screens invert their own visual hierarchy — ✅ FIXED

`app-header-meta.ts:20-22` puts the emotional headline in the header title slot — "Você não está sozinho(a).", "Vamos te direcionar", "Tudo bem. A escolha é sua." — where `AppHeader.tsx:56` renders it at `text-body-strong` (15px, sans) beside a theme toggle. The largest element on `/crisis` is then a decorative `IconBadge size={60}` (`CrisisOfferPage.tsx:17`); the page has no `h2` at all.

The app's `h1` is 15px sans — *smaller than the 24px serif `text-h2`* used for card titles beneath it. The hierarchy is inverted at the moment it matters most.

`CrisisDeclinePage` proves the alternative works: a 40px serif number in a full-bleed brand card (line 20-34). It is the best-composed screen in the product — and it is the path the user declined.

**Shipped.** All three crisis routes now carry neutral header labels — "Apoio", "Falar com alguém", "Linha de crise" — with a comment in `app-header-meta.ts` saying why: the header renders its title at 15px sans beside a theme toggle, so an emotional headline squeezed in there reads as chrome.

Each screen owns its headline in the body as a serif `h2`: "Você não está sozinho(a)." on the offer, "Você pode falar com alguém agora." on accept (item 4), and "Tudo bem. A escolha é sua." on decline. The offer page's decorative `IconBadge` dropped from 60px to 38px so it no longer outweighs the headline — a test asserts the badge precedes the heading rather than dominating it.

### 10. The manager table's search field has no visible focus ring — ✅ FIXED

`ui/DataTable/DataTableToolbar.tsx:55` — `focus-visible:outline-none` with **no compensating ring**, and the wrapping `<label>` (line 46) has no `has-focus-visible:` either. This is the sole unmatched case out of 38 `outline-none` occurrences; every other one is paired with a `focus-visible:ring-2`.

Also at `:50-55`: the input computes to **41.8px** tall, dropping to **35.8px** under `data-density="compact"` — below the 44px target.

**Shipped.** The input now carries `min-h-11 rounded-control px-1 focus-visible:ring-2 focus-visible:ring-brand`.

Guarded by `ui/focus-visible.test.ts`, built the same way as the contrast guard: every string literal under `src/presentation` that suppresses the outline must also draw a ring. On the unfixed code it found exactly one offender — `DataTableToolbar.tsx`. The two legitimate exceptions are an explicit named allowlist (`RevokeConsentSection`'s `tabIndex={-1}` target and `ToastViewport`'s `pointer-events-none` container), and a second test asserts the allowlist stays honest — if either file stops suppressing the outline, the stale entry fails rather than sitting there forever.

### 11. The "em breve" card fails contrast because of `opacity-70` — ✅ FIXED

`pages/AssessmentSelectPage.tsx:36-44` — the wrapper carries `opacity-70`, which composites the entire subtree:

- `text-muted-2` at `text-[11px]` on `bg-line`, both at 70% over canvas → **2.49:1 light**, 3.51:1 dark. Needs 4.5:1. Even ignoring the opacity it is 3.90:1 light.
- The `text-muted` MBI-HSS label at 70% on `canvas-alt` → **2.82:1 light**.

Because `opacity` is a compositing property, no token-level test can catch this. It is exactly the class of bug the (otherwise excellent) `theme-contrast.test.ts` is structurally blind to.

**Shipped.** `opacity-70` is gone; the card is recessed with tokens instead, with a comment saying why. Measured on the real values:

| | Before | After |
|---|---|---|
| "em breve" pill | `text-muted-2` on `bg-line` @70% → **2.49:1** | `text-ink-2` on `bg-line` → **5.83:1** light / 7.69:1 dark |
| MBI-HSS labels | `text-muted` @70% → **2.82:1** | `text-muted` on `bg-canvas-alt` → **4.93:1** light / 7.32:1 dark |

The pill also moved off `text-[11px]` onto `text-eyebrow`. Two tests hold the line: the card carries no `opacity-*` class, and the pill is on the type scale rather than a bracketed pixel size.

### 12. `HistoryChartCard` collapses loading, error, and empty into one state — ✅ FIXED

`pages/HomePage/HistoryChartCard.tsx:11-12` destructures only `data` — no `isLoading`, no `isError`:

```tsx
const { data: history } = useAssessmentHistory();
const points = history ?? EMPTY_POINTS;
```

Loading and fetch-failure both render as the empty chart (`bg-line` bars). Three distinct states silently become one. This is the only page-level gap that owns async data — the manager surface, by contrast, is exemplary, with `DataTableEmpty`/`DataTableError` giving each table page four separate branches.

**Shipped.** The card now reads `isLoading` and `isError`, which the hook already exposed. Loading renders six skeleton bars matched to the chart geometry, so the card holds its height instead of jumping when data arrives. A failed fetch renders a calm `role="alert"` line — "Não foi possível carregar seu histórico. Seus check-ins continuam salvos." — plus a retry wired to the query's `refetch`. The empty chart is now drawn only when the history genuinely loaded with no readings, which was always the honest use for it.

Four tests, one per state plus the retry path.

**Still open, and tracked here:** `SubmitAssessmentUseCase` returns `submissionSucceeded` (`submit-assessment.usecase.ts:43-57`) and `useSubmitAssessment` passes it through, but **no UI ever reads it**. A check-in that saved locally and failed to upload still looks identical to one that succeeded. That is a separate surface (the result screen), not this card.

---

## P2 — Next pass.

### 13. `PeerChatRoom` is an unstyled prototype on the human-connection path — ✅ FIXED

`components/PeerChatRoom.tsx:31-37` renders the transcript as `<p className="text-right">` / `<p className="text-left">`. No bubbles, no `chat-bubble.ts` reuse, no scroll region, no `aria-live`, no empty state, no typing indicator, no timestamps, no `useStickToBottom`. Used by *both* the doctor (`PeersPage.tsx:80-86`) and the volunteer (`PeerPartnerInboxPage.tsx:52`).

Anonymous peer support is a first-class pillar in PRODUCT.md, and it is the only place two humans actually meet. A doctor arriving from the polished AI chat hits a visible quality cliff at the moment they were promised something *more* human. A screen-reader user gets no announcement of an incoming peer message at all.

**Shipped — with a different boundary than the one proposed above.** Lifting a whole shared `<Transcript>` out of `ChatPage` turned out to be the wrong cut: that region carries an `ErrorBoundary` with `ChatTranscriptFallback`, `ChatAlerts`, `AssistantTypingIndicator`, `ChatEmptyState`, streaming `aria-busy` and `CHAT_COLUMN` — none of which peer chat has any use for. Hollowing out the best-tested screen in the app to force a shared shell is regression risk for no user gain.

Two small primitives instead, both used by both surfaces:

- `ui/MessageBubble.tsx` + `ui/message-bubble.ts` — the bubble presentation, keyed on a neutral `side: 'own' | 'other'`. `ChatMessageBubble` became a thin wrapper preserving its exact API and `data-testid`s, so none of ChatPage's tests moved. The old `ChatPage/chat-bubble.ts` is deleted.
- `ui/TranscriptScroller.tsx` — the focusable, labelled scroll region wired to `useStickToBottom`, with `role`/`aria-live`/`aria-busy` parameterised. ChatPage passes `role="region"` and its streaming busy state; peer chat passes `role="log" aria-live="polite"`.

`PeerChatRoom` now renders real bubbles with exchange rhythm, follows new messages instead of leaving the reader to scroll, and — the actual defect — **announces an incoming peer message**, where before a screen-reader user got silence. It also gained an empty state: "Vocês estão conectados. / Ninguém vê a identidade do outro. Diga oi quando quiser começar."

**Deliberately not done, because none of it is a component problem:**

- *Timestamps.* `PeerChatMessage` is `{ from, text }`. Adding a time means changing the socket payload and the API.
- *Typing indicator.* Needs a "peer is typing" socket event that does not exist server-side.
- *The `rounded-[20px]` hardcode* (P3) that bypasses the `data-corners` preference. It moved verbatim into `ui/message-bubble.ts`; changing it now would alter the AI chat's appearance, which was not in scope. It is still worth fixing, and is now fixable in one place for both surfaces.

### 14. Assessment options are buttons, not a radiogroup — ✅ FIXED (radiogroup; route announcements still open)

`QuestionCard.tsx:30` renders `<button aria-pressed>`, so VoiceOver announces "botão, pressionado" for a 4-point Likert scale — no "1 de 4", no group name, no sense that the options are mutually exclusive. After selection, focus is destroyed with the button and lands nowhere.

Compounding it: there is no route-change announcement anywhere in the app. `index.html:9` is a static `<title>Zelo</title>` and no route updates it; there is no `ScrollRestoration` or focus hook in `router.tsx`. A blind user submits item 9 and has no reliable notification that they are on a different page.

**Shipped.** `QuestionCard` is now a `radiogroup` mirroring the pattern `SegmentedField` already established here — a labelled group of `sr-only` native radios inside styled `<label>`s — so the semantics come from the platform rather than a hand-rolled roving tabindex. VoiceOver announces "1 de 4", the group name and mutual exclusivity instead of "botão, pressionado".

**The hazard this uncovered, which the finding did not mention.** Selecting auto-advances. Native radios select on arrow key — and keyboard selection runs a radio's *full activation behavior*, so arrow keys fire `click` too, not just `change`. Wiring advance to `click` naively would have thrown a keyboard user to the next question the moment they pressed ArrowDown to explore the scale, on an instrument whose last item asks about self-harm. That is worse than the bug being fixed. A test caught it: the first implementation failed `'lets the keyboard explore the scale without being thrown to the next question'`.

The discriminator is `UIEvent.detail` — `0` for a keyboard-generated click, `>=1` for a real pointer. So:

- `onChange` records the answer. Every keyboard path lands here and the screen stays put.
- `onClick` advances only when `detail > 0`. The one-tap pointer path is unchanged.
- A "Próxima" button renders **only when an answer already exists** for the current question. A pointer user on a fresh question never sees it, because tapping advances first. A keyboard user sees it the moment they choose. Anyone returning from the review to an answered question sees it too — closing a real gap, since previously the only way onward was to re-tap an answer you already agreed with. On the last item it reads "Revisar respostas", naming where it actually goes.

**Still open from this item: route-change announcements.** `index.html` has a static `<title>` no route updates, and `router.tsx` has no focus management, so a blind user who submits still gets no reliable notification that the page changed. That is app-wide work touching every route and interacting with the shared `AppHeader` h1, so it was deliberately kept out of this change rather than bolted on.

### 15. `HomePage` has six competing CTAs and no primary

`HomePage.tsx:23-38` renders, in one scroll: FollowUpCard (2 buttons), InstitutionLinkCard (1 CTA), CheckInHeroCard (1 CTA), HistoryChartCard, and two quick-action cards. The brand-filled check-in hero — the app's actual primary action — is buried third, below a follow-up prompt and a "you're not linked to a hospital yet" nag.

A tired doctor has to *decide* before they can *act*.

**Fix.** Promote `CheckInHeroCard` to first. Demote the institution-link nag to a dismissible strip or move it to `/you`.

### 16. Native radios bypass the design system

`LinkInstitutionSectorStep.tsx:33-42` and `ManagerAdminManagersPage.tsx:55-77` render bare, unstyled `<input type="radio">` — 13px controls in ~36px rows — while `ui/Checkbox.tsx` and `components/settings/SegmentedField.tsx` show the team knows exactly how to build a token-driven control. There is no `Radio` primitive.

**Fix.** Build `ui/Radio.tsx` mirroring `Checkbox.tsx`'s 20px box + `-inset-3` = 44px pattern, and adopt it in both flows.

### 17. Other sub-44px hit targets

| Location | Element | Computed |
|---|---|---|
| `ui/ToastViewport.tsx:42-46` | dismiss button | 24×24px (`p-1` + 16px icon) |
| `pages/ManagerDashboardPage.tsx:228` | "Ver histórico" link | ~22px |
| `pages/AdminInstitutionsPage.tsx:45-52` | logout button | ~21px |

`IconButton.tsx:43-44` (32px box + `before:-inset-1.5` = 44px) and `Checkbox.tsx:24-28` (`-inset-3` = 44px) are the correct pattern — these three just don't use it.

---

## P3 — Polish.

- **`AppHeader.tsx:57-63` always renders the subtitle `<p>`, even when empty.** On `/assessment/result` and `/crisis` an empty 18px paragraph pushes the title above optical center on every load.
- **`ChatEmptyState.tsx:7` uses `text-justify hyphens-auto`** on a narrow phone column. Justified Portuguese in a ~52ch measure produces visible rivers. Use `text-pretty`, already used in `ChatAlerts.tsx:40`.
- **`ChatPage.tsx:19` hardcodes a single `CONVERSATION_ID`.** No way to start a new conversation or browse past ones — every session for the life of the install appends to one thread. A doctor who had a hard night in March scrolls past it every time.
- **`components/HealthBanner.tsx` is dead and dev-grade** — renders `api: {status}` and a lowercase "dismiss", the only English in a PT-BR UI, on a ~20px unlabeled button. Nothing imports it (grep confirms only its own test). Delete it before someone mounts it.
- **`ui/CardTitle.tsx:4` uses `text-lg`** — Tailwind's default 18px, off the type scale. It's the manager panel's only card heading.
- **`chat-bubble.ts:1` hardcodes `rounded-[20px]`**, bypassing both the corner scale and the user's `data-corners` preference (`index.css:275-281`). A user who picks "Cantos: arredondados" sees every card change and the chat bubbles stay put.
- **`Skeleton.tsx:6` `animate-pulse` lacks `motion-essential`.** Under reduced motion the loading skeleton goes fully static, losing its only "something is happening" signal. Every other indefinite indicator (spinner, typing dots) has the opt-in. One class.
- **`ScaleAssessmentPage.tsx:93-95`** — "Não foi possível enviar. Selecione uma opção para tentar novamente." The user *did* select an option. Give it a retry button.
- **`lib/theme.ts:11-12` hardcodes `#f2f5f3`/`#101815`** for `theme-color` meta. They must be literal, but nothing enforces that they track `--color-canvas`. They will silently drift.
- **`PeersPage.tsx:56-61`** — "Procurando um colega disponível..." has no timeout, no elapsed indicator, and no CVV fallback. At 03:40 the realistic outcome is `no_peer_available`, which offers only "Tentar novamente". There is no crisis line on this screen at all.
- **`PeersPage.tsx:30-35` and `:89-94`** duplicate the same "conexão sem troca de identidade" block verbatim. Hoist it.
- **Read notifications remain focusable dead buttons** (`ManagerNotificationsPage.tsx:64-66`). `onClick` no-ops and `cursor-pointer` is dropped, but a keyboard user still tabs every already-read row.
- **`PhoneShell.tsx:72` `<main>` carries `no-scrollbar`.** On desktop, long pages give no indication there is more below.
- **On phone, `DataTableShell` renders a bordered box containing only a toolbar**, because the `<table>` is `hidden md:table` (`DataTable.tsx:46`) while the real content is a sibling `<ul className="md:hidden">` *outside* the shell (`ManagerAdminManagersPage.tsx:318`). Search and bulk actions float detached from the list they act on.
- **`DataTable` supplies no mobile fallback of its own.** All three consumers provide one, but it is a convention held by call sites, not by the component. A fourth consumer that forgets renders nothing below 768px.
- **`ManagerInsightHistoryPage:239`** defaults the first mobile card expanded (`isDefaultOpen={index === 0}`) while the desktop table defaults all rows collapsed. Same data, two initial states.
- **iPad portrait is 768px — exactly the `md` boundary.** The manager rail shows six unlabeled icons (labels are `lg:not-sr-only`, `ManagerSidebar.tsx:47`) and the collapse toggle that would help is itself `hidden lg:flex` (`SidebarHeader.tsx:62`) — unavailable at the width where it is needed. Tooltips need a 450ms long-press per icon to learn what anything is.
- **The search empty state on all three admin pages is engineer-speak** — "Nenhum resultado nos itens carregados / A busca ainda percorre apenas a lista já carregada" (`ManagerAdminManagersPage.tsx:311-314`, duplicated in Sectors and Peers). It describes the implementation, not the user's situation.
- **`getGreeting` returns "Boa noite." for 18:00–04:59.** A doctor opening at 04:30 mid-shift gets "Boa noite." The file's own comment says the goal is to meet them at the hour they're actually in — "Boa madrugada." would land better with this exact user.
- **`text-eyebrow` is 12px at `0.1em` tracking**, frequently in `text-muted-2` (`SectionLabel`'s default tone). At 12px uppercase mono that sits near the AA floor and is the app's least legible recurring text. Spot-check on `canvas-alt`.

---

## Untested contrast pairs

`theme-contrast.test.ts` is unusually rigorous — 46 text pairs at 4.5:1 and 14 non-text pairs at 3:1, across 8 theme×accent combinations, plus theme completeness, scrim luminance, elevation inversion, and a filled-control rim matrix. These pairs fall outside it and fail:

| Pair | Theme | Ratio | Needs |
|---|---|---|---|
| ~~`on-fill` on `brand` (selected pill)~~ | dark | ~~1.49:1~~ → **4.98:1** | 4.5:1 ✅ |
| `line` vs `surface` | light / dark | 1.29 / 1.33:1 | 3:1 |
| `line` vs `canvas` | light / dark | 1.17 / 1.47:1 | 3:1 |
| `danger-border` vs `surface` | light / dark | 1.57 / 1.37:1 | 3:1 |
| `danger-border` vs `danger-bg` | light / dark | 1.34 / 1.36:1 | 3:1 |
| `track` vs `surface` | light / dark | 1.43 / 1.74:1 | 3:1 |
| `on-fill-2` on `brand-fill-hover` | dark (all accents) | 4.18–4.22:1 | 4.5:1 |
| `muted-2` on `canvas-alt` | light (all accents) | 4.41:1 | 4.5:1 |
| `muted-2` on `surface-brand` | light | 4.14–4.17:1 | 4.5:1 |

`line` is the border on `TextField.tsx:4` and the chat textarea (`ChatComposer.tsx:161`) — SC 1.4.11 applies to input boundaries, so the four `line` rows are real failures, not token trivia.

**Not a failure:** `warn` fails 4.5:1 in light (3.78:1 on canvas), but all five `text-warn` usages are large text (`ManagerDashboardPage.tsx:163`, 30px serif) or non-text icons. Each clears its applicable threshold. Disabled states composite to 2.0–2.9:1 under `disabled:opacity-50`, but WCAG exempts disabled controls.

**Recommended:** add every failing pair above to the test's pair list once fixed, so the matrix has no holes.

---

## What is already excellent — do not regress it

1. **The token layer is a real design system with enforcement.** Role tokens, not color names. A documented rationale for the corner scale and the `--cell-py`/`--cell-px` density mechanism. Accent presets derived at the sage reference's per-role luminance so no accent breaks a threshold. And `theme-contrast.test.ts` makes contrast regressions a failing test rather than a code review — which, in a mental-health app used at 3am in a dark room, is a safety property.
2. **The chat surface degrades correctly under every failure it can have.** `ChatAlerts.tsx:79-114` distinguishes offline-now from connection-restored, preserves the user's message in both, and states that "Ligar para o CVV não depende de internet." `ChatTranscriptFallback` renders a working `tel:` link *from inside a React error boundary*. This is the one place the "must work even if the AI is down" requirement was translated into pixels, not just architecture.
3. **`IconButton` + `Tooltip` solve the dense-table touch problem properly.** 32px box, 44px hit area via `before:-inset-1.5`. Tooltip reveals on hover, focus, *and* 450ms long-press, portals to `document.body` so an `overflow-hidden` card can't clip it, and omits itself from the a11y tree when its text already is the trigger's accessible name. Three failure modes, each solved in the primitive rather than patched per call site.
4. **`prefers-reduced-motion` is honored comprehensively.** `index.css:442-452` kills every animation and transition via universal selector, with a `.motion-essential` opt-in for indefinite indicators. JS-side motion gates itself too — `useTypewriter.ts:35-43` even re-checks on an OS-level toggle mid-animation. One gap only (`Skeleton.tsx:6`).
5. **Icon-button labeling is structurally enforced.** `IconButton.tsx:56` makes `label` a required prop and applies `aria-label` *after* the spread so a caller cannot override it. Zero unlabeled icon-only buttons across 27 `<button>` blocks.
6. **The onboarding is the product's emotional peak.** The typewriter subtitle that collapses to instant reveal under reduced motion, three numbered privacy cards with serif ordinals, and an AES-256 explainer one tap away rather than in fine print. `index.html:11-29` sets `data-theme` pre-paint, so a doctor opening at 3am gets no white flash into dark-adapted eyes.
7. **The manager panel's responsible-disclosure copy.** The AI card explains what it does before you generate one — "sem acesso a dados individuais de nenhum profissional" — and the NR-1 card explicitly refuses to claim certification.
8. **1556 tests pass across 124 files.** Zero failures.

---

## The two structural themes

**The "Sereno" serif is being quietly designed out.** `index.css:320-324` sets `h1,h2,h3 { font-serif }`, but the app's most frequently rendered heading — the shared `AppHeader` h1 — overrides it back to sans at 15px (`AppHeader.tsx:56`), and `SettingsRow.tsx:20` does the same. Inside the authenticated app a doctor sees serif in exactly three places: the check-in hero, the assessment question, and the score numeral. The direction is declared in the tokens and then un-chosen in the components.

**The path a user declines is designed better than the path they accept.** `CrisisDeclinePage` gets a full-bleed brand card, a 40px serif number, and a white high-contrast tappable call button. `CrisisAcceptPage` gets an insurance question and unclickable text. Whatever else gets fixed, fix that inversion.

---

## Notes on method

The bundled anti-pattern detector returned **0 findings across 257 files** — verified against a synthetic control file that it correctly flagged, so the zero is real. It found none of the issues above. That is worth knowing: this codebase is past the level where mechanical scanning helps.

No browser automation was available, so **no rendered-page evidence exists in this report** — every finding is from source reading plus computed contrast. The `index.html` detector pass also ran degraded (HTML parser modules unavailable, regex fallback), so its zero is an undercount, not a clean bill.
