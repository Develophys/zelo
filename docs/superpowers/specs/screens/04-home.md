# 04 — Home / hub

> **Note:** this doc predates several shipped changes to `HomePage.tsx` (a real history chart via
> `GetAssessmentHistoryUseCase`, the follow-up-prompt banner from
> `2026-07-19-followup-mechanism-design.md`, the manager link's "(demo)" framing since removed,
> and — most recently — a discoverability banner added by
> `2026-08-02-multi-institution-data-partitioning-design.md`: a `Card` shown only while
> `useInstitutionLinkStore`'s `institutionId` is `null`, with a "Vincular agora" CTA to
> `/you/link` — see `screens/16-link-institution.md`). Treat the `Layout`/`Data-logic` sections
> below as the original intent, not the current implementation; `HomePage.tsx` and
> `HomePage.test.tsx` are the source of truth for exact current behavior.

**Route / File:** `/home` · `src/presentation/pages/HomePage.tsx` (replaces current scaffold)

**Purpose:** Calm daily landing. One primary action (check-in), a glance at history, quick
routes to support, and the always-on anonymity marker.

## Layout
`PhoneShell` with `footer={<BottomNav active="home" .../>}`, body `pt-6`:
1. **Header row** — left: greeting stack (`caption text-muted-2` "Bom te ver por aqui" +
   `font-serif text-[25px] text-ink` "Olá."). Right: `PrivacyBadge variant="chip"` ("anônimo").
2. **Hero card** — `Card size="lg" tone="brand"`, `mt-5`:
   - Title `font-serif text-[21px]` "Como você está hoje?"
   - Sub `text-label` opacity 85% "Um check-in de 5 minutos, só para você."
   - White pill button "Fazer check-in" (`bg-white text-brand`), `mt-4`.
3. **History card** — `Card size="md"`, `mt-[14px]`:
   - Row: `body-strong` "Seu histórico" + mono caption "últimas 6 semanas".
   - Mini bar chart: 6 bars, `flex items-end gap-2 h-14`, bars `rounded-md`; most bars
     `bg-[#CDDBD4]`, one peak `bg-warn`, latest `bg-brand`. (Data placeholder until history API.)
4. **Two quick actions** — `flex gap-3 mt-[14px]`. Each a `Card`-styled button with an
   `IconBadge` + title:
   - "Conversar agora" (`MessageCircle`) → `/chat`
   - "Falar com um par" (`Users`) → `/peers`
5. **Manager demo link** — `Button variant="ghost"` underlined, `mt-4`, "Ver painel do gestor (demo)".

## Copy (PT-BR)
Greeting "Bom te ver por aqui" / "Olá." · Hero "Como você está hoje?" / "Um check-in de 5
minutos, só para você." / "Fazer check-in" · "Seu histórico" / "últimas 6 semanas" ·
"Conversar agora" · "Falar com um par" · "Ver painel do gestor (demo)".

## Data / logic
- History chart is placeholder data for now (no history endpoint yet) — mark with a
  `// TODO(history)` and keep values in the component. Do NOT fabricate a use-case.
- BottomNav `onNavigate`: home→`/home`, checkin→`/assessment`, chat→`/chat`, you→(no-op TODO).

## Interactions
- "Fazer check-in" & BottomNav Check-in → `routes.assessment`.
- Quick actions → chat / peers. Manager link → `/manager`.

## Acceptance criteria
- Single clear primary action (hero). PrivacyBadge always visible.
- BottomNav shows Início active.
- Chart renders 6 bars with exactly one warn peak + one brand (latest); no layout shift.
