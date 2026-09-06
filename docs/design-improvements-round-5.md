# Zelo — Design Improvements, Round 5

Fifth Impeccable `/critique` of `apps/web`, run against `main` at `54691fb`. Two isolated agents — a
design-director review and a deterministic detector + live-browser evidence pass — neither told what
the other found, and neither told what had changed since round 4.

Rounds 1 and 2 and their remediation: [design-improvements.md](./design-improvements.md).
Round 3: [design-improvements-round-3.md](./design-improvements-round-3.md).
Round 4: [design-improvements-round-4.md](./design-improvements-round-4.md).

**Design health: 24/40 (60% — Acceptable). Trend: 25 → 27 → 26 → 24 → 24.**

**Status:** Open — this file is the raw backlog from the round-5 critique, not yet triaged into
fixed/won't-fix. The flat score hides real movement: **P0 count went 3 → 0** since round 4 (all of
round 4's P0s and structural P1s were closed this session). What kept the total flat is the same
mechanism round 4 named — the trend tracks what's been *found*, not how much work has been done, and
this round opened new territory: the manager dashboard's actual chart legibility, the consent screen,
and the peer-partner surface this session gave a real header and nav to but not yet a reason to feel
alive.

Legend: ✅ fixed · ⬜ open · ❌ won't fix.

---

## Method note

Assessment A (design review) read `PRODUCT.md`, walked all three personas (médico onboarding →
home/assessment/chat/peers/settings; manager login → dashboard/admin managers+sectors+peers/
notifications/settings; peer partner login → inbox/settings) with real seeded credentials, and scored
Nielsen's 10 heuristics cold, before seeing any detector output.

Assessment B ran the static detector (`detect.mjs --json apps/web/src`, 433 files: **0 findings, exit
0**, verified against a positive control so the clean result isn't a no-op) and then injected the live
detection overlay into 14 real routes across both authenticated personas via Playwright, reading
`window.impeccableDetectAsync()` per route rather than only the console summary line.

The static scan being clean is real signal — the mechanical anti-patterns earlier rounds caught
(thick borders, `animate-bounce`, broken images, Google-Fonts CDN links) are gone. It is not evidence
of a clean *runtime*: the live overlay found things the static scan structurally cannot, most notably
`clipped-overflow-container` on three of five manager routes, naming `ManagerShell`'s own wrapper
divs — the exact element this session's scroll-lock fix touched (made the outer `overflow-hidden`
unconditional instead of `md:`-only, to stop the header riding away on scroll). That's flagged as P1
item 3 below and needs a direct look, not a dismissal as detector noise.

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Sector filter pills all render as "selected" by default — no visible off-state |
| 2 | Match System / Real World | 4 | Idiomatic PT-BR clinical voice throughout; MBI-HSS honestly gated as "em breve" |
| 3 | User Control and Freedom | 3 | Review-before-send, resumable drafts, honest revoke copy; no undo on admin delete |
| 4 | Consistency and Standards | 2 | Mobile trend chart prints %, desktop doesn't; peers deletable, managers aren't; médico's overflow nav is an unlabeled arrow, manager's identical control says "Mais" |
| 5 | Error Prevention | 2 | Delete confirm never names its target, reachable from two different delete paths |
| 6 | Recognition Rather Than Recall | 2 | Desktop trend chart has no printed values — comparing weeks is pure visual memory over a 4px spread |
| 7 | Flexibility and Efficiency | 2 | URL-shareable sector filter is good; no per-notification read, no date range, no peer availability toggle |
| 8 | Aesthetic and Minimalist Design | 3 | Coherent "Sereno" system in both themes; three near-empty screens; admin table columns misallocated |
| 9 | Error Recovery | 3 | Error copy names the actual consequence, not just the failure |
| 10 | Help and Documentation | 1 | Nothing ever defines "par anônimo," the peer countdown, or the dashboard's headline metric |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict

