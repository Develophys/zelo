# 14 — Manager login (access gate for the manager dashboard)

> Added after the original 13-screen build, alongside real data for `screens/13-manager.md` —
> see `2026-07-11-manager-login-simulated-dashboard-design.md` and `routing-and-state.md` §5
> for the full authentication model and why this screen exists at all (doctors never see an
> equivalent login screen, on purpose). Updated by
> `2026-08-01-manager-individual-accounts-design.md`, which replaced the original single
> shared access code with individual named manager accounts (name + password) — see that
> spec for the full rationale.

**Route / File:** `/manager/login` · `src/presentation/pages/ManagerLoginPage.tsx`

**Purpose:** Gate `ManagerDashboardPage` behind a real, server-enforced login: an individual
manager account (name + password), not a single shared institutional code (see
`2026-08-01-manager-individual-accounts-design.md` for why individual accounts were added,
and why this still doesn't imply multi-institution data partitioning — this PoC targets one
institution). This is the only screen in the app that asks for a credential; every other
screen is either consent-gated (doctors) or fully open.

## Layout
`PhoneShell centered`, `pt-[30px]`:
1. **Back** — "‹ Início" → `/home`.
2. **Title** — `h1` "Acesso do gestor".
3. **Subtitle** — `caption text-muted` "Entre com seu nome e senha de gestor."
4. **Form** — a `Card` containing:
   - Label "Nome" (`htmlFor="manager-name"`), text input (`id="manager-name"`), placeholder
     "Digite seu nome".
   - Label "Senha" (`htmlFor="manager-password"`), password input (`id="manager-password"`,
     `type="password"`), placeholder "Digite sua senha".
   - An inline error, only when present: `role="alert"`, `text-danger` — either "Nome ou senha
     incorretos." (wrong name and/or password) or "Não foi possível entrar agora. Tente
     novamente." (any other failure — network error, backend down, etc.).
5. **Submit** — `Button` "Entrar", `loading` while the request is in flight, `disabled` while
   either field is empty.

`centered` is the same responsive prop every other standalone/focused-flow screen uses
(`ConsentPage`, `PrivacyPage`, the assessment flow, the crisis screens) — at ≥768px/≥1024px it
constrains the body to a ~680px reading column and picks up the tablet/desktop type-scale
bump; below 768px the layout is unchanged single-column `PhoneShell` behavior. No `nav` prop —
this is a standalone auth gate, not one of the persistent-navigation destination screens.

## Copy (PT-BR)
"Acesso do gestor" · "Entre com seu nome e senha de gestor." · "Nome" · "Digite seu nome" ·
"Senha" · "Digite sua senha" · "Entrar" · "Nome ou senha incorretos." · "Não foi possível
entrar agora. Tente novamente."

## Data / logic
- `useManagerLogin()` (`apps/web/src/presentation/hooks/useManagerLogin.ts`) — a `useMutation`
  wrapping `apps/web/src/use-cases/login-manager.usecase.ts`, which calls
  `POST /manager/login` with `{ name, password }`.
- The backend looks up the `Manager` by `name`, then verifies `password` against the stored
  scrypt hash via `ManagerPasswordService` — always running the real hash-and-compare even
  when `name` doesn't match any account, so a failed login can't be timed to distinguish
  "unknown name" from "wrong password." Either failure throws
  `InvalidManagerCredentialsError` and the endpoint returns `401`; on success it returns an
  HMAC-signed opaque token + expiry (8h). The frontend maps a `401` specifically to
  `InvalidManagerCredentialsError` so the UI can show "Nome ou senha incorretos." instead of a
  generic failure message — any *other* error (network failure, `500`, etc.) falls back to the
  generic message.
- On success, the hook writes `{ token, expiresAt }` into `useManagerSessionStore`
  (`apps/web/src/stores/manager-session.store.ts`), persisted to **`sessionStorage`** (not
  `localStorage` — a manager session is meant to end when the tab closes), then the page
  navigates to `/manager`.
- This screen itself does **not** check whether a session already exists — the `/manager`
  route's loader is what redirects *to* this screen when needed (see
  `routing-and-state.md` §5). Visiting `/manager/login` directly while already logged in just
  re-shows the form; submitting again simply issues a new token.

## Interactions
- Back → `/home`.
- Submit with either field empty: button stays disabled, no request is sent.
- Submit with the correct name + password → `/manager`.
- Submit with an incorrect name and/or password → inline "Nome ou senha incorretos.", stays on
  this screen; both fields keep their values so the user doesn't need to retype everything
  (just fix whichever field was wrong).

## Acceptance criteria
- The submit button is disabled until both fields have non-whitespace content.
- A wrong name and/or password shows the specific "Nome ou senha incorretos." message, not the
  generic one, and does not navigate — and does so identically whether the name is unknown or
  the password is wrong (no way to distinguish the two from the UI or from response timing).
- A correct name + password navigates to `/manager` and the session persists across a page
  reload (verified via `sessionStorage`, not just in-memory state — a full browser reload, not
  just a React re-render, must keep the session).
- A fresh browser tab/context (no `sessionStorage` carried over) visiting `/manager` directly
  redirects back to this screen.
- No credential value is ever written to `localStorage`, only `sessionStorage`.
