# HttpOnly Cookie Session Migration (Manager, PeerPartner, Admin)

**Date:** 2026-09-14

## Problem

All three of Zelo's authenticated roles — Manager, PeerPartner, SuperAdmin/admin — use
an identical session pattern: an HMAC-signed opaque token, issued in the login response
body, held client-side in `sessionStorage` (`apps/web/src/stores/{manager,peer-partner,
admin}-session.store.ts`), and sent back as `Authorization: Bearer <token>`. This was
accepted as deliberate debt for the hackathon (`docs/superpowers/specs/technical-
debt.md`, TD-001, Manager only): if an XSS vector is ever introduced, injected JS can
read `sessionStorage` and exfiltrate the token, impersonating that user until it expires
(8h).

The admin account is now real (a genuine SuperAdmin created for institution management
and app-level config, not a demo seed), which raises the blast radius of that specific
token being stolen. This migration closes the gap for all three roles at once: move the
session token into an `HttpOnly; Secure; SameSite=Lax` cookie, invisible to JavaScript
entirely, with the server as the only thing that ever reads it.

## Approach

### 1. Same-site cookies via dedicated API subdomains

`zelohealth.app`/`dev.zelohealth.app` (Vercel) and `zelo-api.fly.dev`/`zelo-api-
dev.fly.dev` (Fly) are different registrable domains today — a cookie set by the API
would be inherently cross-site, forcing `SameSite=None` and a CSRF-token system built
from scratch (nothing like that exists in the repo currently).

Instead, attach a custom domain to each Fly API app, sharing `zelohealth.app`'s
registrable domain with the frontend:

- `api.zelohealth.app` → Fly app `zelo-api` (prod)
- `api-dev.zelohealth.app` → Fly app `zelo-api-dev` (dev)

Provisioned the same way as `dev.zelohealth.app` was: `fly certs add <domain> --app
<app>`, then a DNS record at Cloudflare (Fly will print the exact A/AAAA or CNAME target
once `certs add` runs). Both API domains end up same-site with both frontend domains
(all four share the `zelohealth.app` registrable domain), so `SameSite=Lax` is valid
everywhere, including between the dev frontend and dev API.

`VITE_API_BASE_URL` changes to `https://api.zelohealth.app` (prod Vercel project) /
`https://api-dev.zelohealth.app` (dev Vercel project) once each domain's cert is live.
`CORS_ALLOWED_ORIGINS` is untouched (it already lists frontend origins).

### 2. Backend: cookie issuance, guards, logout, `/me`

- Add `cookie-parser` (`apps/api/package.json`), wired in `main.ts`.
- `app.enableCors({ origin: resolveAllowedOrigins(), credentials: true })` — required for
  the browser to send/receive the cookie cross-subdomain; `credentials: true` also means
  `origin` must stay an explicit list, never `*` (already the case).
