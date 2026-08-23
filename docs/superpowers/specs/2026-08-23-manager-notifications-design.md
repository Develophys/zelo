# Manager Notifications

**Date:** 2026-08-23

## Problem

The manager panel has no way to tell a manager that anything happened. An invited manager
accepts and nobody knows; an invite lapses and nobody knows; a sector accumulates enough
check-ins to stop being suppressed and nobody knows. Worse, an invite email that Resend
rejects fails **silently** today — the admin reads "Convite enviado" for a message nobody
received (see "The email path", below).

The manager-panel redesign (`specs/manager-panel/`) ships a Notificações route in Phase 04.
This spec defines what feeds it.

## Scope

**In scope.** Three event families, chosen with the product owner:

1. **Account lifecycle** — invite accepted, invite expired, account deactivated/reactivated.
2. **Aggregate signals** — a sector crossed the k-anonymity threshold and became visible;
   a sector crossed a risk threshold.
3. **Operational health** — an invite email failed to send.

Plus the minimum fix to the email path that makes family 3 able to fire at all.

**Out of scope, deliberately.**

- *Other managers' activity* (someone generated an AI insight, created a sector). Considered
  and dropped — low value relative to noise.
- *Real-time delivery and critical-path email.* v1 delivers on panel load plus a manual
  refresh. The design reserves the seam for both; see "Extension points".
- *A message broker.* See "Why not RabbitMQ (yet)".
- *Configurable thresholds.* The risk thresholds live in code, read from one module. Making
  them editable is its own spec (`AppSettings`), and that spec — not this one — owns the
  question of which constants may safely become preferences.

## Data model

```prisma
model Notification {
  id            String           @id @default(cuid())
  institutionId String
  institution   Institution      @relation(fields: [institutionId], references: [id])
  managerId     String
  manager       Manager          @relation(fields: [managerId], references: [id], onDelete: Cascade)
  type          NotificationType
  payload       Json
  sectorId      String?
  readAt        DateTime?
  createdAt     DateTime         @default(now())
  dedupKey      String

  @@unique([managerId, dedupKey])
  @@index([managerId, readAt])
  @@map("notifications")
}

enum NotificationType {
  INVITE_ACCEPTED
  INVITE_EXPIRED
  INVITE_EMAIL_FAILED
  ACCOUNT_DEACTIVATED
  ACCOUNT_REACTIVATED
  SECTOR_BECAME_VISIBLE
  SECTOR_RISK_THRESHOLD
}
```

### Fan-out on write

One row per recipient, written when the event happens — not one row per event resolved
against a visibility rule at read time.

The practical reason is that `readAt` lives on the row itself, needing no join table, and the
panel's query is a single `WHERE managerId = ?`.

The reason that decides it is privacy. Fan-out on write resolves the audience **at the instant
of the event**. If a manager is later assigned to the UTI sector, they do not retroactively
gain sight of the UTI's risk notification from three weeks ago. With fan-out on read they
would, because the visibility rule would be re-evaluated against their new sectors.

### `payload`, not rendered text

`payload` carries the event's structured facts (`managerName`, `sectorName`, `weekStart`,
`rate`), and the PT-BR copy is assembled in the frontend. Fixing a sentence is then a frontend
change, not a migration, and the normative strings stay where the layout spec already keeps
them.

### `dedupKey`

Identifies the **event**, not the row; uniqueness is per recipient via
`@@unique([managerId, dedupKey])`. Every write goes through
`createMany({ skipDuplicates: true })`, which makes both producer retries and a
double-executed sweep idempotent for free. This follows the `SignalDedupKey` pattern already
in the schema.

### Retention

The daily sweep deletes read notifications older than **90 days**. Unread notifications are
never purged — an unread row is an unfinished task, and its age is not a reason to hide it.

## Recipients

Resolved inside `publish`, never by the producer.