Genuinely authored, not template UI. The self-harm item on PHQ-9 shows the CVV 188 line regardless of
the answer given, specifically so its appearance never reads as a verdict on what was just selected.
"Apoio" is a permanent bottom-nav tab, not something surfaced only once the app decides you're in
crisis. The manager side speaks real Brazilian occupational-health language (NR-1, PGR) with an
explicit "não uma certificação de conformidade" disclaimer, and prints the k-anonymity rule on the
dashboard face. Where it slips into generic: all three personas' "Configurações" screens are the
literal same `AppearanceSettings` component, and the peer-partner surfaces still read like a scaffold
next to the depth of the médico flow.

## Overall Impression

The médico-facing crisis and assessment flow would not embarrass a clinical reviewer — it's the
strongest thing in the product. The score didn't move because, like round 4, this round found its
problems in territory the previous rounds hadn't opened: the manager dashboard's actual chart
legibility, the consent screen's checkbox-like decoration, and the peer-partner experience this
session just gave a real header and nav to but not yet a reason to feel like a place, not a waiting
room.

## What's Working

1. **Assessment review step** (`ScaleAssessmentPage.tsx:133-146`) — every answer editable before
   submit, "Nada foi enviado ainda" stated plainly. Converts nine irreversible taps into one
   reversible act for someone answering at 3am.
2. **Keyboard-vs-pointer discrimination on question cards** (`QuestionCard.tsx:79-81`) — arrow-keying
   through options doesn't auto-advance, specifically because the last item asks about self-harm.
3. **Error copy that names the consequence, not just the failure** — "Você não está na fila de
   espera," "Você não está recebendo pedidos agora" — consistently, across unrelated files.

---

## P1 — Major

1. ⬜ **Manager dashboard's trend chart is unreadable on desktop.** Bar heights measured live at
   22-26px inside a 56px well — a 4px spread hiding a 40%→46% rise in concerning signals. The mobile
   variant prints the percentage next to every bar; desktop doesn't.
   Files: `ManagerDashboardPage.tsx:285-330`, `presentation/lib/manager-trend-chart.ts`.
   Fix: print values on the desktop bars too, or scale to the data's actual range instead of 0-100%.
   Suggested command: `/impeccable layout` or `/impeccable clarify`.

2. ⬜ **Sector filter has no "off" state.** All five pills (`Todos` + 4 sectors) render identically
   filled by default — nothing distinguishes selected from unselected.
   File: `SectorPillPicker.tsx:4-9`.
   Fix: outline unselected pills, fill only the active one(s).
   Suggested command: `/impeccable clarify`.

3. ⬜ **Manager panel's overflow-hidden ancestors may clip dropdowns/popovers.** Live-browser evidence
   names `ManagerShell`'s own wrapper divs on 3 of 5 manager routes (`/manager`,
   `/manager/admin/managers`, `/manager/admin/peers`) — the exact element this session's scroll-lock
   fix changed from `md:`-conditional to unconditional `overflow-hidden`.
   Fix: manually verify `SectorMultiSelect`, `BottomSheetMenu`, and the notification badge popover
   don't clip against that ancestor at any breakpoint.
   Suggested command: `/impeccable audit`.

4. ⬜ **Destructive confirm dialog doesn't name its target.** "Excluir par?" gives no name, and is
   reachable from both a per-row trash icon and a bulk-selection trash with an active selection.
   File: `ManagerAdminPeersPage.tsx`.
   Fix: "Excluir Dra. Camila Rocha?" / "Excluir 3 pares?" — the name already exists in the icon's
   `aria-label`, just not in the visible dialog.
   Suggested command: `/impeccable harden`.

5. ⬜ **Peers screen's value proposition sits behind the gate it should open.** The "neither side
   sees the other's identity" reassurance only renders in the linked idle state, not before linking.
   File: `PeersPage.tsx:57-82`.
   Fix: move that line above the "Vincular ao hospital" CTA.
   Suggested command: `/impeccable onboard`.

## P2 — Minor

1. ⬜ **Home history chart has no empty state.** Always renders bars + a "Mais recente / Pico" legend
   for colors that never draw when there's no check-in data yet (the manager's equivalent has
   `TREND_EMPTY` copy; the médico's doesn't). File: `HistoryChartCard.tsx:56-90`.

