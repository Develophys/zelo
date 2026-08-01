# Per-manager individual accounts — design spec

**Status:** approved design, not yet implemented.

**Relationship to prior specs:** `identity-and-aggregation.md` designed a full multi-user
identity layer (per-doctor `User` model, magic-link auth, real per-doctor aggregation) that
remains explicitly out of scope — nothing here touches doctors, `PeersPage`, or real
assessment data. This spec is a much narrower slice: individual login credentials for the
**manager side only**, replacing the single shared `MANAGER_ACCESS_CODE`. It resolves
`technical-debt.md`'s TD-002 ("insight history is shared across all managers, not
per-manager") by making the underlying identity real, without building multi-institution data
partitioning — this PoC still targets one hospital (per `2026-07-11-manager-login-simulated-dashboard-design.md`'s
explicit scope note), so "team-scoped" and "shared across everyone with valid credentials"
are the same thing today. TD-001 (session token in `sessionStorage`, not an `HttpOnly`
cookie) is untouched — independent concern, not part of this spec.

**Non-goal, explicitly:** multiple institutions/hospitals. If a second institution is ever
onboarded, the `Manager` model below would need an `institutionId` and every manager-scoped
query would need to filter by it — that redesign is deferred until a second institution
actually exists, not built speculatively now.

---

## 1. Data model

```prisma
model Manager {
  id           String   @id @default(cuid())
  name         String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  @@map("managers")
}
```

`ManagerInsight` gains one new nullable field:

```prisma
model ManagerInsight {
  // ...existing fields (id, interpretation, suggestedActions, summary, generatedAt) unchanged...
  createdByManagerName String?  // NEW, nullable — rows seeded/generated before this migration have no value
}
```

`createdByManagerName` is a denormalized string, not a foreign key. `schema.prisma` has no
`@relation` anywhere today — every model is flat scalars — and a PoC with a handful of
managers doesn't need join integrity for a display label. This is purely the "who generated
this analysis" attribution shown in the insight-history list; it does not gate or filter
anything (see §3).

**No `institutionId`, no `department` field on `Manager`, no role/permission distinction
between managers** — every manager account is equivalent and can do everything a manager
could do today (view signals, generate insights, view/export history). That symmetry is
correct for a single-institution PoC; don't add per-manager permission scoping speculatively.

## 2. Password hashing — no new dependency

A new `apps/api/src/modules/manager/application/services/manager-password.service.ts`, using
Node's built-in `node:crypto` (`scrypt` + `timingSafeEqual`) — matching
`manager-token.service.ts`'s existing pattern of raw `crypto` instead of a JWT/bcrypt library:

```ts
export class ManagerPasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = await scryptAsync(password, salt, 64) as Buffer;
    return `${salt}:${derived.toString("hex")}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [salt, hashHex] = stored.split(":");
    if (!salt || !hashHex) return false;
    const derived = await scryptAsync(password, salt, 64) as Buffer;
    const storedBuf = Buffer.from(hashHex, "hex");
    return derived.length === storedBuf.length && timingSafeEqual(derived, storedBuf);
  }
}
```

(Exact byte-length/param choices finalized at implementation time; the shape — salted
scrypt, timing-safe compare, no new package — is the decision.)

## 3. Auth flow changes

### Login: `LoginManagerUseCase.execute(name, password)`

Replaces today's `execute(code)`. Looks up the `Manager` by `name` via a new
`ManagerRepositoryPort` (`findByName(name): Promise<{ id, name, passwordHash } | null>`,
backed by a `PrismaManagerRepository`, following the existing per-module port/adapter
layout). Verifies the password via `ManagerPasswordService`. Throws
`InvalidManagerCredentialsError` (renamed from `InvalidManagerCodeError`) in **both** the
"name not found" and "wrong password" cases — a failed login must not reveal whether a given
name has an account.

### Token: JSON payload, not dot-joined fields

Today's token payload is `sessionId.expiresAtEpoch`, dot-joined then base64url-encoded —
safe only because both parts are numbers/UUIDs with no `.` in them. A manager's `name` could
contain a `.`, so the payload becomes a JSON object instead:

```ts
issue(managerId: string, managerName: string): IssuedManagerToken {
  const sessionId = randomUUID();
  const expiresAtEpoch = Date.now() + SESSION_DURATION_MS;
  const payloadB64 = Buffer.from(JSON.stringify({ sessionId, managerId, managerName, expiresAtEpoch }))
    .toString("base64url");
  const signature = this.sign(payloadB64);
  return { token: `${payloadB64}.${signature}`, expiresAt: new Date(expiresAtEpoch).toISOString() };
}

