# Manager Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the manager panel a notifications feed covering account lifecycle, aggregate signals and operational health, delivered on panel load with a manual refresh.

**Architecture:** Producers call one port, `NotificationPublisher.publish(event)`, and know nothing about delivery. The v1 implementation resolves recipients (by role and sector) and writes one row per recipient — fan-out on write, so a notification's audience is fixed at the instant of the event. Two scheduled sweeps cover the events that time causes rather than code: lapsed invites and the weekly risk evaluation.

**Tech Stack:** NestJS 10 + Prisma 7 + Postgres (`apps/api`); React 19 + Vite + TanStack Query v5 + Zustand (`apps/web`); Vitest + supertest everywhere.

**Spec:** `docs/superpowers/specs/2026-08-23-manager-notifications-design.md`

## Global Constraints

- **Ports, not classes.** Producers depend on `NOTIFICATION_PUBLISHER` (a `Symbol`), never on a concrete class. This is the existing pattern — see `SIGNAL_REPOSITORY`, `EMAIL_PORT`.
- **Domain types are TS unions, not Prisma enums.** `NotificationType` is declared in the port file. Prisma's enum mirrors it. Files under `application/` must never import from `generated/prisma`. This matches `ManagerRole` in `manager-repository.port.ts` and is enforced by `pnpm --filter @zelo/api lint:boundaries`.
- **Publishing never fails the producer.** `publish` catches and logs; a notification that cannot be written must not roll back an accepted invite.
- **Privacy invariant.** No notification reaches a manager who could not already list the data it cites. Enforced in `ResolveNotificationRecipientsUseCase` and tested per type.
- **PT-BR copy is normative.** Strings in this plan are the copy. Do not paraphrase.
- **Thresholds live in one module.** `modules/notification/application/thresholds.ts`. Nothing else may hardcode `0.4`, `10`, `0.15` or `90`.
- **Imports carry the `.ts` extension** in `apps/api` (NodeNext resolution). Copy the style of neighbouring files.
- **Every task ends with a commit.** Run `pnpm --filter @zelo/api test` (or `--filter web`) before committing.

### Values fixed by this plan

```text
RISK_RATE_THRESHOLD   = 0.4     RISK_MIN_CHECK_INS = 10
RISK_DELTA_THRESHOLD  = 0.15    RETENTION_DAYS     = 90
```

### Note on the database

The Neon dev database periodically exhausts its compute quota, which makes every Prisma CLI command fail for reasons unrelated to the code. If `prisma migrate dev` fails to connect, that is the quota, not the migration. Tests in this plan never touch a database — every repository is faked — so a quota outage blocks only Task 2's migration step.

---

## File Structure

**New — `apps/api/src/modules/notification/`**

| File | Responsibility |
|---|---|
| `application/ports/notification.port.ts` | `NotificationType`, `NotificationEvent`, `NotificationPublisher`, `NOTIFICATION_PUBLISHER` |
| `application/ports/notification-repository.port.ts` | Persistence contract + row/page shapes |
| `application/thresholds.ts` | The four tunable numbers, in one place |
| `application/use-cases/resolve-notification-recipients.use-case.ts` | Role and sector rules — the privacy invariant |
| `application/use-cases/publish-notification.use-case.ts` | `NotificationPublisher` implementation: resolve, then persist |
| `application/use-cases/list-notifications.use-case.ts` | Paged read + unread count |
| `application/use-cases/mark-notification-read.use-case.ts` | Single and bulk read |
| `application/use-cases/sweep-lapsed-invites.use-case.ts` | Daily: expired invites |
| `application/use-cases/sweep-notification-retention.use-case.ts` | Daily: purge read rows past `RETENTION_DAYS` |
| `application/use-cases/sweep-sector-risk.use-case.ts` | Weekly: level and delta rules |
| `infrastructure/persistence/prisma-notification.repository.ts` | Prisma adapter |
| `infrastructure/notification.controller.ts` | The four HTTP endpoints |
| `infrastructure/notification-scheduler.ts` | `@Cron` wrappers — no logic of its own |
| `notification.module.ts` | Wiring |

**Modified — `apps/api`**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `Notification` model + `NotificationType` enum |
| `src/app.module.ts` | Import `ScheduleModule` and `NotificationModule` |
| `src/modules/manager/application/ports/manager-repository.port.ts` | `findActiveHospitalAdminIds`, `findLapsedInvites` |
| `src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts` | Implement both |
| `src/modules/peer-partner/application/ports/peer-partner-repository.port.ts` | `findLapsedInvites` |
| `src/modules/peer-partner/infrastructure/persistence/prisma-peer-partner.repository.ts` | Implement it |
| `src/modules/sector/application/ports/sector-repository.port.ts` | Widen `findById` with `name` and `managerId` |
| `src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts` | Widen the select |
| `src/modules/manager/application/ports/signal-repository.port.ts` | `findAllForWeek` |
| `src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts` | Implement it |
| `src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts` | `recordCheckin` returns `{ checkIns } \| null` |
| `src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts` | Return the upserted row |
| `src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts` | Publish on the k-crossing |
| `src/modules/manager/application/use-cases/finish-manager-setup.use-case.ts` | Publish `INVITE_ACCEPTED` |
| `src/modules/peer-partner/application/use-cases/finish-peer-partner-setup.use-case.ts` | Publish `INVITE_ACCEPTED` |
| `src/modules/manager/application/use-cases/update-manager.use-case.ts` | Publish on `isActive` change |
| `src/modules/manager/application/use-cases/create-manager.use-case.ts` | Catch send failure, publish, still return |
| `src/modules/manager/application/use-cases/create-peer-partner.use-case.ts` | Same |
| `src/modules/manager/application/use-cases/send-manager-set-password-email.use-case.ts` | Same |
| `src/modules/manager/application/use-cases/send-peer-partner-set-password-email.use-case.ts` | Same |
| `src/shared/email/email.port.ts` | `EmailDeliveryError` |
| `src/shared/email/resend-email.adapter.ts` | Check the SDK's `error` |

**New / modified — `apps/web`**

| File | Change |
|---|---|
| `src/ports/manager-notifications.port.ts` | **New** — zod schemas + port |
| `src/use-cases/list-manager-notifications.usecase.ts` | **New** |
| `src/use-cases/mark-manager-notification-read.usecase.ts` | **New** |
| `src/infrastructure/http/http-manager-notifications.adapter.ts` | **New** |
| `src/app/container/manager-notifications.ts` | **New** — wiring |
| `src/presentation/hooks/useManagerNotifications.ts` | **New** — list + unread count + mutations |
| `src/presentation/pages/ManagerNotificationsPage.tsx` | Replace the placeholder |
| `src/presentation/layout/ManagerSidebar.tsx` | Read the count from the hook |
| `src/presentation/layout/ManagerBottomNav.tsx` | Same |
| `src/stores/manager-notifications.store.ts` | **Delete** — Phase 03 scaffolding |

---

## Task 1: Recipient resolution and the privacy invariant

Pure logic, no database, no schema. This is the piece the whole feature's safety rests on, so it is built and tested first.

**Files:**
- Create: `apps/api/src/modules/notification/application/ports/notification.port.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/resolve-notification-recipients.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/ports/manager-repository.port.ts`
- Modify: `apps/api/src/modules/sector/application/ports/sector-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts`
- Modify: `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`
- Test: `apps/api/src/modules/notification/application/use-cases/resolve-notification-recipients.use-case.test.ts`

**Interfaces:**
- Consumes: `ManagerRepository`, `MANAGER_REPOSITORY`, `SectorRepository`, `SECTOR_REPOSITORY` — all existing.
- Produces:
  - `type NotificationType` — the seven-member union below.
  - `interface NotificationEvent { institutionId: string; type: NotificationType; payload: Record<string, unknown>; sectorId?: string; dedupKey: string }`
  - `interface NotificationPublisher { publish(event: NotificationEvent): Promise<void> }`
  - `const NOTIFICATION_PUBLISHER: symbol`
  - `class ResolveNotificationRecipientsUseCase` with `execute(event: NotificationEvent): Promise<string[]>` returning manager ids.
  - `ManagerRepository.findActiveHospitalAdminIds(institutionId: string): Promise<string[]>`
  - `SectorRepository.findById(id)` widened to `Promise<{ id: string; institutionId: string; name: string; managerId: string | null } | null>`

- [ ] **Step 1: Create the port file**

`apps/api/src/modules/notification/application/ports/notification.port.ts`:

```ts
// A TS union rather than the Prisma enum: files under application/ must not
// import from generated/prisma (lint:boundaries enforces this). The Prisma
// enum in schema.prisma mirrors this list — they are kept in step by hand,
// the same way ManagerRole already is.
export type NotificationType =
  | "INVITE_ACCEPTED"
  | "INVITE_EXPIRED"
  | "INVITE_EMAIL_FAILED"
  | "ACCOUNT_DEACTIVATED"
  | "ACCOUNT_REACTIVATED"
  | "SECTOR_BECAME_VISIBLE"
  | "SECTOR_RISK_THRESHOLD";

export interface NotificationEvent {
  institutionId: string;
  type: NotificationType;
  /** Structured facts only. The PT-BR sentence is assembled in the frontend. */
  payload: Record<string, unknown>;
  sectorId?: string;
  /** Identifies the event, not the row. Uniqueness is per recipient. */
  dedupKey: string;
}

export interface NotificationPublisher {
  publish(event: NotificationEvent): Promise<void>;
}

export const NOTIFICATION_PUBLISHER = Symbol("NOTIFICATION_PUBLISHER");
```

- [ ] **Step 2: Widen the two repository ports**

In `apps/api/src/modules/manager/application/ports/manager-repository.port.ts`, add to the `ManagerRepository` interface:

```ts
  findActiveHospitalAdminIds(institutionId: string): Promise<string[]>;
```

In `apps/api/src/modules/sector/application/ports/sector-repository.port.ts`, replace the `findById` line:

```ts
  findById(id: string): Promise<{ id: string; institutionId: string; name: string; managerId: string | null } | null>;
```

- [ ] **Step 3: Write the failing test**

