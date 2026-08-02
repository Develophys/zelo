# Multi-institution data partitioning — design spec

**Status:** approved design, not yet implemented.

**Relationship to prior specs:** `2026-08-01-manager-individual-accounts-design.md` replaced the
single shared `MANAGER_ACCESS_CODE` with individual named `Manager` accounts, but explicitly
scoped out multi-institution partitioning as a non-goal ("this PoC still targets one hospital
... that redesign is deferred until a second institution actually exists"). Its resolution of
`technical-debt.md`'s TD-002 names the exact trigger for this spec: "if a second institution is
ever onboarded, insight-history scoping becomes a real requirement again ... `institutionId` on
`Manager`, filtering in `GetManagerInsightHistoryUseCase`." This spec is that trigger being
pulled — a second (and third, etc.) institution is about to be onboarded for real.

`identity-and-aggregation.md` designed a full per-doctor `User` model + magic-link auth to
support both real per-doctor identity (for `PeersPage`) and institution-gating at once. This spec
deliberately does **not** build that. It solves only "which hospital do these anonymous numbers
belong to" — a doctor-side login/identity layer remains future work, out of scope here.

This spec also replaces the manager dashboard's synthetic data source (`SimulatedSignal`, entirely
seeded/fake, disconnected from real `Assessment` submissions) with a real aggregation pipeline,
since partitioning by institution only matters once there's real per-institution data to
partition.

---

## 1. Scope

**In scope:**

- An `Institution` model and an invite-code flow that optionally links a médico's device to a
  hospital.
- A real aggregation pipeline: completed self-assessments produce an anonymous, aggregable signal
  counted toward the médico's linked institution, replacing the fully-synthetic `SimulatedSignal`
  data source.
- A device-scoped, non-reversible dedup mechanism so a single device can't inflate a department's
  k-anonymity count by resubmitting within the same week.
- `Manager` gains `institutionId`; every manager-scoped query filters by it.
- k-anonymity (n≥5, `K_ANONYMITY_THRESHOLD`) is enforced per `institutionId + department`, not
  globally.

**Explicitly out of scope:**

- Doctor login/identity, `PeersPage` — untouched, remains `identity-and-aggregation.md`'s deferred
  problem.
- Self-service institution onboarding / an admin panel. `Institution` rows are created manually
  (seed/script), the same pattern already established for `Manager` rows.
- Real employment verification. The invite code proves "entered through the right door," not
  identity — same trust model as the manager access code it replaced.
- A fixed, per-institution department picklist / org chart. `department` stays free text, typed
  once at link time.
- Migrating existing simulated data. The existing demo dataset becomes one more `Institution`
  (a seeded "Zelo Demo" institution) with its numbers unchanged; real institutions start with an
  empty `Signal` table that fills in as médicos submit.

## 2. Non-negotiables carried forward

Everything in `docs/superpowers/specs/AGENTS.md`'s Golden Rules still applies, plus
`identity-and-aggregation.md` §1's two points, restated for this spec's shape:

- **Linking a device to an institution is optional and never gates core functionality.**
  Self-assessment and chat work exactly as they do today with zero identity or institution
  requirement. A médico who never links anything loses nothing except being counted in any
  hospital's aggregate.
- **k-anonymity is enforced server-side, at write time, per institution.** The server never
  stores a per-person row for the aggregate pipeline — see §4. There is no per-person record to
  filter or leak; the counters themselves are the only thing persisted.
- **Linking creates no identity.** The `institutionId`/`department` pair and the `deviceSignalId`
  (§4) live only on the device (IndexedDB), the same pattern already shipped for
  `WhatsappLink`'s `deviceLinkToken`. Nothing server-side ties a person's name, email, or any
  other PII to an institution.

## 3. Data model

```prisma
model Institution {
  id         String   @id @default(cuid())
  name       String   @unique          // e.g. "Hospital Zelo Demo", "Hospital São Lucas"
  inviteCode String   @unique          // e.g. "hsl-2026" — distributed by the hospital/HR
  createdAt  DateTime @default(now())

  @@map("institutions")
}
```

`Manager` gains a required relation (every manager belongs to exactly one institution — no
multi-institution managers, matching the existing "every manager account is equivalent" symmetry
within its own institution):