| Event | Recipients |
|---|---|
| `INVITE_ACCEPTED`, `INVITE_EXPIRED`, `INVITE_EMAIL_FAILED` | Active `HOSPITAL_ADMIN` of the institution |
| `ACCOUNT_DEACTIVATED`, `ACCOUNT_REACTIVATED` | Active `HOSPITAL_ADMIN` of the institution |
| `SECTOR_BECAME_VISIBLE`, `SECTOR_RISK_THRESHOLD` | Active `HOSPITAL_ADMIN` + the `SECTOR_MANAGER` assigned to that sector |

**Invariant — no notification is delivered to someone who could not already list the data it
cites.** This is not a convention to remember; it is a test. For every event carrying a
`sectorId`, each resolved recipient must pass `ResolveAccessibleSectorIdsUseCase` for that
sector. That use case already exists and is already the authority on sector visibility, so the
notification path cannot drift from the panel's own rule.

A manager whose `isActive` is false receives nothing.

## Event triggers

| Event | Fires from | `dedupKey` |
|---|---|---|
| `INVITE_ACCEPTED` | `FinishManagerSetupUseCase`, `FinishPeerPartnerSetupUseCase` | `invite-accepted:<kind>:<id>` |
| `ACCOUNT_DEACTIVATED` / `ACCOUNT_REACTIVATED` | `UpdateManagerUseCase`, `UpdatePeerPartnerUseCase`, when `isActive` changes | `account-status:<id>:<changedAt ISO>` |
| `INVITE_EMAIL_FAILED` | `CreateManagerUseCase`, `CreatePeerPartnerUseCase`, `SendManagerSetPasswordEmailUseCase`, `SendPeerPartnerSetPasswordEmailUseCase` | `invite-email-failed:<kind>:<id>:<attemptAt ISO>` |
| `SECTOR_BECAME_VISIBLE` | `RecordSignalCheckinUseCase` | `sector-visible:<sectorId>:<weekStart>` |
| `INVITE_EXPIRED` | daily sweep | `invite-expired:<kind>:<id>:<setPasswordTokenExpiresAt ISO>` |
| `SECTOR_RISK_THRESHOLD` | weekly sweep | `sector-risk:<sectorId>:<weekStart>` |

Account-status keys include the change instant so a genuine deactivate → reactivate →
deactivate sequence produces three notifications, while a retry of any one of them produces
one.

The expired-invite key carries the token's expiry instant, not a sweep timestamp, for the
same reason: a resend rotates `setPasswordTokenExpiresAt`, and if that resend also lapses it
is a genuinely new event that must re-notify, while repeated nightly sweeps over an
*unchanged* invite (the token was never rotated) must keep producing the same key and
therefore exactly one row.

### `SECTOR_BECAME_VISIBLE` needs no scheduler

`PrismaSignalCheckinRepository` upserts with `checkIns: { increment: 1 }`, and Prisma's upsert
returns the updated row. Within a single `(institutionId, sectorId, weekStart)` row `checkIns`
only ever increases, so the increment whose result equals `K_ANONYMITY_THRESHOLD` is, by
construction, the one that crossed it — and there is exactly one such increment per sector per
week. An equality check is the whole implementation: no extra state, no flapping, no sweep.

### `SECTOR_RISK_THRESHOLD` is weekly, and that is not an implementation detail

The rate moves in both directions as check-ins arrive. A sector sitting at 4/10 on Wednesday
is at 40% and would fire; if the week closes at 4/25 it was 16% and the alarm was false. A
manager cannot un-see an alarm, so a false one costs more than a late one. The rate is only
meaningful once its denominator is settled, which is why this event is evaluated after the
week closes rather than on each check-in.

Two rules, both requiring `checkIns >= RISK_MIN_CHECK_INS`:

- **Level** — `concerning / checkIns >= RISK_RATE_THRESHOLD`
- **Delta** — the rate rose by `RISK_DELTA_THRESHOLD` or more against the previous week, which
  must itself have `checkIns >= RISK_MIN_CHECK_INS`