verify(token: string): { managerId: string; managerName: string } | null {
  // same signature/expiry checks as today, returns the decoded manager
  // info instead of a bare boolean; null on any failure (missing,
  // malformed, tampered signature, or expired)
}
```

The outer `token.split(".")` into `[payloadB64, signature]` is unchanged — only the *inner*
payload's encoding changes from dot-joined to JSON.

### Guard: attaches manager identity to the request

`ManagerAuthGuard.canActivate` calls the updated `verify()`; on success it sets
`request.manager = { id: managerId, name: managerName }` before returning `true` (previously
just returned `true`). All existing 401 behavior (missing/malformed/expired/tampered token)
is unchanged — this only adds data for handlers that want it.

### Attribution: wired through insight generation, not through history filtering

`ManagerController`'s `insights` (POST) handler reads `request.manager.name` and passes it to
`GenerateManagerInsightUseCase.execute(managerName)`, which forwards it to
`ManagerInsightRepositoryPort.save()` as `createdByManagerName`.
`GetManagerInsightHistoryUseCase` is **unchanged** — still returns every saved insight,
unfiltered (per the "shared across the one institution" decision) — `StoredManagerInsight`
just gains the optional field for the frontend to display. `signals` and
`insights/history` endpoints don't read `request.manager` at all; only insight *generation*
records who did it.

## 4. Frontend changes

- **`ManagerLoginPage.tsx`** — two fields (name, password) instead of one (code), same
  `PhoneShell`/`Card`/`Button` shell and inline-401-error pattern as today.
- **`manager-auth.port.ts`** (the login request/response shape), `useManagerLogin.ts`, the
  frontend `login-manager.usecase.ts`, and `http-manager-auth.adapter.ts` all change from
  `login(code)` to `login(name, password)`.
- **`manager-session.store.ts`** is unchanged — still just `{ token, expiresAt }`. No screen
  needs "logged in as X" except the history page, which gets manager names from the API
  response per-entry, not from session state.
- **`ManagerInsightHistoryPage.tsx`** renders "Gerado por {name}" under the existing date
  line, only when `entry.createdByManagerName` is present — older entries (seeded or
  generated before this migration) simply omit the line, no placeholder text.

## 5. Seed roster

`apps/api/prisma/seed.ts` gains two named `Manager` rows with demo passwords, hashed via
`ManagerPasswordService` at seed time, upserted by unique `name` (idempotent — same pattern
as the existing `SimulatedSignal`/`SimulatedFollowUp` seeding). No signup endpoint exists;
accounts are seed-created only, matching the PoC's existing "no self-service" scope for
manager access (see `identity-and-aggregation.md` §6, which left "how does `MANAGER` role
assignment happen" explicitly unresolved — this spec resolves it as "seeded, not
self-service or admin-panel").

Document the roster (names + demo passwords, in plaintext — this is local/demo data, same
transparency `MANAGER_ACCESS_CODE=zelo-demo-2026` already has in `.env.example` today) in
`apps/api/prisma/README.md` alongside the existing seed documentation.

`MANAGER_ACCESS_CODE` is removed entirely — from `LoginManagerUseCase`, from
`.env.example`, `docker/.env.example`, and `docker/.env.docker`. `MANAGER_TOKEN_SECRET`
stays; it still signs the session token.

## 6. Testing

**Backend:**
- `manager-password.service.test.ts` (new) — hash/verify round-trip; wrong password rejected;
  two different passwords never produce colliding stored hashes for the same salt-independent
  input (basic sanity, not a cryptographic audit).
- `login-manager.use-case.test.ts` — updated: mocked `ManagerRepositoryPort`; unknown name and
  correct-name-wrong-password both reject via the same `InvalidManagerCredentialsError`;
  correct name+password issues a token carrying that manager's `id`/`name`.
- `manager-token.service.test.ts` — updated for the JSON payload: round-trips
  `managerId`/`managerName` correctly; tampered signature, expired token, and malformed
  payload all still return `null` (previously `false`).
- `manager-auth.guard.test.ts` — updated: asserts `request.manager` is populated with the
  right `{ id, name }` on a valid token; still 401s on missing/malformed/expired/tampered,
  unchanged.
- `manager.controller.test.ts` — updated request body shape (`{ name, password }`); asserts
  the `insights` endpoint passes the authenticated manager's name through to
  `GenerateManagerInsightUseCase.execute`.
- `generate-manager-insight.use-case.test.ts` — updated: `execute(managerName)` passes
  `createdByManagerName` to the repository's `save()`.
- `get-manager-insight-history.use-case.test.ts` — updated: asserts the field passes through
  unfiltered (i.e., this use case still returns every row regardless of which manager
  generated it).

**Frontend:**
- `ManagerLoginPage.test.tsx` — two-field submit flow; inline error (not a crash) on 401.
- Frontend `login-manager.usecase.test.ts` — signature change to `execute(name, password)`.
- `router.test.tsx` — login flow updated to the new form fields.
- `ManagerInsightHistoryPage.test.tsx` — "Gerado por {name}" renders when present, omitted
  when `createdByManagerName` is null/undefined.

## 7. Migration

One new Prisma migration: `CREATE TABLE managers (...)` plus
`ALTER TABLE manager_insights ADD COLUMN created_by_manager_name TEXT NULL`. Both are
additive and backward-compatible — no data loss, no required backfill (existing
`manager_insights` rows simply have `NULL` in the new column).

## 8. Out of scope (explicitly)

- Multiple institutions/hospitals (see the non-goal note above).
- Any role/permission distinction between managers — all manager accounts are equivalent.
- Self-service signup or an admin panel for creating manager accounts.
- Filtering insight history by which manager generated it — attribution is informational
  only, not an access-control boundary.
- TD-001 (session token storage/cookie migration) — independent, untouched.
- Password reset / "forgot password" flow — a seeded, fixed roster has no use for one yet.
