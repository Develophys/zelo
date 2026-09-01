# Zelo — Design Improvements, Round 4

Fourth Impeccable `/critique` of `apps/web`, run against `main` at `0cc9618`. Two isolated agents — a
design-director review and a deterministic evidence pass — neither told what had changed.

Rounds 1 and 2 and their remediation: [design-improvements.md](./design-improvements.md).
Round 3: [design-improvements-round-3.md](./design-improvements-round-3.md).

**Design health: 24/40 (60% — Acceptable). Trend: 25 → 27 → 26 → 24.**

**Status:** nothing here is started. All round-3 items verified still fixed; no regressions found.

---

## Why the score fell again

Same mechanism round 3 named, and it is worth restating because it will keep happening: **the trend
tracks what has been *found*, not how much work has been done.** Round 4 was the first to open the
peer-support flow, the manager admin CRUD screens, the notification surface, and the session-expiry
paths. Every P0 below has been present since long before round 1. Rounds 1–3 never looked there.

The doctor-facing happy path is now genuinely strong. What this round found is that the app's
**failure paths outside `ChatPage` are largely undesigned**, and that the flows added most recently —
peers, admin CRUD — never received the care the assessment and result screens did.

---

## Method note — the detector explanation, corrected again

Round 3 said `.tsx` routes to a regex engine whose CSS patterns are kebab-case only. **That was the
right conclusion from the wrong mechanism.** Reading the engine source this round:

- 59 rules are registered. `RULE_ENGINE_SUPPORT` declares **no per-engine coverage at all** — all four
  engine maps are empty.
- The regex engine implements **22 matchers covering 9 rule ids**: `side-tab`,
  `border-accent-on-rounded`, `overused-font`, `gradient-text`, `gray-on-color`, `ai-color-palette`,
  `bounce-easing`, `layout-transition`, `broken-image`.
- Six rules are page-analyzer-only and gated off `.tsx` **twice** — `PAGE_ANALYZER_EXTS` excludes
  `.tsx`, and `isFullPage()` requires a doctype.
- **43 of 59 rules have no regex implementation whatsoever**, including every rule that matters here:
  `low-contrast`, `cramped-padding`, `tiny-text`, `undersized-ui-text`, `skipped-heading`,
  `heading-rhythm`, `line-length`, `tight-leading`, `text-overflow`, `nested-cards`,
  `design-system-*`. Those need computed style.

Running all 22 matchers by hand over the 182 `.tsx` files: **7 raw hits, all rejected by their own
predicates.** A control file with deliberate defects fired correctly, so the walker does reach `.tsx`.

**A clean detector run here proves: no thick side borders, no `animate-bounce`, no Google-Fonts CDN
link, no empty `<img src>`. It proves nothing about contrast, spacing, type scale, touch targets,
heading order or focus.** The repo's own executable guards remain the real safety net — see item 10,
which audits those guards.

---

## P0 — Safety-critical

### 1. The crisis line is unreachable from the doctor's ordinary app, including item 9

`NAV_TABS` (`nav-tabs.ts:20`) is Início / Check-in / Conversar / Você. There is **no** path to
`routes.crisis` or a `tel:188` from `HomePage`, `BottomNav`, `Sidebar`, `YouPage`, `SettingsPage`,
`AssessmentSelectPage`, or **any of the nine assessment question screens**.

Every `CrisisCallLink` call site is conditional on already being in trouble: `AssessmentResultPage`
(gated on `riskSignal || bandNeedsSupport`), the three `ChatPage` surfaces, `PeersPage` (error and
no-peer states only), `BandSupportCard`, `FallbackPage`, and the three crisis pages themselves.

**Why it matters.** A doctor who opens Zelo *because* they are in crisis — the exact use PRODUCT.md
principle 2 is written for — has to complete a nine-item instrument and score badly enough, or start
an AI chat and hope its classifier fires, or start a peer search and hope it fails. And the one screen
where they explicitly declare suicidal ideation is the screen with the fewest exits.

**Fix.**

1. A persistent, quiet crisis affordance in the doctor's shell — a fifth `BottomNav` slot or a text
   link in `AppHeader` beside the privacy badge. Quiet, not alarming: the treatment `PeerFooter`
   already uses.
2. In `ScaleAssessmentPage`, when the current item is the PHQ-9 risk item, render one line plus
   `CrisisCallLink` beneath the options — **ungated on the answer.** Gating on a non-zero answer
   makes its appearance a judgment.

