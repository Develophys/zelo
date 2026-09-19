# Security and privacy — auth model, tenant scoping, and what never leaves the device or the log stream

This is a mental-health product for doctors. The rules below aren't style preferences — most
protect a session token, a hospital's data boundary, or a message someone wrote at 3am. Source:
the security-privacy domain audit (CONFIRMED + CORRECTED rules only — nothing REFUTED is
repeated here). Every `file:line` citation below was re-checked against the live repo while
writing this file, not carried forward from the audit extract — treat each one as the thing to
re-run, not a summary to trust.

## 1. Auth model per role

Three roles, three independent guard/token/password stacks — `manager` (role field
`HOSPITAL_ADMIN` or `SECTOR_MANAGER`), `admin` (the single `SuperAdmin` model), `peer-partner`.
No JWT, no `@nestjs/jwt`, no passport: `grep -c "jwt\|passport" apps/api/package.json` → 0.
Tokens are hand-rolled `base64url(JSON payload) + "." + HMAC-SHA256(payload, <ROLE>_TOKEN_SECRET)`
with an 8-hour `expiresAtEpoch`, the secret read per-call via `this.config.getOrThrow<string>(...)`.
Re-verified byte-for-byte identical shape and ordering across all three services:
`manager-token.service.ts:7` (`SESSION_DURATION_MS`), `:46-73` (`verify`), `:75-79` (`sign`);
`admin-token.service.ts:6,39-60,62-66`; `peer-partner-token.service.ts:6,46-72,74-78`. `verify()`
never throws — every failure path (missing segment, bad signature, unparseable JSON, wrong
shape, expired) returns `null`, and the signature is compared with `timingSafeStringEqual`
*before* `JSON.parse` runs on the attacker-controlled payload (all three files, same order).

Passwords: `scrypt(password, randomBytes(16).toString("hex"), 64)` stored as
`"<saltHex>:<derivedHex>"`, verified with a length check plus `timingSafeEqual` — never bcrypt,
argon2, or `===`. `manager-password.service.ts`, `admin-password.service.ts` and
`peer-partner-password.service.ts` are byte-identical apart from the class name (re-diffed just
now); `KEY_LENGTH = 64` at line 6 in all three, the `timingSafeEqual` check at line 22.

Login timing defense: every login use-case calls
`passwordService.verify(password, row?.passwordHash ?? DUMMY_PASSWORD_HASH)` *before* checking
whether a row was found, so unknown-email, pending-invite and wrong-password all pay the same
scrypt cost (`DUMMY_PASSWORD_HASH` is a syntactically valid but unusable `"0"*32:"0"*128` hash —
`login-manager.use-case.ts:13`). What differs by role is which failure modes exist to fold: manager
and peer-partner fold five conditions into one non-disclosing error —
`!manager || !manager.passwordHash || !isValid || !manager.isActive || !institution?.isActive`
(`login-manager.use-case.ts:32`, `login-peer-partner.use-case.ts:25`) — while admin folds only
two, `!admin || !isValid` (`login-admin.use-case.ts:22`), because `SuperAdmin` has no `isActive`
column and no pending-invite state (confirmed: `apps/api/prisma/schema.prisma:24-32` lists only
`id, name, email, passwordHash, createdAt`). Do not "restore" the missing three checks on the
admin path — there is nothing there to check.

**The asymmetry that matters most in this file:** `ManagerAuthGuard` re-reads both the manager
row and the institution row from the database on *every* request and 401s if either is inactive,
taking `role` from the fetched row rather than the token
(`manager-auth.guard.ts:38-45`, comment at :32-37). Deactivating a manager, or an entire hospital,
takes effect on their very next request. `AdminAuthGuard` does none of this — it verifies the
signature and stops (`admin-auth.guard.ts:10-26`, no repository injected at all) — and, as shown
above, `SuperAdmin` has no `isActive` column to re-read even if it wanted to. **There is no way
to revoke a SuperAdmin session.** Deleting the row leaves an already-issued HMAC token valid for
up to the remaining 8 hours against every institution-management route on the platform — the
widest-scoped role in the product. This is tracked, not silently accepted: `priorities.md` #7,
still accurate as of this writing, names `ManagerAuthGuard` as exactly what to copy if this gap
is ever closed. Treat "add the manager guard's DB re-read to a new role's guard" as the default,
not an optional hardening step — `AdminAuthGuard` is the one place in the codebase that skipped
it, and it's a known gap, not a pattern to imitate.