`apps/api/src/modules/notification/application/use-cases/resolve-notification-recipients.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ResolveNotificationRecipientsUseCase } from "./resolve-notification-recipients.use-case.ts";
import type { NotificationEvent, NotificationType } from "../ports/notification.port.ts";
import type { ManagerRepository } from "../../../manager/application/ports/manager-repository.port.ts";
import type { SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";

const INSTITUTION = "institution-1";

class FakeManagerRepository {
  adminIds: string[] = ["admin-1", "admin-2"];
  async findActiveHospitalAdminIds(institutionId: string): Promise<string[]> {
    return institutionId === INSTITUTION ? this.adminIds : [];
  }
}

class FakeSectorRepository {
  sector: { id: string; institutionId: string; name: string; managerId: string | null } | null = {
    id: "sector-1",
    institutionId: INSTITUTION,
    name: "UTI",
    managerId: "sector-manager-1",
  };
  async findById(id: string) {
    return this.sector && this.sector.id === id ? this.sector : null;
  }
}

function build(managers = new FakeManagerRepository(), sectors = new FakeSectorRepository()) {
  return new ResolveNotificationRecipientsUseCase(
    managers as unknown as ManagerRepository,
    sectors as unknown as SectorRepository,
  );
}

function event(type: NotificationType, sectorId?: string): NotificationEvent {
  return { institutionId: INSTITUTION, type, payload: {}, sectorId, dedupKey: `${type}:x` };
}

const ACCOUNT_TYPES: NotificationType[] = [
  "INVITE_ACCEPTED",
  "INVITE_EXPIRED",
  "INVITE_EMAIL_FAILED",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_REACTIVATED",
];

const SECTOR_TYPES: NotificationType[] = ["SECTOR_BECAME_VISIBLE", "SECTOR_RISK_THRESHOLD"];

describe("ResolveNotificationRecipientsUseCase", () => {
  it.each(ACCOUNT_TYPES)("sends %s to every active hospital admin and nobody else", async (type) => {
    const recipients = await build().execute(event(type));
    expect(recipients).toEqual(["admin-1", "admin-2"]);
  });

  it.each(SECTOR_TYPES)("sends %s to the admins plus the sector's own manager", async (type) => {
    const recipients = await build().execute(event(type, "sector-1"));
    expect(recipients.sort()).toEqual(["admin-1", "admin-2", "sector-manager-1"]);
  });

  it("does not duplicate a recipient who is both an admin and the sector's manager", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = { id: "sector-1", institutionId: INSTITUTION, name: "UTI", managerId: "admin-1" };
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_RISK_THRESHOLD", "sector-1"),
    );
    expect(recipients).toEqual(["admin-1", "admin-2"]);
  });

  it("delivers nothing about a sector that belongs to another institution", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = { id: "sector-1", institutionId: "institution-2", name: "UTI", managerId: "sector-manager-1" };
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_RISK_THRESHOLD", "sector-1"),
    );
    expect(recipients).toEqual([]);
  });

  it("delivers nothing when the sector no longer exists", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = null;
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_BECAME_VISIBLE", "sector-1"),
    );
    expect(recipients).toEqual([]);
  });

  it("reaches the admins even when the sector has no manager assigned", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = { id: "sector-1", institutionId: INSTITUTION, name: "UTI", managerId: null };
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_BECAME_VISIBLE", "sector-1"),
    );
    expect(recipients).toEqual(["admin-1", "admin-2"]);
  });

  // The invariant, stated as a test: a sector-scoped event must not resolve a
  // recipient by any path other than "admin of that institution" or "manager of
  // that exact sector". A future type added without a rule must fail here.
  it("never resolves a sector event to a manager of a different sector", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = { id: "sector-1", institutionId: INSTITUTION, name: "UTI", managerId: "sector-manager-1" };
    const managers = new FakeManagerRepository();
    managers.adminIds = [];
    const recipients = await build(managers, sectors).execute(event("SECTOR_RISK_THRESHOLD", "sector-1"));
    expect(recipients).toEqual(["sector-manager-1"]);
  });

  it("treats a sector-scoped event with no sectorId as undeliverable rather than institution-wide", async () => {
    const recipients = await build().execute(event("SECTOR_RISK_THRESHOLD"));
    expect(recipients).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test and watch it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: FAIL — `Cannot find module './resolve-notification-recipients.use-case.ts'`

- [ ] **Step 5: Implement the use case**

`apps/api/src/modules/notification/application/use-cases/resolve-notification-recipients.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../../../manager/application/ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import type { NotificationEvent, NotificationType } from "../ports/notification.port.ts";

const SECTOR_SCOPED: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "SECTOR_BECAME_VISIBLE",
  "SECTOR_RISK_THRESHOLD",
]);

@Injectable()
export class ResolveNotificationRecipientsUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  // The privacy rule, in one place: a recipient is either an active hospital
  // admin of the event's institution, or the manager of the exact sector the
  // event names. There is no third path, which is what keeps a notification
  // from ever being wider than the data it cites.
  async execute(event: NotificationEvent): Promise<string[]> {
    if (!SECTOR_SCOPED.has(event.type)) {
      return this.managerRepository.findActiveHospitalAdminIds(event.institutionId);
    }

    if (!event.sectorId) return [];

    const sector = await this.sectorRepository.findById(event.sectorId);
    // A sector from another institution is not merely the wrong audience — it
    // means the event is malformed, so nobody hears about it.
    if (!sector || sector.institutionId !== event.institutionId) return [];

    const admins = await this.managerRepository.findActiveHospitalAdminIds(event.institutionId);
    const recipients = new Set(admins);
    if (sector.managerId) recipients.add(sector.managerId);
    return [...recipients];
  }
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: PASS — 8 tests.

- [ ] **Step 7: Implement the two widened repository methods**

In `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts`, add:

```ts
  async findActiveHospitalAdminIds(institutionId: string): Promise<string[]> {
    const rows = await this.prisma.manager.findMany({
      where: { institutionId, role: "HOSPITAL_ADMIN", isActive: true },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
```

In `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`, replace the body of `findById`:

```ts
  async findById(
    id: string,
  ): Promise<{ id: string; institutionId: string; name: string; managerId: string | null } | null> {
    return this.prisma.sector.findUnique({
      where: { id },
      select: { id: true, institutionId: true, name: true, managerId: true },
    });
  }
```

- [ ] **Step 8: Run the whole API suite and lint**

Run: `pnpm --filter @zelo/api test && pnpm --filter @zelo/api lint && pnpm --filter @zelo/api lint:boundaries`
Expected: PASS. Any existing test that fakes `ManagerRepository` or `SectorRepository` now fails to typecheck until it implements the new method — add it to those fakes, throwing `new Error("not used in this test")`, matching the style already in `finish-manager-setup.use-case.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/notification apps/api/src/modules/manager apps/api/src/modules/sector
git commit -m "feat(api): resolve notification recipients by role and sector"
```

---

## Task 2: Schema, repository and the publisher

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/modules/notification/application/ports/notification-repository.port.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/publish-notification.use-case.ts`
- Create: `apps/api/src/modules/notification/infrastructure/persistence/prisma-notification.repository.ts`
- Create: `apps/api/src/modules/notification/notification.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/notification/application/use-cases/publish-notification.use-case.test.ts`

**Interfaces:**
- Consumes: `ResolveNotificationRecipientsUseCase`, `NotificationEvent`, `NOTIFICATION_PUBLISHER` (Task 1).
- Produces:
  - `interface CreateNotificationParams { institutionId: string; managerId: string; type: NotificationType; payload: Record<string, unknown>; sectorId: string | null; dedupKey: string }`
  - `interface NotificationRow { id: string; type: NotificationType; payload: Record<string, unknown>; sectorId: string | null; sectorName: string | null; readAt: Date | null; createdAt: Date }`
  - `interface NotificationPage { items: NotificationRow[]; nextCursor: string | null; total: number | null }`
  - `interface NotificationRepository` with `createMany`, `findPage`, `countUnread`, `markRead`, `markAllRead`, `deleteReadOlderThan`
  - `const NOTIFICATION_REPOSITORY: symbol`
  - `class PublishNotificationUseCase implements NotificationPublisher`
  - `class NotificationModule` exporting `NOTIFICATION_PUBLISHER`

- [ ] **Step 1: Add the Prisma model**

Append to `apps/api/prisma/schema.prisma`:

```prisma
enum NotificationType {
  INVITE_ACCEPTED
  INVITE_EXPIRED
  INVITE_EMAIL_FAILED
  ACCOUNT_DEACTIVATED
  ACCOUNT_REACTIVATED
  SECTOR_BECAME_VISIBLE
  SECTOR_RISK_THRESHOLD
}

model Notification {
  id            String           @id @default(cuid())
  institutionId String
  institution   Institution      @relation(fields: [institutionId], references: [id])
  managerId     String
  manager       Manager          @relation(fields: [managerId], references: [id], onDelete: Cascade)
  type          NotificationType
  payload       Json
  sectorId      String?
  sector        Sector?          @relation(fields: [sectorId], references: [id], onDelete: SetNull)
  readAt        DateTime?
  createdAt     DateTime         @default(now())
  // Identifies the event; uniqueness is per recipient, because one event
  // fans out to one row per manager.
  dedupKey      String

  @@unique([managerId, dedupKey])
  @@index([managerId, readAt])
  @@map("notifications")
}
```

Add the back-relations Prisma requires — `notifications Notification[]` on `Institution`, on `Manager`, and on `Sector`.

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @zelo/api exec prisma migrate dev --name add_notifications`
Expected: a new folder under `apps/api/prisma/migrations/`, and `generated/prisma` regenerated.
If this fails with a connection error, it is the Neon compute quota — retry later; nothing else in this task depends on a live database.

- [ ] **Step 3: Create the repository port**

`apps/api/src/modules/notification/application/ports/notification-repository.port.ts`:

```ts
import type { NotificationType } from "./notification.port.ts";

export interface CreateNotificationParams {
  institutionId: string;
  managerId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sectorId: string | null;
  dedupKey: string;
}

export interface NotificationRow {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sectorId: string | null;
  sectorName: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPage {
  items: NotificationRow[];
  nextCursor: string | null;
  total: number | null;
}

export interface NotificationRepository {
  /** Idempotent: rows colliding on (managerId, dedupKey) are skipped. */
  createMany(rows: CreateNotificationParams[]): Promise<void>;
  findPage(managerId: string, query: { cursor: string | null; limit: number }): Promise<NotificationPage>;
  countUnread(managerId: string): Promise<number>;
  /** False when the row does not exist or belongs to another manager. */
  markRead(managerId: string, id: string): Promise<boolean>;
  markAllRead(managerId: string): Promise<void>;
  deleteReadOlderThan(cutoff: Date): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol("NOTIFICATION_REPOSITORY");
```

- [ ] **Step 4: Write the failing test**

`apps/api/src/modules/notification/application/use-cases/publish-notification.use-case.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { PublishNotificationUseCase } from "./publish-notification.use-case.ts";
import { ResolveNotificationRecipientsUseCase } from "./resolve-notification-recipients.use-case.ts";
import type { CreateNotificationParams, NotificationRepository } from "../ports/notification-repository.port.ts";
import type { NotificationEvent } from "../ports/notification.port.ts";

class FakeNotificationRepository {
  created: CreateNotificationParams[] = [];
  shouldThrow = false;
  async createMany(rows: CreateNotificationParams[]): Promise<void> {
    if (this.shouldThrow) throw new Error("database is down");
    this.created.push(...rows);
  }
}

class FakeResolver {
  recipients: string[] = ["admin-1", "admin-2"];
  async execute(): Promise<string[]> {
    return this.recipients;
  }
}

function build(repository = new FakeNotificationRepository(), resolver = new FakeResolver()) {
  return {
    repository,
    resolver,
    useCase: new PublishNotificationUseCase(
      resolver as unknown as ResolveNotificationRecipientsUseCase,
      repository as unknown as NotificationRepository,
    ),
  };
}

const EVENT: NotificationEvent = {
  institutionId: "institution-1",
  type: "INVITE_ACCEPTED",
  payload: { name: "Paulo" },
  dedupKey: "invite-accepted:manager:manager-9",
};

describe("PublishNotificationUseCase", () => {
  it("writes one row per recipient, all carrying the event's dedup key", async () => {
    const { useCase, repository } = build();

    await useCase.publish(EVENT);

    expect(repository.created).toHaveLength(2);
    expect(repository.created.map((row) => row.managerId)).toEqual(["admin-1", "admin-2"]);
    expect(new Set(repository.created.map((row) => row.dedupKey))).toEqual(
      new Set(["invite-accepted:manager:manager-9"]),
    );
    expect(repository.created[0]!.payload).toEqual({ name: "Paulo" });
    expect(repository.created[0]!.sectorId).toBeNull();
  });

  it("carries the sector through to the row when the event names one", async () => {
    const { useCase, repository } = build();

    await useCase.publish({ ...EVENT, type: "SECTOR_BECAME_VISIBLE", sectorId: "sector-1" });

    expect(repository.created[0]!.sectorId).toBe("sector-1");
  });

  it("writes nothing at all when the event resolves to no recipient", async () => {
    const resolver = new FakeResolver();
    resolver.recipients = [];
    const { useCase, repository } = build(new FakeNotificationRepository(), resolver);

    await useCase.publish(EVENT);

    expect(repository.created).toEqual([]);
  });

  // A notification that cannot be written must never roll back the invite that
  // was genuinely accepted. The producer is not told.
  it("swallows a persistence failure instead of failing the producer", async () => {
    const repository = new FakeNotificationRepository();
    repository.shouldThrow = true;
    const { useCase } = build(repository);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(useCase.publish(EVENT)).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();

    errorLog.mockRestore();
  });

  it("swallows a resolution failure the same way", async () => {
    const resolver = new FakeResolver();
    resolver.execute = async () => {
      throw new Error("sector lookup failed");
    };
    const { useCase } = build(new FakeNotificationRepository(), resolver);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(useCase.publish(EVENT)).resolves.toBeUndefined();

    errorLog.mockRestore();
  });
});
```