`payload.trigger` records which rule fired (`"level"` or `"delta"`), because a notification
that cannot say why it appeared is not actionable.

```ts
// modules/notification/application/thresholds.ts — the single point AppSettings will later replace
export const RISK_RATE_THRESHOLD = 0.4;
export const RISK_MIN_CHECK_INS = 10;
export const RISK_DELTA_THRESHOLD = 0.15;
export const RETENTION_DAYS = 90;
export const LAPSED_INVITE_WINDOW_DAYS = 30;
```

**Why `RISK_MIN_CHECK_INS` is 10 and not 5.** At the k-anonymity floor a single person moves
the rate by 20 points: 2/5 is 40% and 3/5 is 60%. A rate threshold applied at `n = 5` fires and
un-fires every week on noise and means nothing. Requiring a denominator above the visibility
floor is what makes the number a signal. Small sectors stay visible in the panel; they simply
do not generate this alert.

## Scheduler

`@nestjs/schedule` (a new dependency). Two jobs, both in UTC, matching `startOfIsoWeek`, which
already anchors everything to Monday 00:00 UTC.

| Cron | Job |
|---|---|
| `0 3 * * *` | Expired invites; purge read notifications older than `RETENTION_DAYS` |
| `0 3 * * 1` | Risk evaluation for the week that just closed |

Fly runs a single machine (`min_machines_running = 1`, `auto_stop_machines = false`), so no
leader election is needed. If the deployment ever grows a second machine, `dedupKey` already
makes a doubly-executed sweep produce one row — the same protection `SignalDedupKey` gives the
check-in path today.