**Note:** `crisis-call-reachability.test.tsx` guards that four named screens each render
`href="tel:188"`. It cannot catch this, because the defect is the screens that are *not* in its array.

### 2. A dropped peer socket is completely silent on the doctor's side

`usePeerRequest.ts:49`:

```ts
socket.on("disconnect", () => {
  setState((current) => (current === "matched" ? current : "error"));
});
```

Round 3 correctly stopped `disconnect` from clobbering a *deliberately ended* conversation. It left
transport loss with no representation at all. The composer stays live, and `sendMessage` (`:65`)
appends optimistically regardless of delivery. `usePeerPartnerConnection.ts:46` handles the identical
event as `"error"` — the two sides are now inconsistent.

**Why it matters.** A doctor in distress types the hardest thing they have said all week, watches it
appear in the transcript, and waits. Nobody received it. That is materially worse than the anonymous
chat never existing.

**This is the fourth instance of the mirrored-fix pattern** (see the closing section): each time, the
side left broken is the person in distress.

**Fix.** `peer_left` already carries "the other person ended it". Let `disconnect` mean what it means:
while `matched`, enter a `connection_lost` state that disables the composer and says so, with a retry.
Consider socket.io ack callbacks so `sendMessage` only appends on confirmation.

### 3. The manager edit dialog rebuilds sector access from names and can silently erase it

`ManagerAdminManagersPage.tsx:200`:

```ts
setEditSectorIds(sectorList.filter((s) => manager.sectorNames.includes(s.name)).map((s) => s.id));
```

`sectorList` is `sectors.data ?? []` (`:153`). If that query is loading, has failed, or the institution
has duplicate sector names, the dialog opens showing **zero sectors** — and `handleSaveEdit` (`:221`)
PATCHes `sectorIds` as a **full replacement**. There is no `isLoading` guard on the modal body and no
`isError` branch; `SectorPillPicker` falls through to its empty state, telling an admin their hospital
has no sectors when the fetch merely failed.

That is the exact confusion round 3's item 4 fixed in `useLinkInstitutionFlow`, with the explicit
comment *"'your hospital has not registered its sectors' and 'we could not reach the server' are
different facts"* — not carried across.

**Why it matters.** An admin who opens the dialog during a slow fetch, ticks the one sector they came
to add, and saves has revoked that manager's access to every other sector they oversaw — no warning,
no diff, no undo. In a k-anonymized product, sector assignment **is** the access-control boundary.

**Fix.** Carry `sectorIds` on `ManagerSummary` so the client never reconstructs identity from a display
name. Gate the modal body on `sectors.isSuccess`. Give `SectorPillPicker` a distinct error state.

---

## P1 — Serious

### 4. Every admin write can fail with no feedback whatsoever

`App.tsx:10` is a bare `new QueryClient()` — no `MutationCache`, no default `onError`. Across
`src/presentation`, **2 of 18 `.mutate()` call sites** handle errors: the optimistic rollback in
`useManagerNotifications.ts:73`, and the second half of the two-step create in
`ManagerAdminSectorsPage.tsx:215`. Everything else passes `onSuccess` only.

An admin adds a manager with an email that already exists. The spinner stops. The modal stays open
with the fields filled. Nothing else happens. The rational response is to press it again.

**Fix.** One `MutationCache({ onError })` on the `QueryClient` mapping to `toast.error`, with
per-mutation overrides where specific copy already exists (`updateConflictMessage` is already used by
`useBulkStatusUpdate`).

### 5. Session expiry is unhandled on the admin pages and unexplained everywhere

`ManagerDashboardPage:195`, `ManagerInsightHistoryPage:191` and `ManagerNotificationsPage:23` each
independently handle `UnauthorizedManagerError`. `ManagerAdminManagersPage`, `ManagerAdminSectorsPage`
and `ManagerAdminPeersPage` do not — a 401 there renders `DataTableError` with **a retry that can never
succeed**, while every write fails silently (item 4). The three that do handle it redirect with no
state, and `ManagerLoginPage` has no expiry message and no password recovery.

The session lives in `sessionStorage`, so closing the tab ends it. A coordinator opening the panel the
next morning gets a bare login form and no indication that the fix is "email your hospital's admin".

