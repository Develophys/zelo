# 15 — Você (consent status & revoke)

> Added after the original 13-screen build, same category as `screens/14-manager-login.md`
> (a screen the initial `AGENTS.md` build plan didn't anticipate). This screen exists to close
> a gap that was already documented but never built: `routing-and-state.md` §2 has always noted
> that `useConsentStore.revoke()` "is surfaced later in a Você/Profile screen," and
> `ConsentPage.tsx`'s own copy already promises the doctor "Você pode revogar quando quiser."
> `BottomNav`'s fourth tab (`id: "you"`, label "Você") has rendered since Phase 2 of the design
> system but has been wired to a no-op in `HomePage.handleNavigate` — this screen is what it
> should have navigated to all along.
>
> **Extended by `2026-08-02-multi-institution-data-partitioning-design.md`:** this screen gained
> a second Card, between the consent-status card and the "Revogar não apaga..." explanation card
> (§Layout step 4.5 below), showing institution-link status and the entry point into
> `/you/link` (see `screens/16-link-institution.md`). The consent-revoke flow described below is
> otherwise unchanged.

**Route / File:** `/you` · `src/presentation/pages/YouPage.tsx`

**Purpose:** Give the doctor a place to see that their consent is active and to revoke it,
fulfilling the promise made on `ConsentPage` and in `PrivacyPage`'s "Você no controle" claim.
This is deliberately **not** a general "profile" or "settings" screen — Zelo has no accounts, no
identity, and nothing else per-user to configure (see `routing-and-state.md` §5: doctors never
log in). The only thing this screen manages is the one piece of state a doctor actually
controls: whether they've consented.

## Layout
`PhoneShell`, `pt-[30px]`:
1. **Header row** — `BackButton label="Início"` → `/home` (left), `PrivacyBadge variant="chip"`
   (right) — same header pattern as `screens/11-chat.md` / `screens/12-peers.md`.
2. **Title** — `h1` "Você".
3. **Subtitle** — `caption text-muted` "Seu consentimento e sua privacidade."
4. **Status card** — `Card size="md"`, `mt-5`:
   - Row: a small `Check`-in-circle icon (`IconBadge icon={Check} tone="brand"`) + text stack:
     - `body-strong text-ink` "Consentimento ativo"
     - `text-caption text-muted` "Desde {data formatada}" — date from `consentedAt`, formatted
       with `new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(consentedAt))`
       (e.g. "12 de julho de 2026"). If `consentedAt` is somehow null on this screen (shouldn't
       happen — see loader below), omit the "Desde" line entirely rather than showing "Invalid
       Date".
4.5. **Institution-link card** — `Card size="md"`, `mt-3.5`, between the status card and the
   explanation card: two mutually-exclusive states read from `useInstitutionLinkStore`.
   - **Linked** (`institutionName !== null`): `IconBadge icon={Building2} tone="neutral"` + text
     stack ("Vinculado a {institutionName}" / `department` below it) on the left, `Button
     variant="outline"` "Desvincular" on the right — a single tap, no confirm step (unlike
     consent revoke below: unlinking has no consequence, since nothing identifiable was ever
     sent server-side and relinking is instant — see
     `2026-08-02-multi-institution-data-partitioning-design.md` §4).
   - **Not linked** (`institutionName === null`): explanatory text "Ainda não vinculado a nenhum
     hospital." + `Button variant="outline"` "Vincular a um hospital" → `navigate(routes.linkInstitution)`.
5. **Explanation card** — `Card size="md"`, `mt-3.5`: reuses the three consent claims already
   promised on `ConsentPage`, condensed to reassure the doctor what revoking does and doesn't
   affect:
   - `text-label text-ink-2` "Revogar não apaga o histórico anônimo já enviado — os dados
     agregados não podem ser associados a você. Mas você deixa de ter acesso ao check-in, ao
     chat e ao histórico até consentir de novo."
6. **Revoke control**, `mt-[14px]` — two states, both rendered from one `useState<"idle" |
   "confirming">("idle")` in the component:
   - **`idle`**: `Button variant="danger"` full width, "Revogar consentimento".
   - **`confirming`**: a `Card tone="brand-tint"` containing:
     - `text-label text-ink-2` "Tem certeza? Você vai sair da área autenticada e precisará
       aceitar o consentimento novamente para voltar."
     - Two buttons side by side (`flex gap-3 mt-3`): `Button variant="outline"` "Cancelar"
       (→ back to `idle`) and `Button variant="danger"` "Sim, revogar" (→ calls
       `useConsentStore.getState().revoke()` then `navigate(routes.splash, { replace: true })`).

## Copy (PT-BR)
"Você" · "Seu consentimento e sua privacidade." · "Consentimento ativo" · "Desde {data}" ·
"Revogar não apaga o histórico anônimo já enviado — os dados agregados não podem ser associados
a você. Mas você deixa de ter acesso ao check-in, ao chat e ao histórico até consentir de novo."
· "Revogar consentimento" · "Tem certeza? Você vai sair da área autenticada e precisará aceitar
o consentimento novamente para voltar." · "Cancelar" · "Sim, revogar".

## Data / logic
- Reads `hasConsented` / `consentedAt` directly from `useConsentStore` (no new use-case, no new
  port — this is presentation-layer only, same constraint `AGENTS.md` sets for the original 13
  screens).
- Reads `institutionName` / `department` / `unlink` directly from `useInstitutionLinkStore`
  (`apps/web/src/stores/institution-link.store.ts`) — same presentation-layer-only pattern.
  `unlink()` clears the store's four fields (including `deviceSignalId`); there is nothing to
  call server-side, since nothing identifiable was ever transmitted while linked.
- Calls the store's existing `revoke()` action (`apps/web/src/stores/consent.store.ts:8`,
  already implemented and unit-tested in `consent.store.test.ts` — this screen is its first
  caller).