```prisma
model Manager {
  id            String      @id @default(cuid())
  name          String      @unique
  passwordHash  String
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  createdAt     DateTime    @default(now())

  @@map("managers")
}
```

`ManagerInsight` gains the same relation, so per-institution history filtering (§6) has something
to filter on:

```prisma
model ManagerInsight {
  // ...existing fields unchanged (id, interpretation, suggestedActions, summary, generatedAt,
  // createdByManagerName)...
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
}
```

`SimulatedSignal` is renamed `Signal` and gains `institutionId` in its grouping key. The shape
(`department`, `weekStart`, `checkIns`, `concerning`) is otherwise unchanged — deliberately, so
`GetManagerSignalsUseCase`'s existing grouping/threshold logic needs minimal changes (§5):

```prisma
model Signal {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  department    String
  weekStart     DateTime
  checkIns      Int         @default(0)
  concerning    Int         @default(0)
  createdAt     DateTime    @default(now())

  @@unique([institutionId, department, weekStart])
  @@map("signals")
}
```

New table backing the dedup mechanism in §4 — deliberately minimal, a bare set of one-way hashes
with no reference back to any device, institution, or person:

```prisma
model SignalDedupKey {
  dedupKey  String   @id   // sha256(deviceSignalId + institutionId + department + weekStart)
  createdAt DateTime @default(now())

  @@map("signal_dedup_keys")
}
```

## 4. Device-to-institution linking flow

Entry points: the **Você** page (primary — same discoverability pattern already used for the
WhatsApp link flow) and a banner/button on **Home** shown only while the device has no linked
institution (secondary nudge, not an interruption to the existing onboarding sequence).

1. Médico enters an invite code (or opens a `zelo.app/h/<code>` link that pre-fills it).
2. App calls `GET /institutions/by-code/:code` → `{ id, name }` on success, 404 on an unknown
   code. No authentication — this is code-to-id resolution, not a login.
3. On success, the app asks for `department` (free text, e.g. "UTI") once.
4. The app generates a `deviceSignalId` (`crypto.randomUUID()`) if one doesn't already exist for
   this device, and persists `{ institutionId, department, deviceSignalId }` in IndexedDB — same
   mechanism as `WhatsappLink`'s `deviceLinkToken`, never transmitted as an identity, never
   associated server-side with anything else about the device.
5. **Você** now shows "Vinculado a {institution.name}" with an unlink action that only clears the
   local IndexedDB entry — there is nothing to undo server-side, because nothing identifiable was
   ever sent.

## 5. Real aggregation pipeline

Today, a completed self-assessment computes its score and risk decision 100% on-device (FR-1/
FR-2) and persists an encrypted `ciphertext` row (`Assessment`) for the médico's own history —
this is unchanged.

**New, in parallel:** if the device has a linked `{ institutionId, department }`, it additionally
fires `POST /signals/checkin`:

```json
{ "institutionId": "...", "department": "UTI", "concerning": true, "deviceSignalId": "..." }
```

No `userId`, no `scaleType`, no timestamp finer than the ISO week, and no link whatsoever to the
`ciphertext` row — two fully decoupled writes: one private (encrypted, readable only by the
device that holds the key), one anonymous-and-aggregable (never associable with a person).

Handler logic, in order:

1. Compute `weekStart` (start of the current ISO week) and
   `dedupKey = sha256(deviceSignalId + institutionId + department + weekStart)`.
2. Attempt to insert `dedupKey` into `SignalDedupKey`. On a unique-constraint conflict, the
   request has already been counted this week for this device/department — respond success
   without touching `Signal` (the client can't distinguish a fresh count from a deduped one, by
   design).
3. On a successful insert, upsert the `Signal` counters:

```ts
await prisma.signal.upsert({
  where: { institutionId_department_weekStart: { institutionId, department, weekStart } },
  update: { checkIns: { increment: 1 }, concerning: { increment: concerning ? 1 : 0 } },
  create: { institutionId, department, weekStart, checkIns: 1, concerning: concerning ? 1 : 0 },
});
```

No per-person row is ever persisted for this pipeline — the counters in `Signal` are the only
artifact. Because `dedupKey` hashes in `weekStart`, the same device is deduplicated only within
that week/department, and the hash is not reversible or correlatable across different weeks — no
longitudinal profile of a device is derivable from `SignalDedupKey`.