**Fix.** Hoist the 401 effect into `ManagerShell` — it is a layout route wrapping all six pages, so the
guard is declared once instead of drifting three ways. Pass `{ state: { reason: 'expired' } }` and say
so on the login screen. Add a "Esqueci minha senha" affordance even if it only explains who to contact.

### 6. Per-screen explanatory copy is truncated out of existence on a phone

`AppHeader.tsx:73` renders the subtitle as a single `truncate`d line of
`font-mono text-mono-data text-brand`, with `title={subtitle}` as the only overflow escape — a hover
tooltip, on a phone. At 375px, after `px-4`, a `gap-3` and the right-hand group, the title column gets
roughly 185px, about 25 characters at 12px mono.

- `/peers` — *"Médicos treinados para ouvir. Nem você nem seu par veem a identidade um do outro."*
  renders as **"Médicos treinados para ou…"**. This is the **only** place the app says who is on the
  other end.
- `/assessment` — *"Escolha uma escala validada. Leva cerca de 5 minutos."* becomes **"Escolha uma
  escala valida…"**. The five-minute expectation is the single most important thing to tell an
  exhausted person before a nine-item instrument, and `AssessmentSelectPage` never repeats it.

PRODUCT.md says this copy is normative. It ships, and on the primary device the trust-building half is
unreadable.

**Fix.** `line-clamp-2` and a real body treatment (`text-caption text-muted`, not brand-coloured mono —
the mono/brand styling reads as a system annotation, and these sentences are reassurance). Move the
peers explanation into `PeersPage`'s idle state, where the decision is actually made.

---

## P2

### 7. Nine answers live only in React state, under an auto-updating service worker

`ScaleAssessmentPage.tsx:21` holds `answers` and `questionIndex` in `useState`, persisted nowhere,
while `vite.config.ts:27` sets `registerType: "autoUpdate"`. A phone call, a PWA evicted under memory
pressure, an accidental refresh, or a deploy landing mid-session loses nine answers **including item
9**. The realistic response is not to start over.

Round 3 fixed "a result cannot be reopened" and reasoned carefully about session scope. The
*in-progress* instrument — strictly more valuable, because it cannot be recovered from IndexedDB — got
nothing.

**Fix.** Reuse `lib/last-result.ts`'s wrapped-sessionStorage pattern: write on each answer, restore on
mount, clear on submit. Same try/catch, same graceful degradation.

### 8. New managers default to the most privileged role

`openCreate` (`ManagerAdminManagersPage.tsx:189`) sets `HOSPITAL_ADMIN`. `editRole` defaults to
`SECTOR_MANAGER` (`:142`) — the two disagree, which is its own tell that neither was chosen. The radio
labels are *"Gestor do hospital"* / *"Gestor de setor"* with no description of what either can see.

An admin onboarding a dozen ward leads on a Friday accepts the default, and every one of them gets
hospital-wide aggregate access plus the ability to create more admins.

**Fix.** Default to `SECTOR_MANAGER`. One line under each radio: *"Vê os indicadores de todos os
setores e administra o acesso"* / *"Vê apenas os setores atribuídos"*.

### 9. `ScoreDial`'s denominator is one browser setting away from failing contrast

`ScoreDial.tsx:51` renders `/{max}` at `text-[1.5rem]` with `text-band-*/75`. Measured on `surface`,
identical across all four accents:

| Band | light solid | light @ /75 | dark @ /75 |
|---|---|---|---|
| minimal | 6.20:1 | **3.58:1** | 5.84:1 |
| mild | 6.68:1 | **3.75:1** | 5.78:1 |
| moderate | 5.91:1 | **3.50:1** | 5.14:1 |
| high | 6.09:1 | **3.64:1** | 4.84:1 |
| severe | 8.07:1 | **4.50:1** | **4.43:1** |

1.5rem = 24px = 18pt = WCAG large text, threshold 3:1 — so it **passes as shipped**. But the whole
point of the rem conversion was to honour a browser font-size preference, and **at any root size below
16px this stops being large text and four of five bands fail 4.5:1 in the light theme.** No guard
covers it.

### 10. Guard gaps found by auditing the guards themselves

None are dead — every file walk resolves and every regex matches live code — but several are narrower
than their names:

- **`type-scale.test.ts`** forbids `text-[Npx]` but **not bracketed `rem`**. Three live bypasses:
  `ScoreDial.tsx:51`, `SidebarHeader.tsx:31`, `PrivacyPage.tsx:24`. It also walks `src/presentation`
  only, so `src/app/*.tsx` is unguarded, and it says nothing about the **14 arbitrary-px spacing
  values** (`TextField.tsx:4`, `Card.tsx:13`, `message-bubble.ts:8`, the `ChatAlerts` trio,
  `Modal.tsx:28-30`, and others).
- **`focus-visible.test.ts`** only catches `outline-none` *without* a ring. **It never requires a
  control to have a focus treatment at all** — which is why four admin elements fall back to the UA
  default outline undetected: `ManagerAdminManagersPage.tsx:339`, `ManagerAdminPeersPage.tsx:247`,
  `ManagerAdminSectorsPage.tsx:330` and `:74`.
- **`theme-contrast.test.ts`** parses literal hex from `index.css` and **cannot see any pairing made in
  TSX**. It hardcodes one alpha case and misses the other twelve.
- **`token-pairing.test.ts`** guards exactly one anti-pair.
- **The axe sweep runs under jsdom**, so axe-core's `color-contrast` and `target-size` rules cannot
  execute. **It is not evidence for contrast or touch targets**, though it is easy to read it as such.
- **`Button.test.tsx`'s padding guard** covers `Button` only; nothing stops any of the 27 raw
  `<button>` elements from having arbitrary geometry.

### 11. Forms carry no programmatic validation state

Of 32 fields: **0 use `required`, 0 use `aria-invalid`, and exactly 1 uses `aria-describedby`**
(`ChatComposer.tsx:146`). Errors are announced by 30 sibling `<p role="alert">` nodes but never
associated to the field, so a screen-reader user tabbing back to an errored input hears nothing.
Validation is enforced only by disabling submit.

---

## P3 — Polish

- **The mobile manager card** (`ManagerAdminManagersPage.tsx:339`) is a `<button>` toggling selection
  with **no `aria-pressed`**, conveying state by colour alone (`border-brand bg-brand/5`). The axe
  sweep covers the route but with zero rows, so it never scans the card.
- **No route-level code splitting.** Zero `React.lazy`; all ~25 pages ship in one **659 kB / 190 kB
  gzip** chunk, over Vite's warning threshold. (jspdf/html2canvas, ~770 kB, *are* correctly
  dynamic-imported — that part is done right.)
- **No per-route document title.** `<title>Zelo</title>` is static and there are zero `document.title`
  writes, so every route reads "Zelo" in tab, history and screen-reader page announcement.
- **`BottomNav.tsx:48`** uses `pb-6` with no `env(safe-area-inset-bottom)`; `Modal.tsx:128` uses the
  inset correctly. The nav is the one that ships on every screen.
- **`BottomNav.tsx:86`** declares `role="menu"`/`role="menuitem"` with no roving tabindex or arrow-key
  handling. A menu role that does not behave like one is worse than no role.
- **50 of 66 lucide icons carry no `aria-hidden`** (16 do). lucide-react v0.460.0 emits neither
  `aria-hidden` nor `role` by default. Low impact for unnamed SVGs; the inconsistency is the finding.
- **`Modal.tsx:52`** focuses the close button on open, so a keyboard user entering "Adicionar gestor"
  starts on the ✕ rather than the name field.
- **`DataTableToolbar.tsx:43`** replaces the search field with bulk actions at **every** breakpoint. At
  1440px both fit twice over; a phone constraint is being applied to a desktop tool.
- **`PeerChatRoom.tsx:92`** — "Sair da conversa" is a one-tap unconfirmed outline button that wipes the
  transcript and makes the peer unreachable forever, in the same product where "Revogar consentimento"
  gets a two-step confirm with managed focus. One of those is reversible; the other is not.
- **`InstitutionLinkCard.tsx:79`** — "Desvincular", one tap, no confirm.
- **`CrisisAcceptPage.tsx:101`** — *"Quer que **eu** te indique…"* is the only first-person voice in the
  product, on its highest-stakes screen.
- **`CrisisAcceptPage`** has no exit until the SUS/private question is answered; `CrisisDeclinePage`
  has an unconditional "Voltar ao início". The higher-distress branch has fewer ways out.
- **`ConsentPage.tsx:32`** wraps `grant()` in try/catch for blocked storage;
  `RevokeConsentSection.tsx:27` does not wrap `revoke()`.
- **Manifest `theme_color`** (`vite.config.ts:35`) is the light value only; `index.html` corrects the
  meta tag at runtime, but the installed PWA's system chrome stays light in dark mode.