- [ ] **Step 5: Run the test and watch it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: FAIL — `Cannot find module './publish-notification.use-case.ts'`

- [ ] **Step 6: Implement the publisher**

`apps/api/src/modules/notification/application/use-cases/publish-notification.use-case.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "../ports/notification.port.ts";
import { ResolveNotificationRecipientsUseCase } from "./resolve-notification-recipients.use-case.ts";

@Injectable()
export class PublishNotificationUseCase implements NotificationPublisher {
  private readonly logger = new Logger(PublishNotificationUseCase.name);

  constructor(
    @Inject(ResolveNotificationRecipientsUseCase)
    private readonly resolveRecipients: ResolveNotificationRecipientsUseCase,
    @Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository,
  ) {}

  // The single point of contact for every producer. Today it resolves and
  // writes; a real-time channel, a critical-path email or a broker each land
  // inside this method, which is why no producer has to change for any of them.
  async publish(event: NotificationEvent): Promise<void> {
    try {
      const recipients = await this.resolveRecipients.execute(event);
      if (recipients.length === 0) return;

      await this.repository.createMany(
        recipients.map((managerId) => ({
          institutionId: event.institutionId,
          managerId,
          type: event.type,
          payload: event.payload,
          sectorId: event.sectorId ?? null,
          dedupKey: event.dedupKey,
        })),
      );
    } catch (error) {
      // Deliberately terminal. The fact that caused this event has already been
      // committed, and losing its notification is strictly better than undoing it.
      this.logger.error(`failed to publish ${event.type} (${event.dedupKey})`, error);
      console.error(error);
    }
  }
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: PASS — 13 tests across both files.

- [ ] **Step 8: Implement the Prisma repository**

`apps/api/src/modules/notification/infrastructure/persistence/prisma-notification.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  CreateNotificationParams,
  NotificationPage,
  NotificationRepository,
  NotificationRow,
} from "../../application/ports/notification-repository.port.ts";
import type { NotificationType } from "../../application/ports/notification.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

type Row = {
  id: string;
  type: NotificationType;
  payload: Prisma.JsonValue;
  sectorId: string | null;
  sector: { name: string } | null;
  readAt: Date | null;
  createdAt: Date;
};

