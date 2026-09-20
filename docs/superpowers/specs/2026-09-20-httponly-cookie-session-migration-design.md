# HttpOnly Cookie Session Migration (Manager, PeerPartner, Admin)

**Date:** 2026-09-20
**Supersedes:** `2026-09-14-httponly-cookie-session-migration-design.md`, rewritten against the code as of v1.1.0.
**Closes:** TD-001 (`technical-debt.md`), `priorities.md` #30.

## Problem

The three staff roles (Manager, PeerPartner, SuperAdmin) hold an HMAC-signed session token in
`sessionStorage` (`apps/web/src/stores/{manager,peer-partner,admin}-session.store.ts`) and send it as
`Authorization: Bearer`. Any script that runs in the page can read it and impersonate that person for
up to 8 hours, from anywhere.

v1.1.0 lowered the odds and the blast radius: ESLint fails the build on raw-HTML rendering and
`eval`, and the site ships a CSP whose `connect-src` allows only Zelo's own API origins (`priorities.md`
#10). It did not close the debt. The token is still readable by script, and a script that lands can
still act inside the open tab. This migration moves the token into an `HttpOnly` cookie, which no
script can read, so it also stops the token from being replayed elsewhere. The lint rules and the CSP
stay; they defend a different step of the attack.

## Decisions

Approved on 2026-09-20.

1. **Cookies for every staff role.** Staff use the web app today, installed to the home screen as a
   PWA, which runs on the site's own origin. The Android APK is not distributed, so it is out of scope
   (see Non-goals).
2. **`Max-Age` of 8 hours**, equal to the token's lifetime. This changes a behavior: `sessionStorage`
   ended the session when the tab closed, and a cookie survives it. That suits a PWA that is closed
   and reopened all day.
3. **An `Origin` check on state-changing requests** as CSRF defense in depth (below).
4. **Three phases, expand then migrate then contract**, instead of one cutover, so `develop`, dev and
   production keep working after every merge.

## Approach

### 1. Same-site cookies through API subdomains on the frontend's domain

A cookie set by an API on a different registrable domain is third-party: it needs `SameSite=None` and
a CSRF token system that does not exist here. Instead the API lives on the frontend's own domain:

| Environment | Web | API |
|---|---|---|
| Prod | `www.zelohealth.app` | `api.zelohealth.app` (live; the deployed bundle already calls it) |
| Dev | `dev.zelohealth.app` | `api-dev.zelohealth.app` (live since 2026-09-20: `/health` answers 200 over its own certificate; the dev Vercel project's `VITE_API_BASE_URL` still has to be switched to it) |
| Local | `localhost:5173` | `localhost:3000` (same site, ports do not matter) |
| Docker | `localhost:8080` | `localhost:3000` |

All of `zelohealth.app` is one site, so `SameSite=Lax` is valid everywhere. The `*.fly.dev` origins
remain reachable but stop being the canonical ones.

**Consequence of a shared site.** `dev.zelohealth.app` and `api.zelohealth.app` are also same-site. A
page on the dev site can make a request to the prod API and the browser will attach the prod cookie.
`SameSite=Lax` does not stop that, so the `Origin` check below is required, not optional, and the prod
`CORS_ALLOWED_ORIGINS` must never list a dev origin.

### 2. The cookie

| Attribute | Value | Why |
|---|---|---|
| Name | `manager_session`, `admin_session`, `peer_partner_session` | One per role, so a person who holds two roles in one browser keeps both sessions. |
| Value | The existing HMAC token, unchanged | No new token format; guards keep verifying it the same way. |
| `HttpOnly` | yes | The point of the migration. |
| `Secure` | in production and on deployed dev; off only when `NODE_ENV` is not `production` | `localhost` over plain HTTP must work. |
| `SameSite` | `Lax` | Blocks cross-site state-changing requests from other sites. |
| `Path` | `/` | |
| `Domain` | not set | The cookie stays scoped to the API host and is not shared with every `*.zelohealth.app`. |
| `Max-Age` | 28800 (8 h) | Matches the token's `expiresAtEpoch`. |

### 3. API

- **Shared infrastructure.** Read the `Cookie` header with the `cookie` package's `parseCookie`, in one
  helper used by the guards, the origin check and the gateway; there is no `cookie-parser`
  middleware, so nothing depends on middleware order. `enableCors` gains `credentials: true` (its
  `origin` stays an explicit list, never `*`). The allowed-origins resolver is currently duplicated in `main.ts`
  and in `peer-chat.gateway.ts` (`security-privacy.md` §5 warns that both must change together);
  extract it once to `shared/http/allowed-origins.ts` and use it in `main.ts`, the gateway and the
  origin check.
- **Origin check.** A global middleware refuses a request with **403** when it uses `POST`, `PUT`,
  `PATCH` or `DELETE`, **carries a session cookie**, and its `Origin` header is missing or not in the
  allowed list. Requests without a session cookie (login, the anonymous check-in endpoints, health) are
  untouched, and so are `GET`s. A browser always sends `Origin` on a cross-origin state-changing
  request, and this API is never same-origin with the site.
- **Login sets the cookie.** `POST /manager/login`, `/admin/login` and `/peer-partner/login` call
  `res.cookie(...)` with the contract above. The `@LoginThrottle()` limits (#18) are untouched: they
  key on the client address and `body.email`.
- **Guards read the cookie.** `ManagerAuthGuard`, `AdminAuthGuard` and `PeerPartnerAuthGuard` read
  `req.cookies[<name>]` instead of the `Authorization` header. Verification stays as it is, including
  the per-request re-reads: the manager guard re-reads the manager and the institution, and the admin
  guard re-reads the row through `ADMIN_REPOSITORY.findById` and rejects a missing or deactivated
  admin (#7, #66). The design of 2026-09-14 predates that and described the admin guard as trusting
  the token alone; it no longer does.
- **`PeerPartnerAuthGuard` gets the same re-read.** Today it is provided but wired to no REST route, and
  it accepts a deactivated peer partner's token for the rest of its 8 hours (`security-privacy.md` §1).
  It becomes the guard of the new `/peer-partner/me` and `/peer-partner/logout`, and `/me` is what the
  web app trusts, so it must re-read the row through `PEER_PARTNER_REPOSITORY.findById` and check
  `isActive` like the socket handshake already does.
- **`POST /<role>/logout`** clears the cookie (`res.clearCookie` with the same attributes). It answers
  204. It is not a server-side revocation: there is still no session table, and a token that leaked
  before logout stays valid until it expires or the row is deactivated. That is unchanged and out of
  scope.
- **`GET /<role>/me`**, behind the role's guard, returns the profile the UI needs (`{ name, role }` for
  a manager, `{ name }` for an admin, `{ name, specialty }` for a peer partner). A 401 means the
  session is gone.
- **After phase 3** the login response body stops carrying `token` and `expiresAt`. It returns the
  same profile as `/me`.

### 4. WebSocket (peer chat)

The gateway authenticates a peer partner in `handleConnection` from `client.handshake.auth.token`, and
that is the only place a peer partner's session is checked after login. The handshake now reads the
`peer_partner_session` cookie from `client.handshake.headers.cookie` (parsed with the `cookie`
package, since socket.io does not parse cookies), and the client connects with
`withCredentials: true`. The gateway's own CORS gets `credentials: true`, and a connection that carries
the cookie is refused when its `Origin` is not in the allowed list.

Everything the gateway gained in #8 stays: the `isActive` re-read, the zod payload schemas, the
one-open-request and per-address limits, and the `request-peer` alias. The anonymous doctor connects
without a cookie and is unaffected.

### 5. Web app

The token is not just a header an adapter attaches. It is a parameter threaded through 9 adapters,
9 ports, 26 use-cases and 33 hooks, used as a `queryKey` entry and as an `enabled` gate. Centralize
what it protected instead of replacing it call site by call site.

- **`apiFetch()`** (`apps/web/src/infrastructure/http/api-fetch.ts`, new): wraps `fetch` with the base
  URL and `credentials: "include"`. The nine adapters use it and drop their `Authorization` header.
- **Ports, use-cases and hooks** lose the `token` parameter, the `enabled: token !== null` gate and
  the `token` in `queryKey`. This is deletion, not replacement.
- **One place handles a rejected session.** `apps/web/src/app/query-client.ts` gains a `QueryCache`
  `onError` (today it has only `MutationCache`, and `defaultOptions` from #5) that recognizes
  `UnauthorizedManagerError`, `UnauthorizedAdminError` and `UnauthorizedPeerPartnerError`, clears that
  role's flag and redirects to its login with `state: { reason: "expired" }`. It replaces
  `presentation/hooks/useManagerSessionExpiry.ts`, which is deleted, and gives the admin and peer
  partner the protection only the manager panel has today. The `MutationCache.onError` gets the same
  check ahead of the generic toast.
- **A different identity in the same tab.** Each role's login success and logout call
  `queryClient.clear()`, instead of keying every query on the token.
- **The three session stores** drop `token` and `expiresAt` and keep a non-sensitive
  `{ loggedIn, name, role }` flag. It authenticates nothing; it only lets the UI decide without a
  network round trip.
- **Route guards** (`app/routes/manager.routes.ts:83`, `super-admin.routes.ts:24`,
  `peer-partner.routes.ts:8`) stop calling `isValid()`. The flag is a hint, `/me` is the truth:
  - flag set: render immediately and confirm with `/me` in the background; a 401 goes through the
    central handler above;
  - flag absent: `await` `/me` once. `200` sets the flag and continues; `401` redirects to login.

  The second branch matters because the cookie now outlives the tab. A new tab, or the PWA reopened,
  has an empty `sessionStorage` flag but a valid cookie, and must not be sent to the login form.
  The flag therefore stays in `sessionStorage` only as a cache; correctness never depends on it.
- **Socket client.** `PeerChatSocketClient.connect()` drops its `token` argument and connects with
  `withCredentials: true`; `usePeerPartnerConnection` stops receiving a token.

### 6. Rollout: expand, migrate, contract

Deploy order is already API first, then web (`release.yml`), and after every step both halves work.

1. **Expand (API only).** Cookie-parser, CORS credentials, the origin check, the shared origins
   resolver. Login sets the cookie **and still returns the token**. Guards and the gateway accept the
   cookie **or** a Bearer token. Add `/me` and `/logout`, and the `PeerPartnerAuthGuard` re-read. The
   site is unchanged.
2. **Migrate (web, one role per PR).** The shared web infrastructure first (`apiFetch`, the central
   401 handler, the `/me`-based route guard), then manager, then peer partner with the socket, then
   admin. After each PR that role uses the cookie; the others still use Bearer. Cached PWA bundles
   that still send Bearer keep working because the API still accepts it.
3. **Contract (API and web).** Remove Bearer from the guards and the gateway, remove `token` and
   `expiresAt` from the login responses and the types, and delete the token fields from the stores.
   Add a check that fails the build if `apps/web` reads or writes an `Authorization` header.
   Release phase 3 only after phase 2 has been in production long enough for cached bundles to update
   (at least a day). This is the moment sessions issued as Bearer stop working; everyone logs in once.

Phase 2 already ends every existing session once for the role it migrates: the new web code does not
send the old `sessionStorage` token and has no cookie yet, so `/me` answers 401 and the person logs in
again. Sessions are 8 hours long and traffic is low, so this is accepted.

### 7. Local development and deployed environments

- `Secure` follows `NODE_ENV`, so plain-HTTP `localhost` keeps working. Deployed dev and prod are HTTPS.
- Local and Docker keep `CORS_ALLOWED_ORIGINS` as they are, now with credentials.
- The dev API's `CORS_ALLOWED_ORIGINS` must include `https://dev.zelohealth.app`, and prod's must
  include `https://www.zelohealth.app` and no dev origin.
- The CSP `connect-src` already lists `api.zelohealth.app` and `api-dev.zelohealth.app` over `https`
  and `wss`; the headers do not change.
- Helmet sends `Cross-Origin-Resource-Policy: same-origin` on the API. It applies to `no-cors`
  requests, not to credentialed CORS `fetch`; confirm it in Chrome during phase 1 rather than assume.

## Verification

- **API tests per role:** login sets a cookie with the exact attributes; a guard accepts the cookie,
  rejects a missing, forged or expired one, and rejects a deactivated account (including the peer
  partner); logout clears it; `/me` returns the profile; the origin check refuses a state-changing
  request with a cookie and a foreign or missing `Origin`, and lets a cookie-less request through.
- **Gateway tests:** a handshake with the cookie registers the peer partner, a bad or deactivated one
  is disconnected, and the #8 limits and alias still hold.
- **Web tests:** `apiFetch` sends credentials; the central handler redirects each role on a 401 once;
  the route guard covers flag set, flag absent with `/me` 200, and flag absent with `/me` 401; nothing
  in `apps/web` reads `token` from a store.
- **Real browser, headless Chrome against dev** (the same approach used for the CSP): after login the
  cookie is `HttpOnly`, `Secure`, `SameSite=Lax`; `document.cookie` does not contain it;
  `sessionStorage` holds no token; a cross-origin `POST` that carries the cookie is answered 403; and a
  new tab reaches the panel without a login. This is the check the unit tests cannot give.
- **End to end on dev** (`dev.zelohealth.app` with `api-dev.zelohealth.app`): each role logs in, loads
  its panel, logs out, is sent to login after the cookie expires, and a peer partner and a doctor
  complete a chat.

## Non-goals

- **A session table and "log out everywhere".** Sessions stay stateless HMAC tokens with the
  per-request re-reads. A token that leaked before logout is valid until expiry or deactivation.
- **The Android APK.** It serves from `https://localhost`, which is cross-site to the API, so a
  `SameSite=Lax` cookie would not be sent and staff login would fail there. The APK is not distributed
  and nothing in `apps/web/src` gates staff routes by platform. **Before the APK is distributed**, decide
  between web-only staff (redirecting the staff routes to the site), a Bearer fallback for native, or
  `SameSite=None` with CSRF tokens; `docs/android-apk.md` records this warning in the meantime.
- Rotating the token secrets, and any change to what a token contains.

## Risks

- **A wrong `Origin` allowlist locks staff out of a working panel.** The check refuses only
  state-changing requests that carry a session cookie, and phase 1 ships behind Bearer, so it can be
  verified on dev before any web change depends on it.
- **CORS with credentials fails silently in the browser** if `Access-Control-Allow-Credentials` or an
  explicit `Access-Control-Allow-Origin` is missing. The headless Chrome check covers it.
- **iOS home-screen apps keep a separate cookie jar from Safari.** A first-party, same-site cookie set
  by the server is not affected by Safari's tracking prevention, but this is the case to test on a real
  iPhone before phase 3.
- **A person who holds two roles** logs in once per role; the separate cookie names keep them apart.