- **`public/` carries roughly 2.8MB of GIFs**, some apparently unused duplicates (`zelo_ani_*_1.gif`).
  Not precached, but shipped in the deploy.
- **The doctor's `Sidebar` at 768–1023px** shows 10px (`--text-nav-rail`) labels under 22px icons.
- **Peer volunteer notification.** `PeerPartnerInboxPage` gives a 30-second accept window with no
  sound, no Notification API, no title flash and no vibration. The whole "reach a human" promise rests
  on the volunteer staring at a foreground browser tab.

---

## Product / legal decisions, not code fixes

These need a human decision and are recorded, not scheduled.

- **`ConsentPage.tsx:12`** renders three statements with pre-affirmed green checks behind one
  "Aceitar e entrar". Row 2 — *"Autorizo o uso anônimo e agregado dos meus sinais"* — is a distinct
  processing authorization bundled with two informational acknowledgments, and is non-declinable.
  Under LGPD art. 8 §1 / art. 9 that is the pattern the law is written against.
- **No privacy policy, retention statement, controller identity or DPO contact anywhere in the app.**
  `PrivacyPage` is three claim cards. This is a product whose entire pitch to a Brazilian hospital is
  LGPD-grade anonymity.
- **The accent picker on the doctor's Settings** — carried over from round 3, still open.
  `index.css:243` states that changing the brand colour "is not what this preference is for", then
  ships four brand colours to the audience for whom sage green *is* the promise. Note the catch: prefs
  apply app-wide from the root, so hiding the picker without scoping the effect would strand a doctor
  who already picked one.
- **`/peers` is consent-gated but not authenticated** — carried over from round 3, still open.
- **The manager KPI row** has no denominator, no prior-period comparison and no definition of
  "sinais de burnout na equipe". PRODUCT.md lists that metric as an open question not to be resolved
  unilaterally, so the *display* gap is downstream of a product decision.

---

## Dependencies

34 advisories reach `apps/web` — **2 critical, 21 high, 11 moderate**.

- **Runtime graph (only two):** `react-router@^8.2` (HIGH, RSC-mode CSRF, fix ≥8.3.0) and `dompurify`.
- **Direct dev:** `vitest@2.1.9` (CRITICAL, fix ≥3.2.6), `vite@^5.4` (HIGH plus 2 moderate, fix ≥6.4.3).
- **All nine `tar` advisories** trace to `@capacitor/assets@3.0.5` pinning `@capacitor/cli@5.7.8`
  beside the app's own `@capacitor/cli@8.5.0`. Removing or updating that one dev dependency clears them.

---

## What is genuinely strong

- **The result screen's information order**, and the recorded reasoning behind it: reassurance above
  the number, one full-weight action, a heading provably identical at 24/27 and 2/27 so a weekly user
  cannot read the tone as a spoiler.
- **`ChatPage` is designed for the network these users actually have** — a transcript-scoped
  `ErrorBoundary` with focus restored on recovery, a `crisisFallback` that renders CVV when the AI
  provider is down, an offline alert, and a `role="status"` distinguishing "Escrevendo…" from
  "Resposta interrompida". It is the only surface in the app with real failure design.
- **The dashboard refuses to render `0%`** on a failed load, and says so.
- **Mechanically the surface is in good shape:** no touch target under 44px, no skipped heading levels,
  exactly one `<h1>` per route, `lang="pt-BR"`, both `<img>`s correctly handled, only two hardcoded hex
  outside the token layer (both legitimate theme-color values), and `prefers-reduced-motion` **fully
  covered** — the 56 transitions a naive grep flags are all swept by `index.css:466`.
- **1771 tests pass, `tsc` clean, build clean.**

---

## The standing pattern, now at four instances

Round 3 named it: **a fix gets applied to one side of a mirrored pair.**

1. `ManagerSidebar` fixed at 768px, `Sidebar` left.
2. `usePeerPartnerConnection` error state added, `usePeerRequest` left (**and it is P0 #2 above**).
3. The 401 guard on 3 of 6 manager pages.
4. `onError` on 2 of 18 mutation call sites.

Naming it in a retrospective has not stopped it. Each of the last two has a structural fix available —
a layout route (`ManagerShell`) and a client-level default (`MutationCache`) — that makes the
guarantee once instead of per call site. That is the shape the remaining ones should take too.
