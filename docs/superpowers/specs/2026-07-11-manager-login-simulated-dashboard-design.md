# Manager Login + Simulated Dashboard Data — design spec

**Status:** implemented (2026-07-11 for this spec's own scope; the manager login itself was
later replaced by individual accounts in `2026-08-01-manager-individual-accounts-design.md`).
**§1's core claim is still true and unaffected by later work:** the manager dashboard still
cannot and does not decrypt `Assessment.ciphertext` — that table remains structurally
unreadable server-side, by design, forever. What *did* change: the dashboard's aggregate
numbers are no longer 100% simulated for every institution.
`2026-08-02-multi-institution-data-partitioning-design.md` added a real, k-anonymous,
deduplicated signal pipeline (`POST /signals/checkin`) that a médico's device fires
separately from — and with zero link to — the encrypted `Assessment` submission this section
describes. Real institutions' `Signal` counters fill in from that pipeline; the seeded demo
institution keeps this spec's original simulated data. See that spec for the full design.

**Relationship to `identity-and-aggregation.md`:** that earlier spec designed a full
multi-user identity layer (per-doctor `User` rows, magic-link auth, real per-user
aggregation) for a future where doctor-side data could genuinely be attributed and
aggregated server-side. This spec **narrows and supersedes it for the current demo scope**:
the team decided (2026-07-11) that the manager dashboard's underlying doctor data will
stay **simulated** through the 25/07 final demo — see `general-documentations/reuniao_07_10.md`
item 8. Doctors never get accounts; the app's anonymity promise for doctors is unchanged.
Only the **manager side** gets real, working auth — because a hospital administrator
actually needs to be kept out of a dashboard they haven't authenticated into, even if
what's behind it is demo data.

If/when the team decides real per-doctor identity is needed, `identity-and-aggregation.md`
is still the design to pick back up — nothing in this spec forecloses that.

---

## 1. Why the manager dashboard can't read the real `assessments` table

Real assessments are end-to-end encrypted: `Assessment.ciphertext` is AES-256-GCM
ciphertext encrypted with a key that is generated once per device and never leaves that
device (`WebCryptoEncryptionAdapter`, IndexedDB `zelo-crypto` store). The server stores
opaque bytes it cannot decrypt, by design — this is the app's core privacy promise, and it
holds even for the operator of the server. So there is no path, today or with any amount of
backend code, for the manager dashboard to aggregate real assessment severity server-side.

This is precisely why the dashboard's data is simulated: it's not a shortcut around
missing auth, it's a structural consequence of the encryption design. A future path to
real manager-visible aggregates would require doctors to opt into a *separate*,
explicitly-consented data flow (see `identity-and-aggregation.md` §4) — out of scope here.

## 2. Non-negotiables

- **k-anonymity, k=5, enforced server-side.** A department segment with `n < 5` check-ins
  is never constructed into the response object, never serialized, never sent — not
  filtered client-side. (Same rule as `identity-and-aggregation.md` §1, carried forward.)
- **The manager login must be real**, even though the data behind it is fake — a wrong or
  missing credential must not reach `/api/manager/signals` (server-enforced, not just a
  frontend route redirect).
- **Nothing about `SimulatedSignal` is allowed to be confused with real assessment data.**
  Separate Prisma model, separate table, separate module — never joined with, derived
  from, or written to the same table as `Assessment`.
- **Doctors get no accounts, no login, no change to their existing anonymous flow.** This
  spec touches nothing on the doctor-facing side except the destination of one existing
  link (`"Ver painel do gestor (demo)"` on `HomePage`).

## 3. Data model & seed script

```prisma
model SimulatedSignal {
  id          String   @id @default(cuid())
  department  String   // "Plantão noturno" | "Pronto-socorro" | "UTI" | "Ambulatório"
  weekStart   DateTime // ISO Monday — same bucketing convention as GetAssessmentHistoryUseCase's startOfIsoWeek
  checkIns    Int      // n for that department/week
  concerning  Int      // subset of checkIns landing in "Moderado" or worse (see rule below)
  createdAt   DateTime @default(now())

  @@unique([department, weekStart])
  @@map("simulated_signals")
}
```

### The "concerning" rule — what it means and where to change it