- No backend call. Consent has never been server-side state (see `routing-and-state.md` §2:
  "Do not store anything identifying here. Consent is a boolean + timestamp only," kept entirely
  in `localStorage`), so there is nothing to revoke remotely.
- Route loader (in `router.tsx`, mirroring `/home`'s loader): redirect to `/privacy` if
  `!useConsentStore.getState().hasConsented` — a doctor who has never consented has nothing to
  revoke and shouldn't see this screen.

## Interactions
- Back → `/home`.
- "Revogar consentimento" → switches this screen to the `confirming` state in place (no
  navigation yet, no modal — an inline two-step confirm, consistent with there being no
  destructive-confirm primitive yet in `ui-primitives.md`).
- "Cancelar" (from `confirming`) → back to `idle`. No state changed.
- "Sim, revogar" → `useConsentStore.getState().revoke()`, then `navigate(routes.splash, {
  replace: true })`. Landing on `/` with `hasConsented` now `false` renders `SplashPage` as a
  cold start (its loader only redirects to `/home` when consented), matching the exact flow a
  brand-new doctor sees.
- BottomNav is **not** rendered on this screen — same convention as Chat/Peers/Assessment
  (`BottomNav` only appears on `HomePage`; every other authenticated screen uses `BackButton` to
  return to Home, per `screens/00-overview.md` global conventions).

## Acceptance criteria
- Visiting `/you` while consented shows "Consentimento ativo" and the formatted `consentedAt`
  date.
- Visiting `/you` directly without ever consenting redirects to `/privacy` (loader), same as
  `/home` today.
- Tapping "Revogar consentimento" does not navigate or clear state — it only reveals the
  confirm card.
- Tapping "Cancelar" returns to the idle state with consent still active.
- Tapping "Sim, revogar" clears `hasConsented`/`consentedAt` (verify via `localStorage`, not just
  in-memory state — a full reload afterward must land back on Splash, not Home) and navigates to
  `/`.
- The `Você` tab on `HomePage`'s `BottomNav` navigates here instead of doing nothing.
- When linked, shows "Vinculado a {institutionName}" and the department; "Desvincular" clears
  the link with a single tap (no confirm step) and the "Vincular a um hospital" entry point
  reappears immediately.
- When not linked, "Vincular a um hospital" navigates to `/you/link`
  (`screens/16-link-institution.md`); the two states never render simultaneously.
- axe-core clean, consistent with every other screen in `a11y.test.tsx`.