function toRow(row: Row): NotificationRow {
  return {
    id: row.id,
    type: row.type,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    sectorId: row.sectorId,
    sectorName: row.sector?.name ?? null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

const SELECT = {
  id: true,
  type: true,
  payload: true,
  sectorId: true,
  sector: { select: { name: true } },
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createMany(rows: CreateNotificationParams[]): Promise<void> {
    await this.prisma.notification.createMany({
      data: rows.map((row) => ({ ...row, payload: row.payload as Prisma.InputJsonValue })),
      skipDuplicates: true,
    });
  }

  // Keyset pagination on (createdAt desc, id desc): an offset would re-serve or
  // skip a row whenever a notification arrives mid-scroll.
  async findPage(managerId: string, query: { cursor: string | null; limit: number }): Promise<NotificationPage> {
    const rows = (await this.prisma.notification.findMany({
      where: { managerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: SELECT,
    })) as Row[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const total = await this.prisma.notification.count({ where: { managerId } });

    return {
      items: page.map(toRow),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  }

  async countUnread(managerId: string): Promise<number> {
    return this.prisma.notification.count({ where: { managerId, readAt: null } });
  }

  async markRead(managerId: string, id: string): Promise<boolean> {
    // Scoped by managerId in the WHERE, so another manager's row is simply not
    // found — the caller cannot tell it exists.
    const result = await this.prisma.notification.updateMany({
      where: { id, managerId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count > 0) return true;
    const exists = await this.prisma.notification.count({ where: { id, managerId } });
    return exists > 0;
  }

  async markAllRead(managerId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { managerId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async deleteReadOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: { readAt: { not: null, lt: cutoff } },
    });
    return result.count;
  }
}
```

- [ ] **Step 9: Create the module and register it**

`apps/api/src/modules/notification/notification.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { SectorModule } from "../sector/sector.module.ts";
import { MANAGER_REPOSITORY } from "../manager/application/ports/manager-repository.port.ts";
import { PrismaManagerRepository } from "../manager/infrastructure/persistence/prisma-manager.repository.ts";
import { NOTIFICATION_PUBLISHER } from "./application/ports/notification.port.ts";
import { NOTIFICATION_REPOSITORY } from "./application/ports/notification-repository.port.ts";
import { PublishNotificationUseCase } from "./application/use-cases/publish-notification.use-case.ts";
import { ResolveNotificationRecipientsUseCase } from "./application/use-cases/resolve-notification-recipients.use-case.ts";
import { PrismaNotificationRepository } from "./infrastructure/persistence/prisma-notification.repository.ts";

// SectorModule exports SECTOR_REPOSITORY, so it can simply be imported.
// MANAGER_REPOSITORY is provided directly instead: ManagerModule does not
// export it, and importing ManagerModule would create a cycle the moment
// ManagerModule imports this one (Task 3). Both bind the same Prisma class,
// so there is one implementation with two registrations, not two behaviours.
@Module({
  imports: [SectorModule],
  providers: [
    ResolveNotificationRecipientsUseCase,
    PublishNotificationUseCase,
    { provide: MANAGER_REPOSITORY, useClass: PrismaManagerRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    { provide: NOTIFICATION_PUBLISHER, useExisting: PublishNotificationUseCase },
  ],
  exports: [NOTIFICATION_PUBLISHER, NOTIFICATION_REPOSITORY],
})
export class NotificationModule {}
```

In `apps/api/src/app.module.ts`, add `NotificationModule` to `imports`.

- [ ] **Step 10: Run everything**

Run: `pnpm --filter @zelo/api test && pnpm --filter @zelo/api lint && pnpm --filter @zelo/api lint:boundaries && pnpm --filter @zelo/api build`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/prisma apps/api/generated apps/api/src
git commit -m "feat(api): persist notifications behind a publisher port"
```

---

## Task 3: Invite accepted and account status changes

**Files:**
- Modify: `apps/api/src/modules/manager/application/use-cases/finish-manager-setup.use-case.ts`
- Modify: `apps/api/src/modules/peer-partner/application/use-cases/finish-peer-partner-setup.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/update-manager.use-case.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`, `apps/api/src/modules/peer-partner/peer-partner.module.ts`
- Test: the three matching `.test.ts` files

**Interfaces:**
- Consumes: `NOTIFICATION_PUBLISHER`, `NotificationPublisher` (Task 1); `NotificationModule` exports (Task 2).
- Produces: nothing new. Dedup keys established here: `invite-accepted:manager:<id>`, `invite-accepted:peer-partner:<id>`, `account-status:manager:<id>:<ISO instant>`.

- [ ] **Step 1: Write the failing test for invite acceptance**

Append to `apps/api/src/modules/manager/application/use-cases/finish-manager-setup.use-case.test.ts`. Add this fake near the top of the file:

```ts
import type { NotificationEvent, NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}
```

Every existing `new FinishManagerSetupUseCase(repository, passwordService)` call gains a third argument, `notifications`. Then add:

```ts
  it("tells the hospital admins that the invite was accepted", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [
      Object.assign(
        { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true } as ManagerRow,
        { setPasswordToken: "abc123" },
      ),
    ];
    const notifications = new FakeNotificationPublisher();
    const useCase = new FinishManagerSetupUseCase(repository, new ManagerPasswordService(), notifications);

    await useCase.execute({ token: "abc123", password: "new-password-123" });

    expect(notifications.events).toEqual([
      {
        institutionId: "institution-1",
        type: "INVITE_ACCEPTED",
        payload: { kind: "manager", name: "Ana Konder" },
        dedupKey: "invite-accepted:manager:manager-1",
      },
    ]);
  });

  it("does not announce an acceptance that never happened", async () => {
    const repository = new FakeManagerRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new FinishManagerSetupUseCase(repository, new ManagerPasswordService(), notifications);

    await expect(useCase.execute({ token: "unknown", password: "new-password-123" })).rejects.toThrow(
      InvalidOrExpiredManagerSetupTokenError,
    );
    expect(notifications.events).toEqual([]);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/finish-manager-setup.use-case.test.ts`
Expected: FAIL — the constructor takes two arguments.

- [ ] **Step 3: Implement it**

In `finish-manager-setup.use-case.ts`, add the constructor dependency and publish after the update succeeds:

```ts
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

// ...in the constructor:
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,

// ...at the end of execute(), after the repository update:
    await this.notifications.publish({
      institutionId: manager.institutionId,
      type: "INVITE_ACCEPTED",
      payload: { kind: "manager", name: manager.name },
      dedupKey: `invite-accepted:manager:${manager.id}`,
    });
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/finish-manager-setup.use-case.test.ts`
Expected: PASS.

- [ ] **Step 5: Repeat for the peer partner**

Do Steps 1–4 again against `finish-peer-partner-setup.use-case.ts` and its test, with `payload: { kind: "peer-partner", name: peerPartner.name }` and `dedupKey: \`invite-accepted:peer-partner:${peerPartner.id}\``. The `INVITE_ACCEPTED` type and the hospital-admin audience are the same — a peer partner accepting is news for the admins, not for the peer partner.

- [ ] **Step 6: Write the failing test for account status**

Append to `apps/api/src/modules/manager/application/use-cases/update-manager.use-case.test.ts`, adding the same `FakeNotificationPublisher` and a third constructor argument everywhere:

```ts
  it("announces a deactivation with the instant it happened, so a later reactivation is a separate event", async () => {
    const { useCase, notifications } = buildWithTwoAdmins();

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-2", patch: { isActive: false } });

    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("ACCOUNT_DEACTIVATED");
    expect(notifications.events[0]!.dedupKey).toMatch(/^account-status:manager:manager-2:\d{4}-/);
  });

  it("announces a reactivation as its own event", async () => {
    const { useCase, notifications } = buildWithTwoAdmins({ managerIsActive: false });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-2", patch: { isActive: true } });

    expect(notifications.events[0]!.type).toBe("ACCOUNT_REACTIVATED");
  });

  it("says nothing when isActive was not part of the patch", async () => {
    const { useCase, notifications } = buildWithTwoAdmins();

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-2", patch: { role: "SECTOR_MANAGER" } });

    expect(notifications.events).toEqual([]);
  });

  it("says nothing when isActive is set to the value it already had", async () => {
    const { useCase, notifications } = buildWithTwoAdmins();

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-2", patch: { isActive: true } });

    expect(notifications.events).toEqual([]);
  });
```

Write `buildWithTwoAdmins` as a local helper returning `{ useCase, notifications }`, seeding the fake manager repository with two active `HOSPITAL_ADMIN` rows (so the last-admin guard does not trip) where `manager-2` has `isActive` per the option.

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/update-manager.use-case.test.ts`
Expected: FAIL.

- [ ] **Step 8: Implement it**

In `update-manager.use-case.ts`, after the `managerRepository.update` call and before the deactivation branch:

```ts
    // Only a real transition is news. Patching isActive to the value it already
    // held is a no-op the admins do not need to hear about.
    if (input.patch.isActive !== undefined && input.patch.isActive !== manager.isActive) {
      await this.notifications.publish({
        institutionId: input.institutionId,
        type: input.patch.isActive ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
        payload: { kind: "manager", name: manager.name },
        dedupKey: `account-status:manager:${manager.id}:${new Date().toISOString()}`,
      });
    }
```

- [ ] **Step 9: Run it and watch it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager`
Expected: PASS.

- [ ] **Step 10: Wire the modules**

Add `NotificationModule` to the `imports` of `ManagerModule` and `PeerPartnerModule`. Confirm `pnpm --filter @zelo/api build` starts the app without a circular-dependency warning; if Nest reports one, break it with `forwardRef(() => NotificationModule)` on the manager side only.

- [ ] **Step 11: Run everything and commit**

```bash
pnpm --filter @zelo/api test && pnpm --filter @zelo/api lint
git add apps/api/src
git commit -m "feat(api): notify admins on invite acceptance and account status changes"
```

---

## Task 4: Sector became visible

The k-anonymity crossing, detected without a scheduler.

**Files:**
- Modify: `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts`
- Modify: `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts`
- Modify: `apps/api/src/modules/signal-checkin/signal-checkin.module.ts`
- Test: `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.test.ts`

**Interfaces:**
- Consumes: `NOTIFICATION_PUBLISHER`, `K_ANONYMITY_THRESHOLD` from `modules/manager/application/constants.ts`.
- Produces: `SignalCheckinRepository.recordCheckin` now returns `Promise<{ checkIns: number } | null>` — `null` means the check-in was deduplicated and nothing changed.

- [ ] **Step 1: Change the port's return type**

```ts
export interface SignalCheckinRepository {
  /** The row's check-in count after the increment, or null when deduplicated. */
  recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null>;
}
```

- [ ] **Step 2: Write the failing test**

Replace the fake in `record-signal-checkin.use-case.test.ts` so it counts, and add these cases:

```ts
class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordCheckinParams[] = [];
  public nextResult: { checkIns: number } | null = { checkIns: 1 };
  async recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null> {
    this.calls.push(params);
    return this.nextResult;
  }
}

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}
```

```ts
  it("announces the sector becoming visible on the increment that reaches the threshold", async () => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = { checkIns: K_ANONYMITY_THRESHOLD };
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([
      {
        institutionId: "institution-1",
        type: "SECTOR_BECAME_VISIBLE",
        sectorId: "sector-1",
        payload: { weekStart: "2026-07-06T00:00:00.000Z", checkIns: K_ANONYMITY_THRESHOLD },
        dedupKey: "sector-visible:sector-1:2026-07-06T00:00:00.000Z",
      },
    ]);
  });

  // checkIns only ever increases within a week, so exactly one increment can
  // equal the threshold — this is what makes the event fire once with no state.
  it.each([1, 2, 3, 4, 6, 7, 12])("stays quiet at %i check-ins", async (checkIns) => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = { checkIns };
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([]);
  });

  it("fires exactly once across a whole week of check-ins", async () => {
    const repository = new FakeSignalCheckinRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    for (let checkIns = 1; checkIns <= 12; checkIns += 1) {
      repository.nextResult = { checkIns };
      await useCase.execute(
        { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: `device-${checkIns}` },
        new Date("2026-07-08T15:00:00.000Z"),
      );
    }

    expect(notifications.events).toHaveLength(1);
  });

  it("stays quiet when the check-in was deduplicated", async () => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = null;
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([]);
  });
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/signal-checkin`
Expected: FAIL — the constructor takes one argument.

- [ ] **Step 4: Implement it**

In `record-signal-checkin.use-case.ts`:

```ts
import { K_ANONYMITY_THRESHOLD } from "../../../manager/application/constants.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

// ...constructor gains:
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,

// ...replace the tail of execute():
    const result = await this.repository.recordCheckin({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      concerning: input.concerning,
      dedupKey,
    });

    // Within one week this counter only increases, so exactly one increment can
    // land on the threshold — an equality check is the whole crossing detector,
    // with no stored "already notified" flag to keep in sync.
    if (result?.checkIns === K_ANONYMITY_THRESHOLD) {
      await this.notifications.publish({
        institutionId: input.institutionId,
        type: "SECTOR_BECAME_VISIBLE",
        sectorId: input.sectorId,
        payload: { weekStart: weekStart.toISOString(), checkIns: result.checkIns },
        dedupKey: `sector-visible:${input.sectorId}:${weekStart.toISOString()}`,
      });
    }
```

- [ ] **Step 5: Update the Prisma repository to return the count**

In `prisma-signal-checkin.repository.ts`, capture the upsert result and return it; return `null` from the `UNIQUE_CONSTRAINT_VIOLATION` branch:

```ts
  async recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.signalDedupKey.create({ data: { dedupKey: params.dedupKey } });
        const signal = await tx.signal.upsert({
          where: {
            institutionId_sectorId_weekStart: {
              institutionId: params.institutionId,
              sectorId: params.sectorId,
              weekStart: params.weekStart,
            },
          },
          update: { checkIns: { increment: 1 }, concerning: { increment: params.concerning ? 1 : 0 } },
          create: {
            institutionId: params.institutionId,
            sectorId: params.sectorId,
            weekStart: params.weekStart,
            checkIns: 1,
            concerning: params.concerning ? 1 : 0,
          },
          select: { checkIns: true },
        });
        return { checkIns: signal.checkIns };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        return null;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION) {
        throw new UnknownInstitutionOrSectorError();
      }
      throw error;
    }
  }
```

- [ ] **Step 6: Run it and watch it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/signal-checkin`
Expected: PASS. The controller test's fake repository also needs the new return type — return `{ checkIns: 1 }` from it.

- [ ] **Step 7: Wire and commit**

Add `NotificationModule` to `SignalCheckinModule`'s imports.

```bash
pnpm --filter @zelo/api test && pnpm --filter @zelo/api lint
git add apps/api/src
git commit -m "feat(api): notify when a sector crosses the k-anonymity threshold"
```

---

## Task 5: The email path

Makes the operational-health family able to fire at all, and fixes two live defects on the way.

**Files:**
- Modify: `apps/api/src/shared/email/email.port.ts`
- Modify: `apps/api/src/shared/email/resend-email.adapter.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/send-manager-set-password-email.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/send-peer-partner-set-password-email.use-case.ts`
- Test: the four matching `.test.ts` files

**Interfaces:**
- Produces: `class EmailDeliveryError extends Error` exported from `shared/email/email.port.ts`. Dedup key: `invite-email-failed:<kind>:<id>:<ISO instant>`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.test.ts`:

```ts
  it("still creates the manager when the invite email cannot be sent, and says so", async () => {
    const { useCase, managerRepository, notifications, emailPort } = build();
    emailPort.shouldThrow = new EmailDeliveryError("domain not verified");

    const result = await useCase.execute({
      name: "Paulo",
      email: "paulo@zelo-demo.local",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
      sectorIds: [],
    });

    expect(result.manager.email).toBe("paulo@zelo-demo.local");
    expect(managerRepository.created).toHaveLength(1);
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
    expect(notifications.events[0]!.payload).toMatchObject({
      kind: "manager",
      name: "Paulo",
      email: "paulo@zelo-demo.local",
    });
  });

  it("says nothing about email when the invite went out", async () => {
    const { useCase, notifications } = build();

    await useCase.execute({
      name: "Paulo",
      email: "paulo@zelo-demo.local",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
      sectorIds: [],
    });

    expect(notifications.events).toEqual([]);
  });
```

Extend the file's existing fake email port with `shouldThrow: Error | null = null`, thrown from `send`. Write `build()` as a local helper returning the use case and its fakes, matching the seeding the file's other tests already do.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/create-manager.use-case.test.ts`
Expected: FAIL — the rejection propagates out of `execute`.

- [ ] **Step 3: Add the error type and make the adapter detect failure**

In `apps/api/src/shared/email/email.port.ts`:

```ts
// The Resend SDK resolves with { data, error } instead of rejecting, so an
// API-level rejection — unverified domain, invalid address, rate limit — used
// to look exactly like success. This is the type that makes it visible.
export class EmailDeliveryError extends Error {}
```

In `apps/api/src/shared/email/resend-email.adapter.ts`:

```ts
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    const { subject, html } = renderEmailTemplate(template, params);
    const { error } = await this.client.emails.send({ from: this.from, to, subject, html });
    if (error) {
      throw new EmailDeliveryError(error.message);
    }
  }
```

- [ ] **Step 4: Catch at the four call sites**

In `create-manager.use-case.ts`, replace the bare `await this.emailPort.send(...)` with:

```ts
    // The manager row is already committed at this point. Letting a send failure
    // propagate would return 500 for an account that genuinely exists, and the
    // retry would then collide with the unique email constraint — leaving an
    // account the admin can neither use nor recreate.
    try {
      await this.emailPort.send(manager.email, "invite", {
        name: manager.name,
        setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken),
      });
    } catch (error) {
      await this.notifications.publish({
        institutionId: input.institutionId,
        type: "INVITE_EMAIL_FAILED",
        payload: {
          kind: "manager",
          name: manager.name,
          email: manager.email,
          reason: error instanceof Error ? error.message : "unknown",
        },
        dedupKey: `invite-email-failed:manager:${manager.id}:${new Date().toISOString()}`,
      });
    }

    return { manager };
```

The other three call sites take the same shape. Each gains the `NOTIFICATION_PUBLISHER` constructor dependency, and each differs only in the values below:

| File | `type` argument to `send` | `payload.kind` | `dedupKey` |
|---|---|---|---|
| `create-manager.use-case.ts` | `"invite"` | `"manager"` | `` `invite-email-failed:manager:${manager.id}:${new Date().toISOString()}` `` |
| `create-peer-partner.use-case.ts` | `"invite"` | `"peer-partner"` | `` `invite-email-failed:peer-partner:${peerPartner.id}:${new Date().toISOString()}` `` |
| `send-manager-set-password-email.use-case.ts` | `template` (already computed) | `"manager"` | `` `invite-email-failed:manager:${manager.id}:${new Date().toISOString()}` `` |
| `send-peer-partner-set-password-email.use-case.ts` | `template` (already computed) | `"peer-partner"` | `` `invite-email-failed:peer-partner:${peerPartner.id}:${new Date().toISOString()}` `` |

The two `send-*-set-password-email` use cases return `void`, so their `try/catch` has no `return { manager }` after it — the catch block is the whole change. Their `institutionId` comes from `input.institutionId`, which they already have.

The dedup key carries the attempt instant, unlike the lapsed-invite key: a manager who presses "Reenviar convite" three times and fails three times has had three failures, and should hear about each.

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm --filter @zelo/api test && pnpm --filter @zelo/api lint
git add apps/api/src
git commit -m "fix(api): surface invite email failures instead of reporting success"
```

---

## Task 6: The scheduler, lapsed invites and retention

**Files:**
- Create: `apps/api/src/modules/notification/application/thresholds.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/sweep-lapsed-invites.use-case.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/sweep-notification-retention.use-case.ts`
- Create: `apps/api/src/modules/notification/infrastructure/notification-scheduler.ts`
- Modify: the manager and peer-partner repository ports and Prisma adapters
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/modules/notification/notification.module.ts`
- Modify: `apps/api/package.json`
- Test: `sweep-lapsed-invites.use-case.test.ts`, `sweep-notification-retention.use-case.test.ts`

**Interfaces:**
- Produces:
  - `RISK_RATE_THRESHOLD`, `RISK_MIN_CHECK_INS`, `RISK_DELTA_THRESHOLD`, `RETENTION_DAYS` from `thresholds.ts`
  - `ManagerRepository.findLapsedInvites(now: Date): Promise<{ id: string; name: string; institutionId: string }[]>`
  - `PeerPartnerRepository.findLapsedInvites(now: Date): Promise<{ id: string; name: string; institutionId: string }[]>`
  - `class SweepLapsedInvitesUseCase` with `execute(now?: Date): Promise<number>` returning rows published
  - `class SweepNotificationRetentionUseCase` with `execute(now?: Date): Promise<number>` returning rows deleted

- [ ] **Step 1: Install the scheduler**

Run: `pnpm --filter @zelo/api add @nestjs/schedule`
Then add `ScheduleModule.forRoot()` to `AppModule`'s `imports`.

- [ ] **Step 2: Create the thresholds module**

`apps/api/src/modules/notification/application/thresholds.ts`:

```ts
// The single point per-institution settings will later replace — see
// docs/superpowers/specs/2026-08-23-institution-settings-design.md. Nothing
// else in the codebase may hardcode these numbers.

/** A sector's weekly concerning rate at or above this fires a level alert. */
export const RISK_RATE_THRESHOLD = 0.4;

/**
 * Deliberately above the k-anonymity floor of 5. At n=5 a single person moves
 * the rate by 20 points (2/5 is 40%, 3/5 is 60%), so a rate threshold applied
 * there fires and un-fires on noise. A denominator above the visibility floor
 * is what makes the number a signal rather than a coin flip.
 */
export const RISK_MIN_CHECK_INS = 10;

/** A week-over-week rise of this many points fires a delta alert. */
export const RISK_DELTA_THRESHOLD = 0.15;

/** Read notifications older than this are purged. Unread ones never are. */
export const RETENTION_DAYS = 90;
```

- [ ] **Step 3: Write the failing tests**

`apps/api/src/modules/notification/application/use-cases/sweep-lapsed-invites.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SweepLapsedInvitesUseCase } from "./sweep-lapsed-invites.use-case.ts";
import type { NotificationEvent, NotificationPublisher } from "../ports/notification.port.ts";

class FakePublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

const LAPSED_MANAGER = { id: "manager-1", name: "Ana", institutionId: "institution-1" };
const LAPSED_PEER = { id: "peer-1", name: "Dr. Paulo", institutionId: "institution-1" };

function build(managers = [LAPSED_MANAGER], peers = [LAPSED_PEER]) {
  const publisher = new FakePublisher();
  const useCase = new SweepLapsedInvitesUseCase(
    { findLapsedInvites: async () => managers } as never,
    { findLapsedInvites: async () => peers } as never,
    publisher,
  );
  return { useCase, publisher };
}

describe("SweepLapsedInvitesUseCase", () => {
  it("publishes one expiry per lapsed account, across both account types", async () => {
    const { useCase, publisher } = build();

    const published = await useCase.execute(new Date("2026-08-23T03:00:00.000Z"));

    expect(published).toBe(2);
    expect(publisher.events.map((e) => e.dedupKey)).toEqual([
      "invite-expired:manager:manager-1",
      "invite-expired:peer-partner:peer-1",
    ]);
    expect(publisher.events[0]).toEqual({
      institutionId: "institution-1",
      type: "INVITE_EXPIRED",
      payload: { kind: "manager", name: "Ana" },
      dedupKey: "invite-expired:manager:manager-1",
    });
  });

  // The dedup key carries no timestamp on purpose: a lapsed invite stays lapsed,
  // and the sweep runs over it every night. One notification, not ninety.
  it("uses a timestamp-free dedup key so repeated sweeps notify once", async () => {
    const { useCase, publisher } = build();

    await useCase.execute(new Date("2026-08-23T03:00:00.000Z"));
    await useCase.execute(new Date("2026-08-24T03:00:00.000Z"));
    await useCase.execute(new Date("2026-08-25T03:00:00.000Z"));

    const keys = publisher.events.map((e) => e.dedupKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("publishes nothing when no invite has lapsed", async () => {
    const { useCase, publisher } = build([], []);

    expect(await useCase.execute(new Date())).toBe(0);
    expect(publisher.events).toEqual([]);
  });
});
```

`apps/api/src/modules/notification/application/use-cases/sweep-notification-retention.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SweepNotificationRetentionUseCase } from "./sweep-notification-retention.use-case.ts";
import { RETENTION_DAYS } from "../thresholds.ts";

describe("SweepNotificationRetentionUseCase", () => {
  it("purges read notifications older than the retention window", async () => {
    let received: Date | null = null;
    const useCase = new SweepNotificationRetentionUseCase({
      deleteReadOlderThan: async (cutoff: Date) => {
        received = cutoff;
        return 7;
      },
    } as never);

    const deleted = await useCase.execute(new Date("2026-08-23T03:00:00.000Z"));

    expect(deleted).toBe(7);
    const expected = new Date("2026-08-23T03:00:00.000Z");
    expected.setUTCDate(expected.getUTCDate() - RETENTION_DAYS);
    expect(received!.toISOString()).toBe(expected.toISOString());
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: FAIL — both modules missing.

- [ ] **Step 5: Implement the two sweeps**

`sweep-lapsed-invites.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../../../manager/application/ports/manager-repository.port.ts";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../ports/notification.port.ts";

@Injectable()
export class SweepLapsedInvitesUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  // Expiry is not an event — nothing happens at the moment the token's deadline
  // passes — so it has to be swept for. The dedup key deliberately omits any
  // timestamp: the sweep runs nightly over the same lapsed invite forever, and
  // it must produce exactly one notification.
  async execute(now: Date = new Date()): Promise<number> {
    const managers = await this.managerRepository.findLapsedInvites(now);
    const peerPartners = await this.peerPartnerRepository.findLapsedInvites(now);

    const accounts = [
      ...managers.map((row) => ({ ...row, kind: "manager" as const })),
      ...peerPartners.map((row) => ({ ...row, kind: "peer-partner" as const })),
    ];

    for (const account of accounts) {
      await this.notifications.publish({
        institutionId: account.institutionId,
        type: "INVITE_EXPIRED",
        payload: { kind: account.kind, name: account.name },
        dedupKey: `invite-expired:${account.kind}:${account.id}`,
      });
    }

    return accounts.length;
  }
}
```

`sweep-notification-retention.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification-repository.port.ts";
import { RETENTION_DAYS } from "../thresholds.ts";

@Injectable()
export class SweepNotificationRetentionUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository) {}

  // Only read rows are purged. An unread notification is an unfinished task, and
  // its age is not a reason to hide it.
  async execute(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    return this.repository.deleteReadOlderThan(cutoff);
  }
}
```

- [ ] **Step 6: Run them and watch them pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: PASS.

- [ ] **Step 7: Add the two repository queries**

To `ManagerRepository` and `PeerPartnerRepository` ports:

```ts
  findLapsedInvites(now: Date): Promise<{ id: string; name: string; institutionId: string }[]>;
```

In both Prisma adapters:

```ts
  async findLapsedInvites(now: Date): Promise<{ id: string; name: string; institutionId: string }[]> {
    return this.prisma.manager.findMany({   // peerPartner in the other adapter
      where: { passwordHash: null, setPasswordTokenExpiresAt: { not: null, lt: now } },
      select: { id: true, name: true, institutionId: true },
    });
  }
```

Add the method to every existing fake of these ports, throwing `new Error("not used in this test")`.

- [ ] **Step 8: Add the scheduler**

`apps/api/src/modules/notification/infrastructure/notification-scheduler.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SweepLapsedInvitesUseCase } from "../application/use-cases/sweep-lapsed-invites.use-case.ts";
import { SweepNotificationRetentionUseCase } from "../application/use-cases/sweep-notification-retention.use-case.ts";

// Cron expressions are UTC, matching startOfIsoWeek, which anchors every weekly
// boundary in this codebase to Monday 00:00 UTC.
//
// Fly runs one machine (min_machines_running = 1, auto_stop_machines = false),
// so no leader election is needed. If it ever runs two, the (managerId,
// dedupKey) unique constraint already makes a doubly-executed sweep produce one
// row — the same protection SignalDedupKey gives the check-in path.
@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    @Inject(SweepLapsedInvitesUseCase) private readonly sweepLapsedInvites: SweepLapsedInvitesUseCase,
    @Inject(SweepNotificationRetentionUseCase)
    private readonly sweepRetention: SweepNotificationRetentionUseCase,
  ) {}

  @Cron("0 3 * * *")
  async daily(): Promise<void> {
    const published = await this.sweepLapsedInvites.execute();
    const purged = await this.sweepRetention.execute();
    this.logger.log(`daily sweep: ${published} expiries published, ${purged} read notifications purged`);
  }
}
```

Register `NotificationScheduler`, both sweeps, and `{ provide: PEER_PARTNER_REPOSITORY, useClass: PrismaPeerPartnerRepository }` in `NotificationModule`'s providers. `PeerPartnerModule` does export that token, but importing it here would close the cycle it opened in Task 3 — the provider is duplicated for the same reason `MANAGER_REPOSITORY` is.

- [ ] **Step 9: Run everything and commit**

```bash
pnpm --filter @zelo/api test && pnpm --filter @zelo/api lint && pnpm --filter @zelo/api build
git add apps/api
git commit -m "feat(api): sweep lapsed invites and purge read notifications daily"
```

---

## Task 7: The weekly risk sweep

**Files:**
- Create: `apps/api/src/modules/notification/application/use-cases/sweep-sector-risk.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/notification-scheduler.ts`
- Modify: `apps/api/src/modules/notification/notification.module.ts`
- Test: `apps/api/src/modules/notification/application/use-cases/sweep-sector-risk.use-case.test.ts`

**Interfaces:**
- Consumes: `RISK_RATE_THRESHOLD`, `RISK_MIN_CHECK_INS`, `RISK_DELTA_THRESHOLD` (Task 6); `startOfIsoWeek` from `shared/date`.
- Produces:
  - `SignalRepository.findAllForWeek(weekStarts: Date[]): Promise<{ institutionId: string; sectorId: string; sectorName: string; weekStart: Date; checkIns: number; concerning: number }[]>`
  - `class SweepSectorRiskUseCase` with `execute(now?: Date): Promise<number>`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/notification/application/use-cases/sweep-sector-risk.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SweepSectorRiskUseCase } from "./sweep-sector-risk.use-case.ts";
import type { NotificationEvent, NotificationPublisher } from "../ports/notification.port.ts";

class FakePublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

// The sweep runs Monday 03:00 UTC over the week that closed at Monday 00:00.
const NOW = new Date("2026-08-24T03:00:00.000Z");
const CLOSED_WEEK = new Date("2026-08-17T00:00:00.000Z");
const PRIOR_WEEK = new Date("2026-08-10T00:00:00.000Z");

type Row = {
  institutionId: string;
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
};

function row(weekStart: Date, checkIns: number, concerning: number, sectorId = "sector-1"): Row {
  return { institutionId: "institution-1", sectorId, sectorName: "UTI", weekStart, checkIns, concerning };
}

function build(rows: Row[]) {
  const publisher = new FakePublisher();
  const useCase = new SweepSectorRiskUseCase({ findAllForWeek: async () => rows } as never, publisher);
  return { useCase, publisher };
}

describe("SweepSectorRiskUseCase", () => {
  it("fires a level alert at or above the rate with a large enough denominator", async () => {
    const { useCase, publisher } = build([row(CLOSED_WEEK, 12, 5)]); // 41.7%

    await useCase.execute(NOW);

    expect(publisher.events).toHaveLength(1);
    expect(publisher.events[0]).toEqual({
      institutionId: "institution-1",
      type: "SECTOR_RISK_THRESHOLD",
      sectorId: "sector-1",
      payload: {
        trigger: "level",
        sectorName: "UTI",
        weekStart: "2026-08-17T00:00:00.000Z",
        rate: 5 / 12,
        checkIns: 12,
      },
      dedupKey: "sector-risk:sector-1:2026-08-17T00:00:00.000Z",
    });
  });

  // The whole reason RISK_MIN_CHECK_INS sits above the k-anonymity floor: at
  // n=6 one person is 16 points, so 50% here is noise, not a signal.
  it("stays quiet at a high rate when the denominator is too small", async () => {
    const { useCase, publisher } = build([row(CLOSED_WEEK, 6, 3)]); // 50%, n=6

    await useCase.execute(NOW);

    expect(publisher.events).toEqual([]);
  });

  it("stays quiet below the rate however large the denominator", async () => {
    const { useCase, publisher } = build([row(CLOSED_WEEK, 20, 6)]); // 30%, n=20

    await useCase.execute(NOW);

    expect(publisher.events).toEqual([]);
  });

  it("fires a delta alert on a steep week-over-week rise below the level threshold", async () => {
    const { useCase, publisher } = build([
      row(PRIOR_WEEK, 20, 3), // 15%
      row(CLOSED_WEEK, 20, 7), // 35% — +20 points, still under 40%
    ]);

    await useCase.execute(NOW);

    expect(publisher.events).toHaveLength(1);
    expect(publisher.events[0]!.payload).toMatchObject({ trigger: "delta" });
  });

  it("stays quiet on a small rise", async () => {
    const { useCase, publisher } = build([
      row(PRIOR_WEEK, 20, 6), // 30%
      row(CLOSED_WEEK, 20, 7), // 35% — +5 points
    ]);

    await useCase.execute(NOW);

    expect(publisher.events).toEqual([]);
  });

  it("does not compute a delta against a prior week too small to trust", async () => {
    const { useCase, publisher } = build([
      row(PRIOR_WEEK, 5, 0), // 0%, n=5
      row(CLOSED_WEEK, 20, 7), // 35%
    ]);

    await useCase.execute(NOW);

    expect(publisher.events).toEqual([]);
  });

  it("reports level rather than delta when both rules fire, and sends one notification", async () => {
    const { useCase, publisher } = build([
      row(PRIOR_WEEK, 20, 3), // 15%
      row(CLOSED_WEEK, 20, 9), // 45% — over the level AND +30 points
    ]);

    await useCase.execute(NOW);

    expect(publisher.events).toHaveLength(1);
    expect(publisher.events[0]!.payload).toMatchObject({ trigger: "level" });
  });

  it("evaluates each sector independently", async () => {
    const { useCase, publisher } = build([
      row(CLOSED_WEEK, 12, 5, "sector-1"), // fires
      row(CLOSED_WEEK, 12, 2, "sector-2"), // does not
    ]);

    await useCase.execute(NOW);

    expect(publisher.events.map((e) => e.sectorId)).toEqual(["sector-1"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the sweep**

```ts
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "../../../../shared/date/start-of-iso-week.ts";
import { SIGNAL_REPOSITORY, type SignalRepository } from "../../../manager/application/ports/signal-repository.port.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../ports/notification.port.ts";
import { RISK_DELTA_THRESHOLD, RISK_MIN_CHECK_INS, RISK_RATE_THRESHOLD } from "../thresholds.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SweepSectorRiskUseCase {
  constructor(
    @Inject(SIGNAL_REPOSITORY) private readonly signalRepository: SignalRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  // Weekly, not per check-in. The rate moves in both directions as check-ins
  // arrive: a sector at 4/10 on Wednesday reads 40% and would fire, but if the
  // week closes at 4/25 it was 16% and the alarm was false. A manager cannot
  // un-see an alarm, so a false one costs more than a late one.
  async execute(now: Date = new Date()): Promise<number> {
    const closedWeek = new Date(startOfIsoWeek(now).getTime() - WEEK_MS);
    const priorWeek = new Date(closedWeek.getTime() - WEEK_MS);

    const rows = await this.signalRepository.findAllForWeek([closedWeek, priorWeek]);
    const closed = rows.filter((r) => r.weekStart.getTime() === closedWeek.getTime());
    const prior = new Map(
      rows
        .filter((r) => r.weekStart.getTime() === priorWeek.getTime())
        .map((r) => [r.sectorId, r]),
    );

    let published = 0;

    for (const current of closed) {
      if (current.checkIns < RISK_MIN_CHECK_INS) continue;

      const rate = current.concerning / current.checkIns;
      const previous = prior.get(current.sectorId);
      const previousRate =
        previous && previous.checkIns >= RISK_MIN_CHECK_INS
          ? previous.concerning / previous.checkIns
          : null;

      // Level wins when both fire: "this sector is above the line" is the more
      // actionable statement, and two notifications for one week would be noise.
      const trigger =
        rate >= RISK_RATE_THRESHOLD
          ? "level"
          : previousRate !== null && rate - previousRate >= RISK_DELTA_THRESHOLD
            ? "delta"
            : null;

      if (!trigger) continue;

      await this.notifications.publish({
        institutionId: current.institutionId,
        type: "SECTOR_RISK_THRESHOLD",
        sectorId: current.sectorId,
        payload: {
          trigger,
          sectorName: current.sectorName,
          weekStart: current.weekStart.toISOString(),
          rate,
          checkIns: current.checkIns,
          ...(trigger === "delta" ? { previousRate } : {}),
        },
        dedupKey: `sector-risk:${current.sectorId}:${current.weekStart.toISOString()}`,
      });
      published += 1;
    }

    return published;
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: PASS — 8 tests in this file.

- [ ] **Step 5: Add the repository query**

To `SignalRepository`:

```ts
export interface WeeklySignalRow {
  institutionId: string;
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

  /** Every institution's rows for the given weeks — this feeds the risk sweep, which is not scoped to one institution. */
  findAllForWeek(weekStarts: Date[]): Promise<WeeklySignalRow[]>;
```

In `prisma-signal.repository.ts`:

```ts
  async findAllForWeek(weekStarts: Date[]): Promise<WeeklySignalRow[]> {
    const rows = await this.prisma.signal.findMany({
      where: { weekStart: { in: weekStarts }, sector: { isActive: true } },
      select: {
        institutionId: true,
        sectorId: true,
        weekStart: true,
        checkIns: true,
        concerning: true,
        sector: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      institutionId: row.institutionId,
      sectorId: row.sectorId,
      sectorName: row.sector.name,
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    }));
  }
```

- [ ] **Step 6: Add the weekly cron**

In `notification-scheduler.ts`:

```ts
  @Cron("0 3 * * 1")
  async weekly(): Promise<void> {
    const published = await this.sweepSectorRisk.execute();
    this.logger.log(`weekly risk sweep: ${published} sector alerts published`);
  }
```

Register `SweepSectorRiskUseCase` and `{ provide: SIGNAL_REPOSITORY, useClass: PrismaSignalRepository }` in `NotificationModule`.

- [ ] **Step 7: Run everything and commit**

```bash
pnpm --filter @zelo/api test && pnpm --filter @zelo/api lint && pnpm --filter @zelo/api build
git add apps/api/src
git commit -m "feat(api): evaluate sector risk thresholds at week close"
```

---

## Task 8: HTTP endpoints

**Files:**
- Create: `apps/api/src/modules/notification/application/use-cases/list-notifications.use-case.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/mark-notification-read.use-case.ts`
- Create: `apps/api/src/modules/notification/infrastructure/notification.controller.ts`
- Modify: `apps/api/src/modules/notification/notification.module.ts`
- Test: `apps/api/src/modules/notification/infrastructure/notification.controller.test.ts`

**Interfaces:**
- Consumes: `NotificationRepository`, `ManagerAuthGuard`.
- Produces: `GET /manager/notifications`, `GET /manager/notifications/unread-count`, `PATCH /manager/notifications/:id/read`, `POST /manager/notifications/read-all`.
- Response DTO: `{ id, type, payload, sectorName, readAt, createdAt }` with dates as ISO strings; page as `{ items, nextCursor, total }`.

- [ ] **Step 1: Write the failing controller test**

`apps/api/src/modules/notification/infrastructure/notification.controller.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { NotificationController } from "./notification.controller.ts";
import { ListNotificationsUseCase } from "../application/use-cases/list-notifications.use-case.ts";
import { MarkNotificationReadUseCase } from "../application/use-cases/mark-notification-read.use-case.ts";
import { NOTIFICATION_REPOSITORY } from "../application/ports/notification-repository.port.ts";
import { ManagerAuthGuard } from "../../manager/infrastructure/manager-auth.guard.ts";

const MANAGER = { id: "manager-1", name: "Ana", institutionId: "institution-1", role: "HOSPITAL_ADMIN" as const };

class FakeNotificationRepository {
  page = {
    items: [
      {
        id: "n-1",
        type: "INVITE_ACCEPTED" as const,
        payload: { kind: "manager", name: "Paulo" },
        sectorId: null,
        sectorName: null,
        readAt: null,
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
      },
    ],
    nextCursor: "n-1",
    total: 42,
  };
  unread = 3;
  markReadResult = true;
  lastMarkRead: { managerId: string; id: string } | null = null;
  markedAllFor: string | null = null;
  lastQuery: { managerId: string; cursor: string | null; limit: number } | null = null;

  async findPage(managerId: string, query: { cursor: string | null; limit: number }) {
    this.lastQuery = { managerId, ...query };
    return this.page;
  }
  async countUnread() {
    return this.unread;
  }
  async markRead(managerId: string, id: string) {
    this.lastMarkRead = { managerId, id };
    return this.markReadResult;
  }
  async markAllRead(managerId: string) {
    this.markedAllFor = managerId;
  }
  async createMany() {}
  async deleteReadOlderThan() {
    return 0;
  }
}

describe("notification controller", () => {
  let app: INestApplication;
  let repository: FakeNotificationRepository;

  beforeAll(async () => {
    repository = new FakeNotificationRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        ListNotificationsUseCase,
        MarkNotificationReadUseCase,
        { provide: NOTIFICATION_REPOSITORY, useValue: repository },
      ],
    })
      .overrideGuard(ManagerAuthGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => { manager?: unknown } } }) => {
          context.switchToHttp().getRequest().manager = MANAGER;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns a page shaped like every other list in the panel", async () => {
    const response = await request(app.getHttpServer()).get("/manager/notifications").expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: "n-1",
          type: "INVITE_ACCEPTED",
          payload: { kind: "manager", name: "Paulo" },
          sectorName: null,
          readAt: null,
          createdAt: "2026-08-20T10:00:00.000Z",
        },
      ],
      nextCursor: "n-1",
      total: 42,
    });
  });

  it("scopes the query to the authenticated manager, never to a parameter", async () => {
    await request(app.getHttpServer()).get("/manager/notifications?cursor=n-9&limit=25").expect(200);

    expect(repository.lastQuery).toEqual({ managerId: "manager-1", cursor: "n-9", limit: 25 });
  });

  it("clamps an absurd limit rather than letting a caller pull the whole table", async () => {
    await request(app.getHttpServer()).get("/manager/notifications?limit=5000").expect(200);

    expect(repository.lastQuery!.limit).toBe(50);
  });

  it("falls back to the default limit when the parameter is not a number", async () => {
    await request(app.getHttpServer()).get("/manager/notifications?limit=abc").expect(200);

    expect(repository.lastQuery!.limit).toBe(20);
  });

  it("serves the unread count on its own, since the badge is on every screen", async () => {
    const response = await request(app.getHttpServer()).get("/manager/notifications/unread-count").expect(200);

    expect(response.body).toEqual({ count: 3 });
  });

  it("marks one notification read", async () => {
    await request(app.getHttpServer()).patch("/manager/notifications/n-1/read").expect(204);

    expect(repository.lastMarkRead).toEqual({ managerId: "manager-1", id: "n-1" });
  });

  // 404 and not 403: the existence of another manager's notification is itself
  // information the caller is not entitled to.
  it("returns 404 for a notification that is not this manager's", async () => {
    repository.markReadResult = false;

    await request(app.getHttpServer()).patch("/manager/notifications/someone-elses/read").expect(404);

    repository.markReadResult = true;
  });

  it("marks everything read", async () => {
    await request(app.getHttpServer()).post("/manager/notifications/read-all").expect(204);

    expect(repository.markedAllFor).toBe("manager-1");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification/infrastructure`
Expected: FAIL — controller missing.

- [ ] **Step 3: Implement the two use cases**

`list-notifications.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import {
  NOTIFICATION_REPOSITORY,
  type NotificationPage,
  type NotificationRepository,
} from "../ports/notification-repository.port.ts";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

@Injectable()
export class ListNotificationsUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository) {}

  async execute(managerId: string, query: { cursor: string | null; limit: number }): Promise<NotificationPage> {
    return this.repository.findPage(managerId, query);
  }

  async unreadCount(managerId: string): Promise<number> {
    return this.repository.countUnread(managerId);
  }
}
```

`mark-notification-read.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification-repository.port.ts";

export class NotificationNotFoundError extends Error {}

@Injectable()
export class MarkNotificationReadUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository) {}

  async execute(managerId: string, id: string): Promise<void> {
    const found = await this.repository.markRead(managerId, id);
    if (!found) throw new NotificationNotFoundError();
  }

  async executeAll(managerId: string): Promise<void> {
    await this.repository.markAllRead(managerId);
  }
}
```

- [ ] **Step 4: Implement the controller**

```ts
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { ManagerAuthGuard } from "../../manager/infrastructure/manager-auth.guard.ts";
import { DEFAULT_LIMIT, ListNotificationsUseCase, MAX_LIMIT } from "../application/use-cases/list-notifications.use-case.ts";
import { MarkNotificationReadUseCase, NotificationNotFoundError } from "../application/use-cases/mark-notification-read.use-case.ts";
import type { NotificationType } from "../application/ports/notification.port.ts";

interface NotificationDto {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sectorName: string | null;
  readAt: string | null;
  createdAt: string;
}

function parseLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

@Controller("manager/notifications")
@UseGuards(ManagerAuthGuard)
export class NotificationController {
  constructor(
    @Inject(ListNotificationsUseCase) private readonly listNotifications: ListNotificationsUseCase,
    @Inject(MarkNotificationReadUseCase) private readonly markRead: MarkNotificationReadUseCase,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: NotificationDto[]; nextCursor: string | null; total: number | null }> {
    // Scoped to the authenticated manager and to nothing else — there is no
    // managerId parameter to tamper with.
    const page = await this.listNotifications.execute(request.manager!.id, {
      cursor: cursor ?? null,
      limit: parseLimit(limit),
    });

    return {
      items: page.items.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        sectorName: row.sectorName,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  @Get("unread-count")
  async unreadCount(@Req() request: Request): Promise<{ count: number }> {
    return { count: await this.listNotifications.unreadCount(request.manager!.id) };
  }

  @Patch(":id/read")
  @HttpCode(204)
  async read(@Req() request: Request, @Param("id") id: string): Promise<void> {
    try {
      await this.markRead.execute(request.manager!.id, id);
    } catch (error) {
      if (error instanceof NotificationNotFoundError) {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  @Post("read-all")
  @HttpCode(204)
  async readAll(@Req() request: Request): Promise<void> {
    await this.markRead.executeAll(request.manager!.id);
  }
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/notification`
Expected: PASS — 8 controller tests.

- [ ] **Step 6: Register and commit**

Add `NotificationController` to `NotificationModule`'s `controllers`, and `ListNotificationsUseCase`, `MarkNotificationReadUseCase`, `ManagerAuthGuard`, `ManagerTokenService` to its `providers`.

```bash
pnpm --filter @zelo/api test && pnpm --filter @zelo/api lint && pnpm --filter @zelo/api build
git add apps/api/src
git commit -m "feat(api): expose manager notification endpoints"
```

---

## Task 9: Web port, adapter and hooks

**Files:**
- Create: `apps/web/src/ports/manager-notifications.port.ts`
- Create: `apps/web/src/use-cases/list-manager-notifications.usecase.ts`
- Create: `apps/web/src/use-cases/mark-manager-notification-read.usecase.ts`
- Create: `apps/web/src/infrastructure/http/http-manager-notifications.adapter.ts`
- Create: `apps/web/src/app/container/manager-notifications.ts`
- Create: `apps/web/src/presentation/hooks/useManagerNotifications.ts`
- Modify: `apps/web/src/app/container/index.ts`
- Test: `apps/web/src/infrastructure/http/http-manager-notifications.adapter.test.ts`

**Interfaces:**
- Produces:
  - `ManagerNotificationSchema` / `type ManagerNotification { id, type, payload, sectorName, readAt, createdAt }`
  - `ManagerNotificationsPageSchema` / `type ManagerNotificationsPage { items, nextCursor, total }`
  - `interface ManagerNotificationsPort { fetchPage(token, query): Promise<ManagerNotificationsPage>; fetchUnreadCount(token): Promise<number>; markRead(token, id): Promise<void>; markAllRead(token): Promise<void> }`
  - `useManagerNotifications()` → `{ notifications, unreadCount, isLoading, error, markRead, markAllRead, refresh, isRefreshing }`
  - `useManagerUnreadCount()` → `number`

- [ ] **Step 1: Write the port**

```ts
import { z } from "zod";

export const MANAGER_NOTIFICATION_TYPES = [
  "INVITE_ACCEPTED",
  "INVITE_EXPIRED",
  "INVITE_EMAIL_FAILED",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_REACTIVATED",
  "SECTOR_BECAME_VISIBLE",
  "SECTOR_RISK_THRESHOLD",
] as const;

export const ManagerNotificationSchema = z.object({
  id: z.string(),
  type: z.enum(MANAGER_NOTIFICATION_TYPES),
  payload: z.record(z.unknown()),
  sectorName: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ManagerNotification = z.infer<typeof ManagerNotificationSchema>;

export const ManagerNotificationsPageSchema = z.object({
  items: z.array(ManagerNotificationSchema),
  nextCursor: z.string().nullable(),
  total: z.number().nullable(),
});
export type ManagerNotificationsPage = z.infer<typeof ManagerNotificationsPageSchema>;

export interface ManagerNotificationsPort {
  fetchPage(token: string, query: { cursor?: string | null; limit?: number }): Promise<ManagerNotificationsPage>;
  fetchUnreadCount(token: string): Promise<number>;
  markRead(token: string, id: string): Promise<void>;
  markAllRead(token: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing adapter test**

`apps/web/src/infrastructure/http/http-manager-notifications.adapter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpManagerNotificationsAdapter } from "./http-manager-notifications.adapter";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

const PAGE = {
  items: [
    {
      id: "n-1",
      type: "INVITE_ACCEPTED",
      payload: { kind: "manager", name: "Paulo" },
      sectorName: null,
      readAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    },
  ],
  nextCursor: null,
  total: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpManagerNotificationsAdapter", () => {
  it("sends the bearer token and parses the page", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(PAGE), { status: 200 }));

    const page = await new HttpManagerNotificationsAdapter().fetchPage("token", {});

    expect(page.items[0]!.id).toBe("n-1");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/manager/notifications");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("passes the cursor and limit through as query parameters", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(PAGE), { status: 200 }));

    await new HttpManagerNotificationsAdapter().fetchPage("token", { cursor: "n-9", limit: 25 });

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("cursor=n-9");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("limit=25");
  });

  it("omits the cursor parameter entirely on the first page", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(PAGE), { status: 200 }));

    await new HttpManagerNotificationsAdapter().fetchPage("token", { cursor: null });

    expect(String(fetchSpy.mock.calls[0]![0])).not.toContain("cursor=");
  });

  it("raises UnauthorizedManagerError on a 401, so the session guard can react", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    await expect(new HttpManagerNotificationsAdapter().fetchPage("token", {})).rejects.toThrow(
      UnauthorizedManagerError,
    );
  });

  it("reads the unread count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ count: 7 }), { status: 200 }),
    );

    expect(await new HttpManagerNotificationsAdapter().fetchUnreadCount("token")).toBe(7);
  });

  it("marks one notification read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await new HttpManagerNotificationsAdapter().markRead("token", "n-1");

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/manager/notifications/n-1/read");
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("PATCH");
  });

  it("marks everything read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await new HttpManagerNotificationsAdapter().markAllRead("token");

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/manager/notifications/read-all");
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("POST");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/infrastructure/http/http-manager-notifications.adapter.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement the adapter**

```ts
import type {
  ManagerNotificationsPage,
  ManagerNotificationsPort,
} from "@/ports/manager-notifications.port";
import { ManagerNotificationsPageSchema } from "@/ports/manager-notifications.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function guard(response: Response, what: string): Promise<void> {
  if (response.status === 401) throw new UnauthorizedManagerError();
  if (!response.ok) throw new Error(`${what} failed with status ${response.status}`);
}

export class HttpManagerNotificationsAdapter implements ManagerNotificationsPort {
  async fetchPage(
    token: string,
    query: { cursor?: string | null; limit?: number },
  ): Promise<ManagerNotificationsPage> {
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";

    const response = await fetch(`${API_BASE_URL}/manager/notifications${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await guard(response, "manager notifications fetch");
    return ManagerNotificationsPageSchema.parse(await response.json());
  }

  async fetchUnreadCount(token: string): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/manager/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await guard(response, "manager unread count fetch");
    const body = (await response.json()) as { count: number };
    return body.count;
  }

  async markRead(token: string, id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    await guard(response, "mark notification read");
  }

  async markAllRead(token: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await guard(response, "mark all notifications read");
  }
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/infrastructure/http/http-manager-notifications.adapter.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Add the use cases, container wiring and hook**

`apps/web/src/use-cases/list-manager-notifications.usecase.ts`:

```ts
import type { ManagerNotificationsPage, ManagerNotificationsPort } from "@/ports/manager-notifications.port";

export class ListManagerNotificationsUseCase {
  constructor(private readonly port: ManagerNotificationsPort) {}

  async execute(token: string, query: { cursor?: string | null; limit?: number } = {}): Promise<ManagerNotificationsPage> {
    return this.port.fetchPage(token, query);
  }

  async unreadCount(token: string): Promise<number> {
    return this.port.fetchUnreadCount(token);
  }
}
```

`apps/web/src/use-cases/mark-manager-notification-read.usecase.ts`:

```ts
import type { ManagerNotificationsPort } from "@/ports/manager-notifications.port";

export class MarkManagerNotificationReadUseCase {
  constructor(private readonly port: ManagerNotificationsPort) {}

  async execute(token: string, id: string): Promise<void> {
    return this.port.markRead(token, id);
  }

  async executeAll(token: string): Promise<void> {
    return this.port.markAllRead(token);
  }
}
```

`apps/web/src/app/container/manager-notifications.ts`:

```ts
import { ListManagerNotificationsUseCase } from "@/use-cases/list-manager-notifications.usecase";
import { MarkManagerNotificationReadUseCase } from "@/use-cases/mark-manager-notification-read.usecase";
import { HttpManagerNotificationsAdapter } from "@/infrastructure/http/http-manager-notifications.adapter";

const port = new HttpManagerNotificationsAdapter();

export const listManagerNotificationsUseCase = new ListManagerNotificationsUseCase(port);
export const markManagerNotificationReadUseCase = new MarkManagerNotificationReadUseCase(port);
```

Re-export both from `apps/web/src/app/container/index.ts`, matching how `manager-dashboard.ts` is re-exported there.

`apps/web/src/presentation/hooks/useManagerNotifications.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listManagerNotificationsUseCase,
  markManagerNotificationReadUseCase,
} from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

const LIST_KEY = "manager-notifications";
const COUNT_KEY = "manager-notifications-unread";

/** The badge lives on every panel screen, so it gets its own light query. */
export function useManagerUnreadCount(): number {
  const token = useManagerSessionStore((state) => state.token);

  const { data } = useQuery({
    queryKey: [COUNT_KEY, token],
    queryFn: () => listManagerNotificationsUseCase.unreadCount(token!),
    enabled: token !== null,
    retry: false,
  });

  return data ?? 0;
}

export function useManagerNotifications() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: [LIST_KEY, token],
    queryFn: () => listManagerNotificationsUseCase.execute(token!),
    enabled: token !== null,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markManagerNotificationReadUseCase.execute(token!, id),
    // Optimistic: the row and the badge both settle before the round trip, and
    // both roll back together if it fails.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: [LIST_KEY, token] });
      await queryClient.cancelQueries({ queryKey: [COUNT_KEY, token] });
      const previousList = queryClient.getQueryData([LIST_KEY, token]);
      const previousCount = queryClient.getQueryData([COUNT_KEY, token]);

      queryClient.setQueryData([LIST_KEY, token], (page: unknown) => {
        const typed = page as { items: { id: string; readAt: string | null }[] } | undefined;
        if (!typed) return page;
        return {
          ...typed,
          items: typed.items.map((item) =>
            item.id === id && item.readAt === null ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        };
      });
      queryClient.setQueryData([COUNT_KEY, token], (count: unknown) =>
        typeof count === "number" ? Math.max(0, count - 1) : count,
      );

      return { previousList, previousCount };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData([LIST_KEY, token], context?.previousList);
      queryClient.setQueryData([COUNT_KEY, token], context?.previousCount);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [LIST_KEY, token] });
      void queryClient.invalidateQueries({ queryKey: [COUNT_KEY, token] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => markManagerNotificationReadUseCase.executeAll(token!),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [LIST_KEY, token] });
      void queryClient.invalidateQueries({ queryKey: [COUNT_KEY, token] });
    },
  });

  return {
    notifications: list.data?.items ?? [],
    total: list.data?.total ?? null,
    isLoading: list.isLoading,
    error: list.error,
    isRefreshing: list.isFetching && !list.isLoading,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: [LIST_KEY, token] });
      void queryClient.invalidateQueries({ queryKey: [COUNT_KEY, token] });
    },
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
  };
}
```

- [ ] **Step 7: Run and commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): read manager notifications from the API"
```

---

## Task 10: The page, the badge, and deleting the placeholder

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerNotificationsPage.tsx`
- Modify: `apps/web/src/presentation/layout/ManagerSidebar.tsx`
- Modify: `apps/web/src/presentation/layout/ManagerBottomNav.tsx`
- Modify: `apps/web/src/presentation/layout/ManagerNav.test.tsx`
- Delete: `apps/web/src/stores/manager-notifications.store.ts`
- Create: `apps/web/src/presentation/pages/manager-notification-copy.ts`
- Test: `apps/web/src/presentation/pages/ManagerNotificationsPage.test.tsx`

**Interfaces:**
- Consumes: `useManagerNotifications`, `useManagerUnreadCount` (Task 9); `Pill`, `Button` primitives; `ManagerUnreadBadge`.
- Produces: `notificationCopy(notification): { evento: string; detalhe: string }`.

- [ ] **Step 1: Write the copy module**

`apps/web/src/presentation/pages/manager-notification-copy.ts`:

```ts
import type { ManagerNotification } from "@/ports/manager-notifications.port";

const percent = (value: unknown): string =>
  typeof value === "number" ? `${Math.round(value * 100)}%` : "—";

// The API stores structured facts, not sentences, so the wording lives here and
// a copy fix never needs a migration.
export function notificationCopy(notification: ManagerNotification): { evento: string; detalhe: string } {
  const p = notification.payload;
  const name = typeof p.name === "string" ? p.name : "A conta";
  const sector = notification.sectorName ?? "O setor";

  switch (notification.type) {
    case "INVITE_ACCEPTED":
      return { evento: "Convite aceito", detalhe: `${name} concluiu o cadastro e já tem acesso.` };
    case "INVITE_EXPIRED":
      return { evento: "Convite expirado", detalhe: `O convite de ${name} expirou sem ser usado.` };
    case "INVITE_EMAIL_FAILED":
      return {
        evento: "Falha no envio do convite",
        detalhe: `Não foi possível enviar o convite para ${typeof p.email === "string" ? p.email : name}.`,
      };
    case "ACCOUNT_DEACTIVATED":
      return { evento: "Conta desativada", detalhe: `${name} não tem mais acesso ao painel.` };
    case "ACCOUNT_REACTIVATED":
      return { evento: "Conta reativada", detalhe: `${name} voltou a ter acesso ao painel.` };
    case "SECTOR_BECAME_VISIBLE":
      return {
        evento: "Setor com dados visíveis",
        detalhe: `${sector} atingiu respostas suficientes e já pode ser acompanhado.`,
      };
    case "SECTOR_RISK_THRESHOLD":
      return p.trigger === "delta"
        ? {
            evento: "Piora no setor",
            detalhe: `${sector} subiu ${percent(
              typeof p.rate === "number" && typeof p.previousRate === "number" ? p.rate - p.previousRate : null,
            )} em relação à semana anterior.`,
          }
        : {
            evento: "Setor acima do limiar",
            detalhe: `${sector} fechou a semana com ${percent(p.rate)} de respostas preocupantes.`,
          };
  }
}
```

- [ ] **Step 2: Write the failing page test**

`apps/web/src/presentation/pages/ManagerNotificationsPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerNotificationsPage } from "./ManagerNotificationsPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

const UNREAD = {
  id: "n-1",
  type: "INVITE_ACCEPTED" as const,
  payload: { kind: "manager", name: "Paulo" },
  sectorName: null,
  readAt: null,
  createdAt: "2026-08-20T10:00:00.000Z",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ManagerNotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  useManagerSessionStore
    .getState()
    .setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  vi.restoreAllMocks();
});

describe("ManagerNotificationsPage", () => {
  it("renders the eyebrow, title and orientation paragraph every panel page shares", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Notificações" })).toBeInTheDocument();
    expect(
      screen.getByText(/Alertas do sistema sobre sinais agregados, convites e integrações/),
    ).toBeInTheDocument();
  });

  it("shows the empty state when nothing has happened yet", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    renderPage();

    expect(await screen.findByText("Nenhuma notificação por aqui.")).toBeInTheDocument();
  });

  it("renders an unread row with its PT-BR copy and the warning pill", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);

    renderPage();

    expect(await screen.findByText("Convite aceito")).toBeInTheDocument();
    expect(screen.getByText("Paulo concluiu o cadastro e já tem acesso.")).toBeInTheDocument();
    expect(screen.getByText("Não lida")).toBeInTheDocument();
  });

  it("marks a row read by clicking anywhere on it, not only a control", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
    const markRead = vi
      .spyOn(container.markManagerNotificationReadUseCase, "execute")
      .mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Convite aceito/ }));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("token", "n-1"));
  });

  it("refetches on Atualizar, which is the manual stand-in for push", async () => {
    const list = vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Nenhuma notificação por aqui.");
    const before = list.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Atualizar" }));

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerNotificationsPage.test.tsx`
Expected: FAIL — the placeholder page has no such content.

- [ ] **Step 4: Implement the page**

```tsx
import { RefreshCw } from "lucide-react";
import { Button } from "@/presentation/ui/Button";
import { Pill } from "@/presentation/ui/Pill";
import { useManagerNotifications } from "@/presentation/hooks/useManagerNotifications";
import { notificationCopy } from "./manager-notification-copy";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };

export function ManagerNotificationsPage() {
  const { notifications, isLoading, error, refresh, isRefreshing, markRead } = useManagerNotifications();

  return (
    <div className="flex flex-col gap-5 pt-6">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-eyebrow text-muted uppercase">Painel do gestor</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-h2 text-ink lg:text-h1">Notificações</h1>
          <Button variant="outline" size="sm" full={false} onClick={refresh} isLoading={isRefreshing}>
            <RefreshCw size={16} aria-hidden="true" />
            Atualizar
          </Button>
        </div>
        <p className="max-w-[62ch] text-label text-muted">
          Alertas do sistema sobre sinais agregados, convites e integrações. Marque como lida para
          tirar da lista.
        </p>
      </header>

      {error && (
        <p role="alert" className="text-label text-danger">
          Não foi possível carregar as notificações.
        </p>
      )}

      {!isLoading && !error && notifications.length === 0 && (
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <p className="text-body text-ink">Nenhuma notificação por aqui.</p>
          <p className="mt-1 text-label text-muted">
            Avisamos assim que algo precisar da sua atenção.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {notifications.map((notification) => {
          const { evento, detalhe } = notificationCopy(notification);
          const unread = notification.readAt === null;
          return (
            <li key={notification.id}>
              {/* The whole row is the control: the spec asks for a click anywhere
                  to mark read, and a <button> is what makes that reachable by
                  keyboard as well as by tap. */}
              <button
                type="button"
                onClick={() => unread && markRead(notification.id)}
                aria-label={`${evento}. ${detalhe}`}
                className={`flex w-full flex-col gap-2 rounded-card border px-cell-x py-cell-y text-left motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none md:flex-row md:items-center md:justify-between ${
                  unread ? "border-warn bg-warn-bg/40 cursor-pointer" : "border-line bg-surface"
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-sans text-body-strong text-ink">{evento}</span>
                  <span className="block text-label text-muted">{detalhe}</span>
                </span>
                <span className="flex flex-none items-center gap-3">
                  <span className="font-mono text-mono-data text-muted-2">
                    {new Date(notification.createdAt).toLocaleDateString("pt-BR", DATE_FORMAT)}
                  </span>
                  {unread ? <Pill tone="warning">Não lida</Pill> : <Pill tone="neutral">Lida</Pill>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerNotificationsPage.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 6: Point the badge at the API and delete the placeholder store**

In `ManagerSidebar.tsx` and `ManagerBottomNav.tsx`, replace

```ts
import { useManagerUnreadCount } from "@/stores/manager-notifications.store";
```

with

```ts
import { useManagerUnreadCount } from "@/presentation/hooks/useManagerNotifications";
```

Then delete the store:

```bash
rm apps/web/src/stores/manager-notifications.store.ts
```

`ManagerNav.test.tsx` seeds unread counts through that store. Replace its `unread(count)` helper with a spy on the use case, and wrap `mount` in a `QueryClientProvider`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function mount(node: React.ReactNode, at = "/manager") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[at]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function unread(count: number) {
  vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(count);
}
```

The two badge assertions become `await screen.findByRole("status", ...)`, since the count now arrives asynchronously. Remove the `useManagerNotificationsStore` import and its `afterEach` reset.

- [ ] **Step 7: Run the whole web suite**

Run: `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build`
Expected: PASS. `grep -r "manager-notifications.store" apps/web/src` must return nothing.

- [ ] **Step 8: Add the page to the accessibility sweep**

In `apps/web/src/presentation/pages/a11y.test.tsx`, add `ManagerNotificationsPage` to the `SCREENS` array with `path: "/manager/notifications"`. The mount helper there already provides a `QueryClientProvider`.

Run: `pnpm --filter web exec vitest run src/presentation/pages/a11y.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git rm --cached apps/web/src/stores/manager-notifications.store.ts 2>/dev/null || true
git commit -m "feat(web): notifications page backed by the API, badge switched off the placeholder store"
```

---

## Done

After Task 10 the feature is complete end to end. Remaining spec items are explicitly deferred and belong to other work:

- **Real-time delivery and critical-path email** — the `publish` seam exists for both; neither is built.
- **Configurable thresholds** — `thresholds.ts` is the single point `docs/superpowers/specs/2026-08-23-institution-settings-design.md` replaces.
- **Notification families toggle** — `enabledNotificationFamilies` belongs to that same settings spec.

A note worth carrying forward: in production the badge will read zero until something calls `publish`, which now happens on real invite acceptances, account changes, k-crossings, lapsed invites, email failures and weekly risk evaluations. There is no seeded data — the first notification a manager sees will be a real one.