A simulated check-in counts as **concerning** if it falls in the **"Moderado" band or
worse** on the app's existing clinical severity scale — the same bands `band-for.ts`
already uses on the doctor's own result screen (`Mínimo` / `Leve` / `Moderado` /
`Moderadamente grave` / `Grave`). The seed script doesn't generate individual fake answers
and re-run them through `bandFor()` — it directly picks a `concerning` count per
department/week, because there's no real answer set to score. **The rule this encodes is:
"concerning" = would have scored Moderado or worse.** If that clinical bar should move
(e.g., to "Moderadamente grave or worse" for a stricter signal), the only two places that
need to change are:

1. This paragraph + the `README.md` note below (update the definition).
2. `apps/api/prisma/seed.ts` (regenerate `concerning` counts against the new bar — the raw
   `checkIns` counts don't change, only how many of them get marked concerning).

Nothing else in the pipeline encodes this rule — `GetManagerSignalsUseCase` just divides
`concerning / checkIns`, it has no opinion on what "concerning" means.

### k-anonymity threshold

`K_ANONYMITY_THRESHOLD = 5`, defined once as a named constant in the `manager` module
(`apps/api/src/modules/manager/application/constants.ts`) and imported everywhere it's
checked. If the threshold should ever change, this is the one place to edit — no other
file should hardcode `5`.

### Seed parameters (the actual demo scenario)

| Department | checkIns (n) | Week 1 → Week 6 concerning rate | Purpose |
|---|---|---|---|
| Pronto-socorro | ~24/week | flat, ~35–40% | baseline "normal" department |
| Plantão noturno | ~18/week | flat, ~45–55% | baseline "elevated but stable" |
| UTI | ~9/week | **climbing 25% → 60%** | the demo narrative — visibly worsening trend |
| Ambulatório | ~3/week | irrelevant (always suppressed) | proves k=5 suppression is real, not cosmetic |

6 ISO weeks × 4 departments = 24 rows. `apps/api/prisma/seed.ts`, wired via Prisma's
standard `"prisma": { "seed": "tsx prisma/seed.ts" }` field, is **idempotent**
(`deleteMany()` then `createMany()`) — reseeding mid-demo is one command, no manual
cleanup: `pnpm --filter @zelo/api prisma:seed`.

**Document this table and the concerning-rule definition again in
`apps/api/prisma/README.md`** (new file) so both are discoverable without reading seed
script source — that file should link back to this spec rather than duplicate the
reasoning.

## 4. API endpoints

Both live in a new `apps/api/src/modules/manager/` module, following this codebase's
existing per-module layout (`application/ports`, `application/use-cases`,
`infrastructure`) as seen in `assessment` and `chat`.

### `POST /api/manager/login`

```ts
const LoginRequestSchema = z.object({ code: z.string().min(1) });
```

Compares `code` against the `MANAGER_ACCESS_CODE` env var using
`crypto.timingSafeEqual` (not `===`, to avoid a timing side-channel on a credential
comparison — cheap to do right). On match, issues a signed token:

```
token = base64url(managerSessionId + "." + expiresAtEpoch)
      + "." + HMAC-SHA256(that, MANAGER_TOKEN_SECRET)
```

`MANAGER_TOKEN_SECRET` is a second, separate env var (never the access code itself) — no
new dependency (`@nestjs/jwt` etc.) needed for a single shared credential; Node's built-in
`crypto` module covers it. Expiry: 8 hours from issuance.

Response: `200 { token: string, expiresAt: string }` on match, `401` on mismatch.

### `GET /api/manager/signals`

Requires `Authorization: Bearer <token>`, verified by a `ManagerAuthGuard`
(`CanActivate`) that recomputes the HMAC and checks expiry — reusable if more
manager-scoped endpoints get added later. `401` on missing/malformed/expired/tampered
token.

```ts
interface ManagerSignalsResponse {
  overallConcerningRate: number;   // 0-1, across all n>=5 departments
  checkInsLast4Weeks: number;      // summed across n>=5 departments, most recent 4 of the 6 seeded weeks
  weeklyTrend: { weekStart: string; concerningRate: number }[]; // 6 points, ORG-WIDE (all 4 departments summed, including the suppressed one)
  segments: { label: string; value: number; n: number }[];      // per-department, n>=5 ONLY
}
```

`weeklyTrend` is safe to compute from *all four* departments (including Ambulatório)
because it's a single summed org-wide number per week — it never isolates the small
department's contribution the way a per-department breakdown would. `segments` is where
the k=5 filter actually matters, and it's applied **before** the response object is
built: a sub-threshold department is never constructed into the array, never serialized.

## 5. Frontend changes

- **`ManagerLoginPage.tsx`** (new, route `/manager/login`) — single code field + submit,
  reusing existing `PhoneShell`/`Card`/`Button` components. On submit: `POST
  /api/manager/login`; on success, stores `{ token, expiresAt }` via a new
  `useManagerSession` Zustand store (mirrors `consent.store.ts`, persisted to
  `sessionStorage` — cleared on tab close, survives reload); navigates to `/manager`. On
  401, shows an inline error, no crash.
- **Route guard** — `router.tsx`'s `manager` route wraps `ManagerDashboardPage` in a
  `RequireManagerSession` component: reads the store, redirects to `/manager/login` if no
  valid (present + non-expired) token. `HomePage`'s existing `"Ver painel do gestor
  (demo)"` link is unchanged (`routes.manager`) — the guard handles the redirect, no
  change needed at the link's call site.
- **`ManagerDashboardPage.tsx`** — drops the hardcoded `SEGMENTS` array. Adds
  `useManagerSignals()` (`useQuery`, attaches the stored bearer token, same
  loading/empty-state shape as `useAssessmentHistory`). Adds a 6-bar org-wide trend chart
  above the per-department list, visually consistent with `HomePage`'s history chart
  (same bar-chart shape, different data source: `weeklyTrend`). A `401` response clears
  the session and redirects to `/manager/login` rather than showing a raw error.

## 6. Testing approach

**Backend** (`apps/api/src/modules/manager/`):
- `manager-auth.guard.test.ts` — valid token passes; missing / malformed / expired /
  tampered-signature token → 401.
- `login-manager.use-case.test.ts` — correct code (mocked `ConfigService`) issues a
  token; wrong code rejected; a token signed with a *different* secret fails verification.
- `get-manager-signals.use-case.test.ts` — seeds fake `SimulatedSignal` rows via a mocked
  port using **clean round numbers** (e.g. 10 check-ins / 4 concerning = exactly 40%, not
  the actual demo numbers from §3) so a reviewer can verify the arithmetic by hand.
  Asserts: the `n<5` department is genuinely absent from `segments` (not hidden
  client-side); `weeklyTrend` sums *all four* departments including the suppressed one;
  `overallConcerningRate` / `checkInsLast4Weeks` match hand-computed expected values.
- `manager.controller.test.ts` — 401 without/with-bad header, 200 with valid token,
  response shape matches schema.

**Frontend:**
- `ManagerLoginPage.test.tsx` — submit → navigate on success; inline error (not a crash)
  on 401.
- `useManagerSession` store test — mirrors `consent.store.test.ts` (persist / read /
  clear against `sessionStorage`).
- `router.test.tsx` — extend the existing route-table test to cover `/manager/login` and
  the redirect-when-unauthenticated case for `/manager`.
- `ManagerDashboardPage.test.tsx` — updated to mock `useManagerSignals`: `n<5` segment
  doesn't render; trend chart renders 6 bars; KPI cards reflect the mocked response
  instead of the old hardcoded `41%`/`111`.
- `a11y.test.tsx` — add `ManagerLoginPage` to the existing axe-core route sweep.

## 7. Out of scope (explicitly not decided here)

- Per-manager individual accounts, manager names, or role-based permissions beyond "knows
  the shared code" — one hospital, one code, matches current PoC scope.
- Any path for real doctor assessment data to ever feed this pipeline — see §1 for why
  that's a structural non-goal, not a deferred feature.
- AI-assisted interpretation of the manager dashboard's trends (e.g., an AI-generated
  summary of "what changed this week") — this is a live idea from the same conversation
  that produced this spec, deliberately deferred to a separate AI-leverage brainstorm so
  it doesn't balloon this spec's scope.
- Rotating/expiring `MANAGER_ACCESS_CODE` on a schedule, or multiple valid codes — single
  static env var is sufficient for the demo.