Two more things not to build on: the `sessionId` in every token payload is `randomUUID()`-generated
at issue time but never persisted and never read back in any `verify()` — there is no session
table and no "log out everywhere" (confirmed: none of the three `verify()` shape checks above
reference `payload.sessionId`; no session/revocation model in `schema.prisma`). And
`PeerPartnerAuthGuard` exists, is unit-tested, and is provided/exported from its module, but is
wired to zero HTTP routes (`grep -rn "UseGuards(PeerPartnerAuthGuard)" apps/api/src` → no
matches) — peer-partner authentication happens only in the `peer-chat` gateway's socket handshake,
which does its own verify-plus-`isActive`-re-read. Don't reach for `PeerPartnerAuthGuard` as "the"
peer-partner auth point for a new REST route without adding the re-read yourself; as written it
would accept a deactivated peer partner's token for the rest of its 8h life.

## 2. Cross-tenant response semantics

Which status code a cross-tenant mismatch returns is documented once, in
[`backend-http.md`'s "Cross-tenant response semantics" section](./backend-http.md#cross-tenant-response-semantics)
— link there rather than duplicating it here. In one sentence: a foreign id in a `:id` path
param is a bare 404, a foreign id inside a request body is a 400 with a message, and 403 is
reserved for `HospitalAdminGuard`'s own role check — never for a scoping mismatch. That
controller (`manager-admin.controller.ts`) is the one place all three shapes appear together.

## 3. Institution scoping

Every manager-facing endpoint takes `institutionId` from `request.manager!.institutionId` —
populated by `ManagerAuthGuard` from the re-read row (§1) — never from a body field, query
param, or path param. Re-counted just now: `grep -c "request.manager!.institutionId"` returns
16 in `manager-admin.controller.ts` and 5 in `manager.controller.ts`, 21 of 21. The only routes
that take a client-supplied `institutionId` are the four deliberately unauthenticated
`/signals/*` check-in schemas (`signal-checkin.controller.ts:10,17,23,29`). SuperAdmin routes are
the one legitimate exception to "never take institutionId from a path param": `admin.controller.ts`
takes an institution `:id` path param at `updateInstitutionHandler` (:118-121) and
`listInstitutionSectorsHandler` (:140-142), because that role is cross-institution by design and sits
behind `AdminAuthGuard` — this is the designed shape, not a case of the rule above being violated.

When a manager-facing handler addresses a specific row by `:id`, it re-reads that row and rejects
on `row.institutionId !== input.institutionId` rather than trusting the database foreign key to
prove ownership. Re-verified at `delete-manager.use-case.ts:23-25` (mirror file for this pattern)
and eight more sites of the same shape: `delete-peer-partner.use-case.ts:21`,
`delete-sector.use-case.ts:20`, `send-manager-set-password-email.use-case.ts:31`,
`send-peer-partner-set-password-email.use-case.ts:31`, `update-manager.use-case.ts:26`, and three
inline checks in `manager-admin.controller.ts` — `updateSector`'s own row (:142-144),
`updatePeerPartner`'s own row (:304-306), and `updateSector`'s body-supplied `managerId` assignee
(:161-167, with its own explanatory comment at :158-160) — the last of these is the
**body-supplied** shape from §2 (a `400` with a message, not a `404`), included here because the
ownership check itself is the same re-read-and-compare, even though the response code differs.

**The institution-scoping trap — the canonical example to generalize from.**
`prisma-sector.repository.ts` has two sibling read methods with different `select` clauses:
`findActiveByInstitution` (:92-98) selects `{ id: true, name: true }` only, while
`findAllForAdmin` (:54-68) additionally selects `inviteCode` and is reachable only behind
`AdminAuthGuard` (`admin.controller.ts:141`) or `ManagerAuthGuard` + `HospitalAdminGuard`
(`manager-admin.controller.ts:79,99`). `findActiveByInstitution` is called from exactly one
place: `institution.controller.ts:46-49`, `GET /institutions/:id/sectors` — a controller with
**no `@UseGuards` anywhere in the file**, reachable by anyone holding an institution `cuid` (which
the public by-code lookup hands out). If that `select` were ever widened to include `inviteCode`
— to "let the frontend reuse one method," say — every sector's QR invite code would become
publicly enumerable with no authentication at all.

Generalize this as: **never widen a `select` used by an unauthenticated controller to include a
credential-shaped field** (an invite code, a token hash, a password hash — anything that grants
access if read). When an authenticated caller needs more fields than the public method returns,
add a new repository method scoped to that caller, the way `findAllForAdmin` already exists
alongside `findActiveByInstitution` — don't widen the one method every unauthenticated route
already reaches.

## 4. XSS surface

Never introduce `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`document.write`, `eval()`, `new Function`, or a `javascript:`/user-built `href` anywhere in
`apps/web`. This is a project-wide prohibition, not specific to one screen, and `CLAUDE.md`
carries it as a top-level law.

**It is enforced.** `apps/web/eslint.config.mjs` fails the build on `dangerouslySetInnerHTML`
(JSX attribute and `createElement` prop), on assigning `innerHTML`/`outerHTML`, on
`insertAdjacentHTML` and on `document.write`/`writeln` (`no-restricted-syntax`, all core ESLint,
no plugin). `packages/config/eslint.base.mjs` adds `no-eval`, `no-implied-eval`, `no-new-func` and
`no-script-url` for every package. `apps/web/src/lint/no-raw-html.test.ts` runs ESLint over probe
snippets to prove each pattern is rejected, and that ordinary code (JSX text, `textContent`,
*reading* `innerHTML`) is not. It applies to test files too. The tree has zero occurrences today:

```bash
grep -rnE "dangerouslySetInnerHTML|innerHTML|outerHTML|document\.write|eval\(|new Function|javascript:" apps/web/src packages
```

This matters specifically because of §1: session tokens live in `sessionStorage` as a Bearer token
for every role, including the SuperAdmin session. Until the `HttpOnly`-cookie migration lands
(`priorities.md` #30; TD-001 stays open), the lint rules and the CSP in §5 are what stand between a
single XSS and full session exfiltration for manager, hospital-admin, SuperAdmin and peer-partner
sessions alike.

## 5. Transport hardening

**CORS** is an explicit allowlist read from `CORS_ALLOWED_ORIGINS`, never `origin: true`, `"*"`,
or an origin-reflecting function — frontend (Vercel) and API (Fly) are never same-origin, so this
is load-bearing, not incidental. `main.ts:13-19` builds `resolveAllowedOrigins()`, applied at
`:23` via `app.enableCors({ origin: resolveAllowedOrigins() })`. The WebSocket gateway duplicates
the same resolver rather than importing it — `peer-chat.gateway.ts:23-27`, applied at `:36` in
`@WebSocketGateway({ cors: { origin: resolveAllowedOrigins() } })` — so a change to the allowed
origins has to be made in both files or the socket and the REST API silently disagree.

**Rate limiting.** `ClientAddressThrottlerGuard` is registered globally in `app.module.ts`, with the
limits in `shared/http/throttling.ts`: 100 requests/60s per client address (`Fly-Client-IP`, else
`req.ip`), a CPU-flood floor and not an abuse control for a specific route. The address matters:
behind Fly's proxy `req.ip` is shared by everyone, which made the old stock-guard budget a single
bucket for all users. The three login endpoints (`manager.controller.ts`, `admin.controller.ts`,
`peer-partner.controller.ts`) carry `@LoginThrottle()`: 20 attempts / 15 min per client address and
5 / 15 min per client address + e-mail. The counters are in memory per process, so a second Fly
machine would count separately. There are exactly two `@Throttle` overrides in the codebase, both `@Throttle({ default: { limit: 5, ttl: 900_000 } })` (5 requests / 15 minutes) on
the two `forgot-password` routes: `manager.controller.ts:110` and `peer-partner.controller.ts:63`,
each paired with a non-disclosing handler that returns `void` on every non-happy path. The v6
nested shape above is required — the v5 flat `@Throttle({ limit, ttl })` shape still compiles and
type-checks but silently applies no limit at all (see
[`backend-http.md`'s Rate limiting section](./backend-http.md#rate-limiting) for that trap in
full). The password floor is still 8 characters with no complexity rule, and the SuperAdmin
password is never validated by a schema (`priorities.md` #29).

**Security headers** are set on three surfaces, and each is tested.

- **The site (Vercel).** `apps/web/vercel.json` `headers` sends a Content-Security-Policy,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin` and a `Permissions-Policy` that leaves the camera to the app
  itself (the QR scanner) and disables microphone, geolocation, payment and USB. The CSP is
  `default-src 'self'`, no `unsafe-eval`, no wildcard host, `object-src 'none'`,
  `frame-ancestors 'none'`. `connect-src` lists exactly Zelo's own API origins over `https` and
  `wss` (`zelo-api`, `zelo-api-dev` on Fly and `api`, `api-dev` on `zelohealth.app`), never
  `*.fly.dev`: a wildcard would let injected script send a token to an attacker's own Fly app.
  `style-src` keeps `'unsafe-inline'` because React renders inline `style` attributes.
- **The inline script.** `index.html` has one inline script (the theme bootstrap), allowed by its
  sha256 in `script-src`. `apps/web/src/security-headers.test.ts` recomputes that hash from
  `index.html` and fails if `vercel.json` disagrees, so editing the script means copying the new
  hash out of the failure. The hash is computed on LF line endings, which is what git stores and
  what Vercel builds; a Windows checkout with CRLF produces a different local hash, so a local
  browser check must normalize line endings first.
- **The API (Fly).** `apps/api/src/shared/http/security-headers.ts` wraps `helmet`, applied in
  `main.ts` before CORS: `default-src 'none'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: no-referrer`, HSTS for two years without `includeSubDomains`, and no
  `X-Powered-By`. A JSON API has no use for any resource, so the policy allows none.
- **Local Docker.** `docker/nginx-security-headers.conf` is included in both the server block and
  the `/sw.js` location (nginx drops inherited `add_header` lines in a location that sets its own).
  A test asserts it matches `vercel.json` apart from `connect-src`, which targets
  `localhost:3000`.

**What this does not do.** The CSP does not stop an injected script from acting inside the victim's
open tab; it stops it from loading outside code, from running inline or `eval`-ed code, and from
sending the token to a host that is not Zelo's. The Android APK loads its assets locally and gets
none of the Vercel headers. Verified in headless Chrome against the production build with the exact
`vercel.json` headers: nine routes render with zero violations, and simulated attacks (fetch and
image beacon to a foreign host, a foreign `*.fly.dev` app, an inline script, an inline event
handler, a foreign script, `eval`, `new Function`, framing) are all blocked.

## 6. What never gets logged

The convention: logs carry event names, ids, and counts — never message content, assessment
answers, tokens, secrets, or full request bodies. The model to copy for any new logging is the
tone guard's `onTell` callback — see
[`product-invariants.md` §3 ("Tone guard")](./product-invariants.md#3-tone-guard) for the full
mechanism; the short version is that `onTell` takes only a `rule: ToneRule` label from a
four-member closed union, never the sentence that triggered it, and the one production caller
logs exactly `` `tone_guard rule=${rule}` `` (`send-chat-message.use-case.ts:102`, re-verified).
Don't widen a callback like this to pass the triggering text "for debugging."

A few concrete boundaries, re-checked against the code:

- **Assessment content never becomes plaintext on the server in the first place**, so there's
  nothing to accidentally log on that path — scoring happens on-device and the wire payload is
  opaque ciphertext (`assessment.controller.ts:12`, `AssessmentSchema` at
  `packages/domain/src/entities/assessment.ts:28-33` has no `riskSignal` or raw-answer field). Full
  mechanism: [`product-invariants.md` §5](./product-invariants.md#5-risksignal-and-on-device-scoring).
- **`deviceSignalId` is hashed before it's ever persisted**, and never appears in a log call —
  `record-signal-checkin.use-case.ts:27-29` folds it into a SHA-256 `dedupKey` before the
  repository call at :31; grepping every logger/console call site under
  `apps/api/src/modules/signal-checkin` for `deviceSignalId` returns nothing.
- **Invite/reset tokens**: only the SHA-256 hash is ever persisted or read back —
  `hash-set-password-token.ts:3-5`, written at `create-manager.use-case.ts:63` and looked up at
  `finish-manager-setup.use-case.ts:23` — the raw token is emailed once
  (`create-manager.use-case.ts:83`) and both the token and its expiry are nulled on redemption
  (`finish-manager-setup.use-case.ts:29`).
- **Named exception, fenced by environment**: `MockEmailAdapter` (local/dev only) logs both the
  recipient address and the raw invite/reset URL to the server console so a developer can copy the
  link out of the terminal (`mock-email.adapter.ts:15-16`). This is guarded, not accidental —
  `env.validation.ts:47-49` refines `EMAIL_PROVIDER` to reject anything but `"resend"` when
  `NODE_ENV === "production"` — but the guard is on `NODE_ENV`, not on whether real invitees are
  in play, so a staging deploy running with `NODE_ENV=development` and real email addresses would
  still put a live 48h-valid invite token in plaintext in the log stream.
- **Peer-chat text is the one channel that's genuinely unredacted and unstored, and that's
  deliberate.** `peer-chat.gateway.ts`'s `handleMessage` (:170-179) relays `payload.text`
  socket-to-socket in memory. The payload is zod-checked for shape and a 4000-character cap
  (`peer-chat.payloads.ts`) but never redacted, and there is no call into
  `AnonymizeTextUseCase`, and there is no `Message`/`Chat` model in `schema.prisma` to persist it
  into (models present: `Assessment, SuperAdmin, Institution, Sector, Signal, Manager,
  PeerPartner, ManagerInsight, SignalDedupKey, Notification`). Don't "fix" this by adding a
  transcript table or routing peer-chat text through the same anonymization pipeline the AI chat
  path uses — it's a human-to-human channel by design, distinct from the LLM-facing pipeline the
  rest of this section is about.

## Traps

- Don't copy `ManagerAuthGuard`'s per-request DB re-read as something every guard already has —
  `AdminAuthGuard` and (for HTTP purposes) `PeerPartnerAuthGuard` don't, and that's a known gap
  (§1), not a pattern to assume elsewhere.
- Don't widen `findActiveByInstitution`'s `select` to add a field an authenticated caller needs —
  it backs an unauthenticated route. Add a new, narrower-scoped repository method instead (§3).
- Don't move session tokens into an `HttpOnly` cookie, add `cookie-parser`, `res.cookie`, or
  `credentials: "include"` because it's the ecosystem-correct thing to do. The migration is fully
  designed but deliberately not landed — it needs custom API domains attached to the Fly apps
  first, or the cookie is cross-site and needs `SameSite=None` plus a CSRF system this repo
  doesn't have. Check which branch/worktree you're in before touching this: an in-progress
  migration worktree may already carry step one of it.
- Don't replace the hand-rolled HMAC token with a JWT library, or swap `scrypt` for `bcrypt`/`argon2`
  in any of the three password services (§1) — both would break the shared verification shape all
  three roles depend on.
- Don't add a global logging interceptor, a request-body logger, or a bare `logger.error(error)`
  on a chat or assessment path — log event names, ids, counts, and `error.name` only (§6).
- Don't relax CORS to `origin: true`, `"*"`, or an origin-reflecting callback for a new frontend
  origin — add it to `CORS_ALLOWED_ORIGINS` and update both `main.ts` and `peer-chat.gateway.ts`
  (§5), since the resolver is duplicated, not shared.

## How to verify

The XSS prohibition (§4) and the security headers (§5) are covered by tests. There is still no
test asserting the institution-scoping trap can't recur (§3), so verifying that part of this file
means re-running the greps above by hand:

```bash
# Auth stack: identical shape across all three roles
grep -c "jwt\|passport" apps/api/package.json                              # expect 0
diff apps/api/src/modules/manager/application/services/manager-password.service.ts \
     apps/api/src/modules/admin/application/services/admin-password.service.ts

# Institution scoping: 21 of 21 institutionId reads come from the guard-populated request
grep -c "request.manager!.institutionId" apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts
grep -c "request.manager!.institutionId" apps/api/src/modules/manager/infrastructure/manager.controller.ts

# XSS surface: zero occurrences, enforced by lint (expect the rule names, then no output from the grep)
grep -n "no-restricted-syntax\|no-eval\|no-new-func" apps/web/eslint.config.mjs packages/config/eslint.base.mjs
grep -rnE "dangerouslySetInnerHTML|innerHTML|outerHTML|document\.write|eval\(|new Function|javascript:" apps/web/src packages

# Transport hardening: security headers on the three surfaces, CORS allowlist duplicated
grep -n "helmet" apps/api/package.json
grep -n "Content-Security-Policy" apps/web/vercel.json docker/nginx-security-headers.conf
grep -n "@Throttle" apps/api/src/modules/manager/infrastructure/manager.controller.ts apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts
grep -rn "@LoginThrottle" apps/api/src --include=*.controller.ts
```