2. ⬜ **Médico's overflow nav is an unlabeled arrow.** `ArrowUp` icon with only an `aria-label`,
   hiding Configurações/Administração/Par anônimo behind it; the manager's identical control is
   labeled "Mais". File: `BottomNav.tsx:56-69`.

3. ⬜ **Consent page's decorative checkmarks read as pre-ticked consent boxes.** `aria-hidden`
   bullets that every sighted user will read as already-checked, on the one LGPD-sensitive screen in
   the app. File: `ConsentPage.tsx:56-60`.

4. ⬜ **Mobile header logo tap target is 36×36** against the product's own stated ≥44×44 minimum.
   File: `AppHeader.tsx:35,37`.

5. ⬜ **Collapsed sidebar label token is 11px** (`--text-nav-rail`), visible in the 768-1024px window
   the manager dashboard itself targets. Files: `app/index.css:117`, `Sidebar.tsx:37`,
   `ManagerSidebar.tsx:52`.

6. ⬜ **Notifications have no dedup or per-item read.** 4 duplicate "Falha no envio do convite"
   entries for the same address; "Convite aceito" (good) and "Falha no envio" (bad) share the same
   amber warning pill tone. File: `ManagerNotificationsPage.tsx:77`.

7. ⬜ **Peer-partner inbox has no identity/greeting, availability toggle, history, or visible
   response countdown**, even after this session's redesign gave it a real header, loading skeleton,
   and connected/error states. File: `PeerPartnerInboxPage.tsx`.

8. ⬜ **Admin tables wrap emails mid-word at 1280px** while the Setores column sits empty — a
   column-sizing problem, not a content problem.

9. ⬜ **Chat composer nests as a card inside a card**, per the detector. Minor visual nesting.

10. ⬜ **`/assessment/result` visited with no state silently redirects** to `/assessment` with no
    explanation.

## P3 — Polish

1. ⬜ Managers can be edited but not deleted; peers can be deleted. No stated reason on screen either
   way.
2. ⬜ No self-service password change exists anywhere — the admin panel only offers
   "Redefinir senha de X" from the manager side.
3. ⬜ Manager dashboard's trend window is hardcoded and inconsistent between cards ("últimas 6
   semanas" vs "(4 semanas)"), with no date-range control.
4. ⬜ Chat action tray's collapse chevron (`ChatActionTray.tsx:34`) reads as a rendering glitch before
   its padded 44px hit area is discovered.
5. ⬜ "Falar com uma pessoa real" shortens to "Pessoa real" at the exact moment escalation matters
   most.
6. ⬜ Global `transition: width` fires on `<body>` across all 14 routes tested — likely broader than
   intended, worth scoping down.
7. ⬜ `layout-transition` flagged on `aside.hidden` is likely a detector false positive — the element
   is `display:none`, so an animated property on it has no visible effect.

---

## Persona Red Flags

**Jordan (first-timer)**: Splash → privacy → consent is genuinely good, then breaks twice fast. Home
shows an empty history chart with a legend for colors that never draw — reads as broken, not empty.
The consent screen's three green rounded checkmarks are decorative, but every sighted user will read
them as pre-ticked consent checkboxes, on the one screen where that reading is the worst possible one.

**Sam (accessibility-dependent)**: Better served than most apps — skip link, `role="status"`
announcements, full `aria-label` coverage on icon buttons. Three concrete gaps against the product's
own WCAG AA commitment: the 36×36 mobile logo tap target, the 11px collapsed-sidebar labels in exactly
the tablet window the manager dashboard targets, and no text-size or high-contrast control anywhere
despite four accent colors and two corner-radius options existing.

## Questions to Consider

- What if the manager dashboard withheld "46% sinais de burnout" — a metric PRODUCT.md itself lists as
  undecided — until it's actually defined, and led with response rate and the k-anonymity guarantee
  instead?
- What if the peer-partner inbox's primary object were an availability switch ("Disponível até
  06:00") instead of a passive connected-status card — giving the volunteer something to decide
  instead of something to wait for?
- What if the médico's home screen led with the last check-in's result instead of an empty chart,
  which only earns its place at check-in #3?