The demo institution ("Zelo Demo") keeps its existing seeded `Signal` rows for sales/demo
purposes — it is simply one more `Institution` row whose data happens to be fake, not a special
code path. Real institutions start with an empty `Signal` table and fill in organically.

## 6. Manager-side scoping

`ManagerAuthGuard` already attaches `request.manager = { id, name }` (shipped in
`2026-08-01-manager-individual-accounts-design.md`); it gains `institutionId`, carried in the
signed token payload alongside `managerId`/`managerName`.

Every manager-scoped use case takes `institutionId` and filters by it:

- `GetManagerSignalsUseCase.execute(institutionId)` — groups only that institution's `Signal`
  rows; the k-anonymity cut (`n >= K_ANONYMITY_THRESHOLD`) applies per
  `institutionId + department`, same mechanism as today, just with `institutionId` added to the
  grouping key.
- `GenerateManagerInsightUseCase` — saves `ManagerInsight.institutionId` alongside the existing
  `createdByManagerName`.
- `GetManagerInsightHistoryUseCase.execute(institutionId)` — **now filters** by institution. This
  is the change TD-002's resolution note anticipated: unfiltered-but-single-institution was
  correct when there was only one institution; with more than one, unfiltered would leak one
  hospital's insight history to another hospital's managers, which is a real privacy regression,
  not a UX nicety.

`LoginManagerUseCase` is otherwise unchanged (still name+password, still the same
`InvalidManagerCredentialsError` disclosure symmetry) — it simply looks up and forwards the
manager's `institutionId` alongside `id`/`name` when issuing the token.

## 7. Testing

**Backend:**

- `Institution` lookup by invite code: valid code resolves, unknown code 404s, no auth required.
- `POST /signals/checkin`: first submission for a given device/institution/department/week
  increments `Signal` counters; a second submission with the same `deviceSignalId` in the same
  week is a no-op on `Signal` but still responds success; a submission in the following week
  (different `weekStart`) increments again.
- `GetManagerSignalsUseCase`: two institutions with overlapping department names never mix
  counters; k-anonymity threshold applies per `institutionId + department`, not globally (an
  institution with `n < 5` in "UTI" is suppressed even if another institution has `n >= 5` in a
  department with the same name).
- `GetManagerInsightHistoryUseCase`: a manager from institution A never sees institution B's
  saved insights.
- `LoginManagerUseCase` / token round-trip: issued token carries the correct `institutionId`;
  tampering with it is rejected the same way tampering with `managerId`/`managerName` already is.

**Frontend:**

- Linking flow: valid code → department prompt → "Vinculado a {name}" state; invalid code shows
  an inline error, doesn't crash.
- Home banner: renders only when no institution is linked; disappears after linking.
- Unlink: clears local state, no network call assumed to succeed/fail (there's nothing
  server-side to fail).

## 8. Migration

Additive, no backfill required:

- `CREATE TABLE institutions (...)`.
- `ALTER TABLE managers ADD COLUMN institution_id ... NOT NULL` — requires a seeded `Institution`
  row to exist and every current seed `Manager` row to be assigned to it *before* the
  `NOT NULL` constraint is added (seed script order: institutions, then managers).
- `ALTER TABLE manager_insights ADD COLUMN institution_id ... NOT NULL` — same ordering
  requirement; existing seeded/demo insight rows get backfilled to the demo institution's id as
  part of the migration data, not left null (unlike `createdByManagerName`, this field is used
  for access-control filtering, so it cannot be nullable).
- `simulated_signals` renamed to `signals` with a new `institution_id` column and updated unique
  constraint; existing demo rows backfilled to the demo institution's id in the same migration.
- `CREATE TABLE signal_dedup_keys (...)`.

## 9. Out of scope (explicitly)

- Doctor login/identity, `PeersPage` — unchanged, remains a separate future spec.
- Self-service institution signup or an admin panel — `Institution` rows are seed/script-created
  only, same as `Manager` today.
- Real verification that a médico linking a code actually works at that institution.
- A per-institution department picklist / org chart — `department` stays free text.
- Cross-week correlation/cleanup of `SignalDedupKey` rows — the table grows unbounded for now; a
  retention/cleanup job is a reasonable follow-up but doesn't block this spec (rows carry no
  identifying data, so unbounded growth is a storage-cost concern, not a privacy one).
