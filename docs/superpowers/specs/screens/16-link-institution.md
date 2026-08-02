# 16 — Vincular ao hospital (institution linking)

> Added by `2026-08-02-multi-institution-data-partitioning-design.md`, same category as
> `screens/14-manager-login.md` and `screens/15-you.md` (a screen the initial `AGENTS.md` build
> plan didn't anticipate). Lets a médico optionally link their device to their hospital via an
> invite code, so their anonymous, aggregated self-assessment signals count toward the correct
> institution's manager dashboard. See `screens/15-you.md`'s "Extended by" note and
> `screens/04-home.md`'s note for the two entry points into this screen.

**Route / File:** `/you/link` · `src/presentation/pages/LinkInstitutionPage.tsx`

**Purpose:** Resolve a hospital-distributed invite code to an institution, collect a
free-text department once, and persist both — plus a fresh device-local anonymous id — entirely
on-device. This is deliberately **not** a login: no identity is created, nothing here is ever
associated server-side with a name, email, or any other PII. A médico who never opens this
screen loses nothing except being counted in any hospital's aggregate — self-assessment and chat
work exactly the same either way.

## Layout

Two sequential states in one component (`useState<"code" | "department">("code")`), no route
change between them — `PhoneShell centered`, no `nav` (a standalone/focused flow, same
convention as `screens/14-manager-login.md`'s `ManagerLoginPage`, not one of the four
persistent-nav destination screens).

**State 1 — code entry:**
1. **Header** — `BackButton label="Você"` → `/you`.
2. **Title** — `h1` "Vincular ao hospital".
3. **Subtitle** — `caption text-muted` "Digite o código do seu hospital para aparecer nos
   números do seu time."
4. **Code card** — `Card`, `mt-5`: labeled text input (`id="invite-code"`, label "Código do
   hospital", placeholder "Digite o código", `autoCapitalize="none" autoCorrect="off"
   spellCheck={false}` — the invite code is a case-sensitive column and this is the sole entry
   point to the whole feature, so mobile-keyboard autocapitalization must not be allowed to
   silently corrupt it). Inline `role="alert"` error below the input when the lookup fails.
5. **Submit** — `Button variant="primary"`, `mt-6`, "Continuar", `loading` bound to the lookup
   mutation's pending state, `disabled` while the code is empty.

**State 2 — department entry** (only reachable after a successful code lookup):
1. **Header** — `BackButton label="Voltar"` → back to state 1 (code entry), not to `/you`.
2. **Title** — `h1` "Qual seu setor?"
3. **Subtitle** — `caption text-muted` "Vinculando a {institution.name}." — the resolved
   institution's name from state 1, confirming to the médico they're linking the right hospital
   before committing.
4. **Department card** — `Card`, `mt-5`: labeled text input (`id="department"`, label "Setor",
   placeholder "Ex: UTI, Pronto-socorro").
5. **Submit** — `Button variant="primary"`, `mt-6`, "Concluir", `disabled` while the department
   is empty.

## Copy (PT-BR)
"Vincular ao hospital" · "Digite o código do seu hospital para aparecer nos números do seu
time." · "Código do hospital" · "Digite o código" · "Continuar" · "Código não encontrado." ·
"Não foi possível verificar agora. Tente novamente." · "Qual seu setor?" · "Vinculando a
{institution.name}." · "Setor" · "Ex: UTI, Pronto-socorro" · "Concluir".

## Data / logic
- State 1 submit calls `useLookupInstitution()` (a thin `useMutation` wrapper around
  `LookupInstitutionUseCase` → `InstitutionLinkPort` → `HttpInstitutionLinkAdapter` →
  `GET /institutions/by-code/:code`, no authentication). On success (`{ id, name }`), the
  resolved institution is held in local component state and the screen advances to state 2. On
  failure, `InstitutionNotFoundError` renders "Código não encontrado."; any other error renders
  "Não foi possível verificar agora. Tente novamente." — the screen stays on state 1 either way.
- State 2 submit calls `useInstitutionLinkStore.getState().link({ institutionId, institutionName,
  department })` directly (trimmed — see below) — no network call. `link()` generates a fresh
  `deviceSignalId` (`crypto.randomUUID()`), and persists
  `{ institutionId, institutionName, department, deviceSignalId }` to `localStorage` under
  `zelo.institution-link` (`apps/web/src/stores/institution-link.store.ts`). Then
  `navigate(routes.you)`.
- Both the code and the department are trimmed before use (`code.trim()` before the lookup
  mutation call; `department.trim()` before `link()`) — untrimmed input would either miss a
  valid invite code or fragment the manager dashboard's k-anonymity grouping key
  (`Signal`'s `[institutionId, department, weekStart]`) into near-duplicate rows that each fall
  below the visibility threshold.
- No fixed department picklist — free text, matching
  `2026-08-02-multi-institution-data-partitioning-design.md` §1's explicit non-goal (no
  per-institution org chart in this PoC).

## Interactions
- Back (state 1) → `/you`.
- Back (state 2) → state 1, code re-editable; the previously-resolved institution is discarded
  (a fresh lookup runs on the next "Continuar" tap).
- "Continuar" (valid code) → advances to state 2.
- "Continuar" (invalid/unknown code) → inline error, stays on state 1.
- "Concluir" → persists the link locally, then `navigate(routes.you)`, where the new "Vinculado
  a {institutionName}" card renders (`screens/15-you.md`).

## Acceptance criteria
- A valid code advances to the department step showing the correct institution name; an unknown
  code shows an inline error without advancing.
- "Continuar" is disabled until a code is entered; "Concluir" is disabled until a department is
  entered.
- Completing both steps persists `institutionId`/`institutionName`/`department`/`deviceSignalId`
  to `localStorage` and lands on `/you` showing the linked state.
- Never reachable without consent (`/you/link`'s route loader redirects to `/privacy` the same
  way `/you`/`/home` do).
- Backing out at either step never creates a partial/inconsistent link — the store is only ever
  written once, atomically, on "Concluir".
