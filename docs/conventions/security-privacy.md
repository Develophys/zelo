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

Never introduce `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval()`,
`new Function`, or a `javascript:`/user-built `href` anywhere in `apps/web`. This is a
project-wide prohibition, not specific to one screen, and it is already real and already
enforced by convention today (see the re-run grep below) regardless of where it's written down.
A separate task in this same documentation pass will add a one-line summary of this rule to
`CLAUDE.md` as a top-level law — as of this writing that line is **not yet there**
(`grep -n "dangerouslySetInnerHTML\|innerHTML\|XSS" CLAUDE.md` returns nothing); this file is
where the fuller TD-001 rationale lives regardless, since `CLAUDE.md`'s eventual version will
necessarily be a one-line summary. Re-run just now:

```bash
grep -rnE "dangerouslySetInnerHTML|innerHTML|outerHTML|document\.write|eval\(|new Function|javascript:" apps/web/src packages
```

Zero hits. This matters specifically because of §1: session tokens live in `sessionStorage` as a
Bearer token for every role, including the SuperAdmin session that §1 showed cannot even be
revoked once issued. With no `HttpOnly` cookie (see the Traps section below) and no CSP (§5),
React's default escaping — i.e., the absence of the APIs above — is the *only* thing standing
between a single XSS and full session exfiltration for manager, hospital-admin, SuperAdmin and
peer-partner sessions alike. This is documented as TD-001's named compensating control.

**Nothing enforces it.** There is no `react/no-danger` (or equivalent `no-restricted-syntax` /
`no-restricted-properties`) ESLint rule in `apps/web/eslint.config.mjs`,
`packages/config/eslint.base.mjs`, or `packages/domain/eslint.config.mjs` — re-checked, no match
— and no CI grep. The zero-occurrence state above is maintained by convention only. That gap is
tracked as `priorities.md` #10 (add `react/no-danger: error` plus baseline security headers), not
an oversight to quietly work around mid-task.

## 5. Transport hardening

**CORS** is an explicit allowlist read from `CORS_ALLOWED_ORIGINS`, never `origin: true`, `"*"`,
or an origin-reflecting function — frontend (Vercel) and API (Fly) are never same-origin, so this
is load-bearing, not incidental. `main.ts:13-19` builds `resolveAllowedOrigins()`, applied at
`:23` via `app.enableCors({ origin: resolveAllowedOrigins() })`. The WebSocket gateway duplicates
the same resolver rather than importing it — `peer-chat.gateway.ts:21-25`, applied at `:40` in
`@WebSocketGateway({ cors: { origin: resolveAllowedOrigins() } })` — so a change to the allowed
origins has to be made in both files or the socket and the REST API silently disagree.

**Rate limiting.** `ThrottlerGuard` is registered globally in `app.module.ts` —
`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` at `:27`,
`{ provide: APP_GUARD, useClass: ThrottlerGuard }` at `:41` — a per-IP CPU-flood floor, not an
abuse control for a specific route. There are exactly two `@Throttle` overrides in the whole
codebase, both `@Throttle({ default: { limit: 5, ttl: 900_000 } })` (5 requests / 15 minutes) on
the two `forgot-password` routes: `manager.controller.ts:110` and `peer-partner.controller.ts:63`,
each paired with a non-disclosing handler that returns `void` on every non-happy path. The v6
nested shape above is required — the v5 flat `@Throttle({ limit, ttl })` shape still compiles and
type-checks but silently applies no limit at all (see
[`backend-http.md`'s Rate limiting section](./backend-http.md#rate-limiting) for that trap in
full). None of the three login endpoints (`manager.controller.ts:68`, `admin.controller.ts:61`,
`peer-partner.controller.ts:21`) carries a `@Throttle` override — they run on the same 100-req/60s
global budget as a dashboard read, against an 8-character password minimum with no complexity
rule or lockout.

**`helmet` is absent from the stack**, and this is a known, tracked gap — state it as such, not
as something to silently patch in mid-task. `grep helmet apps/api/package.json` → no match; no
CSP/HSTS/X-Frame-Options/Referrer-Policy header is set anywhere (`main.ts`'s only middleware call
is `enableCors`; `docker/nginx.conf` adds no security headers; `apps/web/vercel.json` only
rewrites; `apps/web/index.html` has no CSP meta tag). `priorities.md` #10 covers both this and the
`react/no-danger` gap from §4 together, since a CSP is the cheapest control that would blunt
token exfiltration even if an XSS did land.

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
  deliberate.** `peer-chat.gateway.ts`'s `handleMessage` (:148-155) relays `payload.text`
  socket-to-socket in memory with no schema validation and no call into
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

There is no automated check for most of this document — no lint rule for the XSS prohibition
(§4), no test asserting the institution-scoping trap can't recur (§3), no CI step confirming
`helmet` is still absent on purpose rather than by oversight (§5). Verifying this file means
re-running the greps above by hand:

```bash
# Auth stack: identical shape across all three roles
grep -c "jwt\|passport" apps/api/package.json                              # expect 0
diff apps/api/src/modules/manager/application/services/manager-password.service.ts \
     apps/api/src/modules/admin/application/services/admin-password.service.ts

# Institution scoping: 21 of 21 institutionId reads come from the guard-populated request
grep -c "request.manager!.institutionId" apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts
grep -c "request.manager!.institutionId" apps/api/src/modules/manager/infrastructure/manager.controller.ts

# XSS surface: zero occurrences, zero enforcing lint rule
grep -rnE "dangerouslySetInnerHTML|innerHTML|outerHTML|document\.write|eval\(|new Function|javascript:" apps/web/src packages
grep -n "no-danger\|no-restricted-syntax\|no-restricted-properties" apps/web/eslint.config.mjs packages/config/eslint.base.mjs

# Transport hardening: helmet absent, CORS allowlist duplicated
grep -n "helmet" apps/api/package.json
grep -n "@Throttle" apps/api/src/modules/manager/infrastructure/manager.controller.ts apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts
```