- Each role's login use-case/controller (`manager.controller.ts`, `peer-
  partner.controller.ts`, `admin.controller.ts`) stops returning `{token, expiresAt}` in
  the body. Instead it calls `res.cookie(<name>, token, { httpOnly: true, secure: true,
  sameSite: "lax", maxAge: 8 * 60 * 60 * 1000, path: "/" })` — no explicit `domain`
  attribute, so the cookie is scoped strictly to the issuing API subdomain, not shared
  across `*.zelohealth.app`. Cookie names, one per role to avoid collision: `manager_session`,
  `peer_partner_session`, `admin_session`. The body still returns non-sensitive profile
  info (`{name, role}` or equivalent) — the frontend needs *something* to show
  immediately after login and to derive its optimistic flag from (§4).
- Each guard (`manager-auth.guard.ts`, `peer-partner-auth.guard.ts`, `admin-
  auth.guard.ts`) reads `req.cookies[<name>]` instead of parsing the `Authorization`
  header. Verification logic (HMAC check, expiry, manager's live DB re-check) is
  unchanged — only where the token comes from changes.
- New `POST /manager/logout` (+ `/peer-partner/logout`, `/admin/logout`): clears the
  cookie (`res.clearCookie(<name>, { path: "/" })`).
- New `GET /manager/me` (+ `/peer-partner/me`, `/admin/me`): behind the same guard:
  returns `200 {name, role, ...}` if the cookie is valid, relies on the guard's existing
  `401` otherwise. This is what the frontend's route loader calls to confirm a session
  it's optimistically trusting (§4).

### 3. No CSRF token system

`SameSite=Lax` already blocks the classic CSRF vector (a cross-site page triggering a
state-changing request that carries the victim's cookie) for everything except top-level
GET navigations, which don't mutate state here. Given the domain-sharing choice in §1,
this is accepted as sufficient — no double-submit-cookie or synchronizer-token pattern
is built. (If a role ever needs a legitimately cross-site integration later, that's the
trigger to revisit.)

### 4. Frontend: centralize instead of threading the token everywhere

Discovered while scoping: the token isn't just an `Authorization` header an adapter
attaches quietly — it's an explicit parameter threaded through every layer (hook →
use-case → port → adapter), and used as both a React Query `queryKey` entry and an
`enabled` gate, across roughly 9 adapters, 9 ports, and 26 use-cases (manager alone
covers signals, sectors, insights, insight history, notifications, and manager/peer/
sector CRUD). Removing that parameter is safe (the cookie carries auth now, nothing
needs to check `token !== null` before firing a request) — the question is whether to
touch all ~90+ files as isolated edits or centralize the cross-cutting parts. Two things
already in the codebase make centralizing the right call, not a new abstraction for its
own sake:

- **One global `QueryClient`, already the seam for a cross-cutting concern.**
  `apps/web/src/app/query-client.ts`'s `createQueryClient()` already installs a
  `MutationCache({ onError })` that toasts on any mutation failure without an explicit
  handler — "a floor, not a ceiling," per its own comment. It's one `QueryClient` for
  the entire app (manager, peer-partner, admin, anonymous), not one per role.
- **A working precedent for exactly this pattern, scoped to one role.**
  `apps/web/src/presentation/hooks/useManagerSessionExpiry.ts` already subscribes to the
  query and mutation caches globally (not per-page), and on an
  `UnauthorizedManagerError` clears the manager session and redirects — "subscribing to
  the caches rather than to one page's `isError`... makes this a property of the panel
  instead of a habit each page has to remember" (its own doc comment). PeerPartner and
  Admin have no equivalent yet.

So instead of replacing the token with something else at every one of those call sites,
delete it outright and centralize what it was actually protecting:

- **Adapters** drop the `token` parameter and switch to a new shared `apiFetch()` helper
  (`apps/web/src/infrastructure/http/api-fetch.ts`, new) that wraps `fetch` with
  `credentials: "include"` and the base URL — one place sets the cookie-forwarding
  option instead of nine.
- **Ports and use-cases** drop `token: string` from their method signatures — pure
  deletion, not a replacement parameter.
- **Hooks** drop the `enabled: token !== null` gate entirely. The router loader (below)
  is already the authority on whether a protected route renders at all; by the time a
  child hook mounts, the route is already confirmed. `queryKey`s drop the `token` entry
  too — see cache-clearing below for how identity changes are handled instead.
- **Session-expiry handling centralizes into `query-client.ts`**: add a
  `QueryCache({ onError })` (today only `MutationCache` exists) that checks the error
  against `UnauthorizedManagerError | UnauthorizedPeerPartnerError |
  UnauthorizedAdminError` (each already defined once per role and reused everywhere —
  `manager-signals.port.ts`, `admin-institution.port.ts`, the peer-partner equivalent),
  clears that role's session state, and redirects via the already-exported `router`
  (`apps/web/src/app/router.tsx:188`, `createBrowserRouter` result) — `router.navigate(
  loginRouteFor(role), { replace: true, state: { reason: "expired" } })`. Add the same
  check to the existing `MutationCache.onError`, ahead of the generic toast (same
  "floor, not ceiling" pattern the toast itself already follows). **This replaces
  `useManagerSessionExpiry.ts` (delete it)** — PeerPartner and Admin get the identical
  protection for free, with no new per-role hook. Per-page `instanceof
  UnauthorizedManagerError` checks that exist for a *different* reason (e.g.
  `ManagerDashboardPage.tsx:313` distinguishing "still loading/redirecting" from "genuine
  load failure, show an error state") are untouched — they're not duplicating the
  redirect, just reading the same error type for their own rendering decision.
- **Identity changes clear the cache explicitly.** Instead of keying every query on the
  token to force a refetch when a different account logs in within the same tab, each
  role's login-success and logout handler calls `queryClient.clear()`. Exact choke point
  (a single login mutation's `onSuccess`, or the session store's `setSession`/
  `clearSession`) is an implementation-plan-level decision.
- **The three zustand session stores** drop `token`/`expiresAt` — nothing sensitive left
  to hold. Each keeps a single non-sensitive flag (e.g. `{loggedIn: boolean, name?:
  string}`), still `zustand persist` to `sessionStorage` (tab-scoped, matches today), set
  from the login response body, cleared on logout or by the centralized 401 handler
  above. This flag authenticates nothing by itself — it exists only so the router can
  make an instant UI decision instead of blocking on a network round-trip.
- **Router loaders** (`apps/web/src/app/router.tsx` — manager ~line 133, admin ~line 167,
  peer-partner ~lines 175/180): read the local flag first for an immediate
  render-or-redirect decision (no loading flash), and separately call the new `GET /me`
  to confirm. If `/me` comes back 401, redirect to login even though the flag said
  logged-in — the flag is a hint, `/me` and the centralized `onError` handler are truth.
  Exact wiring (await vs. fire-and-forget-then-correct) is an implementation-plan-level
  decision.

### 5. Migration cutover

Deploying this logs out every currently-active session with no migration path (old
`sessionStorage` tokens become meaningless once guards stop reading the `Authorization`
header) — accepted, since sessions expire in 8h anyway and this is a low-traffic app
mid-buildout, not a live product with sessions that matter to preserve.

## Resolved during plan-writing

- **Peer-chat's WebSocket gateway auth is in scope, not out of it.** Confirmed:
  `peer-chat.gateway.ts`'s `handleConnection` reads `client.handshake.auth?.token` —
  the *only* place PeerPartner's session is checked after login; PeerPartner has no
  authenticated REST surface of its own beyond login/logout/`me`. Left unmigrated, the
  chat would have no way to authenticate at all once the token stops living in
  client-side JS. The gateway now reads the token from the handshake's `Cookie` header
  instead (parsed with the `cookie` package — Socket.IO doesn't parse cookies itself),
  the client connects with `withCredentials: true` instead of `auth: { token }`, and the
  gateway's own CORS gets `credentials: true` too. See the implementation plan's Task 5.

## Out of scope

- Fixing the pre-existing inconsistency where the manager guard re-checks the DB (live
  deactivation) on every request while peer-partner/admin guards trust the token alone —
  unrelated to storage mechanism, gets its own debt entry if pursued.
- A CSRF-token system — deliberately not built (§3); revisit only if a role needs a
  legitimately cross-site integration.
- Rotating today's `MANAGER_TOKEN_SECRET`/`ADMIN_TOKEN_SECRET`/`PEER_PARTNER_TOKEN_SECRET`
  — unrelated to where the token is stored client-side; out of scope here.