**Expired invites.** Expiry is not an event: nothing happens at the moment
`setPasswordTokenExpiresAt` passes. The daily sweep selects managers and peer partners with
`passwordHash IS NULL` and `setPasswordTokenExpiresAt` in the last `LAPSED_INVITE_WINDOW_DAYS`
(30) days, up to `now()`, and publishes once per account per expiry instant (the `dedupKey`
carries that instant, so repeated sweeps over an *unchanged* invite notify exactly once, while
a resend that rotates the token's expiry is treated as a new lapse and notifies again).

The lower bound exists because `dedupKey` alone is not enough to prevent re-notification once
the retention sweep is in the picture: without it, `findLapsedInvites` would keep re-selecting
every never-accepted invite forever, and a read `INVITE_EXPIRED` row purged at `RETENTION_DAYS`
would let the next sweep write the same row again. `LAPSED_INVITE_WINDOW_DAYS` sits well under
`RETENTION_DAYS` so an invite ages out of the sweep's consideration long before its
notification could be purged and resurface.

The trade this makes explicit: an invite that lapsed more than `LAPSED_INVITE_WINDOW_DAYS` ago
and was never notified about — because it predates this feature, or because a sweep was down —
stays un-nudged. There is no backfill. This is not unrecoverable: the admin's manager list still
shows "Convite expirado" from the row itself (`passwordHash IS NULL`), independent of whether a
notification was ever written for it — only the proactive nudge is missed, not the information.

## The seam

```ts
// modules/notification/application/ports/notification-publisher.port.ts
export const NOTIFICATION_PUBLISHER = Symbol("NOTIFICATION_PUBLISHER");

export interface NotificationEvent {
  institutionId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sectorId?: string;
  dedupKey: string;
}

export interface NotificationPublisher {
  publish(event: NotificationEvent): Promise<void>;
}
```

Producers inject `NOTIFICATION_PUBLISHER` and know nothing else — same ports-and-adapters shape
the codebase already uses for `SIGNAL_REPOSITORY` and `EMAIL_PORT`. The v1 implementation
resolves recipients and writes rows. That is the entire delivery mechanism: the in-app channel
*is* the persistence.

Publishing never fails the producer. A notification that cannot be written must not roll back
an accepted invite. `publish` catches and logs; the caller is not told.

### Extension points

The value of the seam is what it costs to add a channel later:

| When it arrives | What changes | Producers change? |
|---|---|---|
| Real-time | `publish` emits on a Socket.IO gateway after writing | no |
| Critical-path email | `publish` writes an outbox row; a dispatcher drains it | no |
| RabbitMQ | the dispatcher becomes a consumer | no |

No machinery for any of these is built now. The deliverable is the single point of contact,
not the infrastructure behind it.

### Why not RabbitMQ (yet)

A broker earns its place when a producer cannot wait for its consumer, when volume exceeds what
the API can absorb, or when consumers must live outside the producing process. None of the
three holds here: these are very low-volume events, produced and consumed by the same NestJS
process that already serves the panel, on one machine. Against that, a broker adds
infrastructure to operate, a connection to manage, and integration tests that need a broker
running.

What Postgres buys here is more modest than "exactly-once": `publish` runs as its own write,
after the producer's own write has already committed — not inside the same transaction as the
fact that caused it. A crash between the two loses the notification, with nothing to retry it.
This is the direct consequence of "publishing never fails the producer" (above): the two writes
cannot be one transaction, because a failure in the notification write must never roll back — or
block on — the fact that caused it. The trade is deliberate: an accepted invite, a deactivated
account or a crossed threshold either happened or it didn't, and that must never hinge on
whether its notification also landed. What's lost on the rare crash-in-the-gap is one nudge, not
the underlying fact — the invite is still accepted, the account is still deactivated, the panel
still shows the sector's data. A broker would not close this gap either, only relocate it to
between the producer and the broker.

The moment it does pay for itself is the first consumer that must live outside the API process
— serious retrying email, or a digest worker. At that point the dispatcher changes transport
and nothing else moves.

## The email path

Family 3 cannot fire while the email adapter cannot tell that it failed. Two live defects:

**1. Failures are invisible.** `ResendEmailAdapter.send` awaits `client.emails.send(...)` and
discards the result. The Resend SDK does not throw on API-level failure — it resolves with
`{ data, error }`. An unverified domain, an invalid address or a rate limit therefore resolves
normally, the use case continues, and the admin reads "Convite enviado para paulo@hospital.com"
when nobody was emailed.

**2. A thrown failure leaves a half-created manager.** When `send` does throw (network), it
throws *after* the manager row and sector reassignment are committed
(`create-manager.use-case.ts`). The request returns 500 but the manager exists. The admin
retries, hits the unique-email constraint, and is stuck with an account they cannot recreate
and whose invite never went out.

Minimum fix, in this spec:

```ts
// ResendEmailAdapter
const { error } = await this.client.emails.send({ from, to, subject, html });
if (error) throw new EmailDeliveryError(error.message);

// CreateManagerUseCase (and the three sibling use-cases)
try {
  await this.emailPort.send(...);
} catch (cause) {
  await this.notifications.publish({ type: "INVITE_EMAIL_FAILED", ... });
}
return { manager };   // 201 either way — the account was genuinely created
```

The account is created, the failure is recorded, and the row shows "Convite pendente" with the
"Reenviar convite" action that already exists. No 500, no orphan.

Automatic retry is deliberately not included: it needs per-attempt state and an attempt ceiling,
and the manual resend already covers the case.

## HTTP contract

```
GET   /manager/notifications?cursor=&limit=   -> Page<NotificationDto>
GET   /manager/notifications/unread-count     -> { count: number }
PATCH /manager/notifications/:id/read         -> 204
POST  /manager/notifications/read-all         -> 204
```

```ts
interface NotificationDto {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sectorName: string | null;
  readAt: string | null;
  createdAt: string;
}
```

The list returns the `Page<T>` shape (`items` / `nextCursor` / `total`) that Phase 05 of the
manager-panel plan adopts for every list. Starting there costs nothing now and avoids
Notificações being the one list that has to migrate later.

`unread-count` is its own endpoint because the badge appears on every panel screen. Folding the
count into the list response would force the shell to fetch a page it never renders.

Every endpoint is scoped to the caller's own `managerId`. Reading or marking another manager's
notification is a 404, not a 403 — the existence of the row is itself information.

## Frontend

`ManagerUnreadBadge` and its rules (`99+` cap with the true count in the accessible name, dot
in the collapsed rail) already exist from Phase 03 and do not change. What changes is the
source: `useManagerUnreadCount()` reads the API instead of a local store, and
`src/stores/manager-notifications.store.ts` — scaffolding created in Phase 03 so the badge had
something to read — **is deleted**.

- `ManagerNotificationsPage` renders the list per the layout spec's Phase 04-E.
- Clicking a row marks it read with an optimistic update; the badge decrements immediately and
  reconciles on settle.
- An **"Atualizar"** button invalidates both queries. It is the manual stand-in for push until a
  real-time channel exists, and it stays afterwards: a visible way to refetch is worth keeping
  for anyone whose connection dropped.
- Empty state: "Nenhuma notificação por aqui." plus one line of reassurance.

### Copy (normative, PT-BR)

| Type | Evento | Detalhe |
|---|---|---|
| `INVITE_ACCEPTED` | Convite aceito | `{name}` concluiu o cadastro e já tem acesso. |
| `INVITE_EXPIRED` | Convite expirado | O convite de `{name}` expirou sem ser usado. |
| `INVITE_EMAIL_FAILED` | Falha no envio do convite | Não foi possível enviar o convite para `{email}`. |
| `ACCOUNT_DEACTIVATED` | Conta desativada | `{name}` não tem mais acesso ao painel. |
| `ACCOUNT_REACTIVATED` | Conta reativada | `{name}` voltou a ter acesso ao painel. |
| `SECTOR_BECAME_VISIBLE` | Setor com dados visíveis | `{sector}` atingiu respostas suficientes e já pode ser acompanhado. |
| `SECTOR_RISK_THRESHOLD` (level) | Setor acima do limiar | `{sector}` fechou a semana com `{rate}` de respostas preocupantes. |
| `SECTOR_RISK_THRESHOLD` (delta) | Piora no setor | `{sector}` subiu `{delta}` em relação à semana anterior. |

## Testing

The tests that catch real regression, named because they are the point:

- **The privacy invariant.** For every event type carrying a `sectorId`, every resolved
  recipient passes `ResolveAccessibleSectorIdsUseCase` for that sector. Table-driven over the
  full `NotificationType` enum, so a new type cannot be added without being covered.
- **Visibility fires exactly once.** Simulate a week of increments from 1 to 12 check-ins and
  assert exactly one `SECTOR_BECAME_VISIBLE`.
- **The risk rule, including what must not fire.** Table-driven: `n=12` at 41.7% fires;
  `n=6` at 50% does not (below `RISK_MIN_CHECK_INS`); `n=20` at 30% does not; a 19-point rise
  fires on delta; a 2-point rise does not.
- **Sweep idempotency.** Run each sweep twice; assert one row.
- **Expired invites notify once.** Run the daily sweep across several simulated days over the
  same lapsed invite; assert one row.
- **A failed email does not fail account creation.** `emailPort.send` rejects;
  `CreateManagerUseCase` still returns the manager and publishes `INVITE_EMAIL_FAILED`.
- **A failed publish does not fail the producer.** `publish` rejects; the invite is still
  accepted.
- **Cross-manager access.** Manager A marking B's notification read gets 404.
- **Web.** Page states (empty, unread, read); optimistic read decrements the badge and restores
  it on failure; "Atualizar" refetches.

## Migration order

1. Prisma model, enum, migration.
2. `NotificationPublisher` port + v1 implementation + recipient resolution, with tests.
3. Wire the synchronous producers (invite accepted, account status, sector became visible).
4. Email path fix + `INVITE_EMAIL_FAILED`.
5. `@nestjs/schedule` + the two sweeps.
6. HTTP endpoints.
7. Frontend: delete the placeholder store, point the badge at the API, build the page.
