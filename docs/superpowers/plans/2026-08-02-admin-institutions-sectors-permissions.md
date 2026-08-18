# Admin Panel: Institutions, Sectors, and Manager Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-level `SuperAdmin` role that creates institutions, a `Sector` entity admin-registered per institution, `Manager.role` (`HOSPITAL_ADMIN` | `SECTOR_MANAGER`) with sector-scoped permissions, a hospital-admin panel to manage sectors/managers, a sector filter on the manager dashboard, and a sector picker replacing free-text department in the device-linking flow.

**Architecture:** Backend (NestJS + Prisma) gains one new module (`admin`, mirroring the existing `manager` module's auth pattern exactly: password service, token service, guard, repository, login use-case) plus a new `sector` module (repository/port only, consumed by `manager` and `institution` modules). `Signal.department` (free text) becomes `Signal.sectorId` (FK) — a clean-cutover schema change, no backfill. `Manager` gains `role`/`isActive`, carried through the existing session token alongside `institutionId`. Every manager-scoped endpoint resolves an "accessible sector set" server-side (all active sectors for `HOSPITAL_ADMIN`, assigned-only for `SECTOR_MANAGER`) before querying `Signal`. Frontend follows the codebase's existing manual-DI pattern (`container.ts` wiring use-cases to HTTP adapters) — no new framework, no new state-management library.

**Tech Stack:** NestJS + Prisma (backend), Vitest + supertest, Node `crypto` (scrypt password hashing, HMAC token signing — matching existing `ManagerPasswordService`/`ManagerTokenService`), React 18 + Vite + Zustand + TanStack Query (frontend), Zod for request/response validation on both sides.

## Global Constraints

- Every new module/file follows the exact conventions already in this codebase: kebab-case files with role suffixes (`*.use-case.ts`, `*.port.ts`, `*.repository.ts`, `*.service.ts`, `*.guard.ts`, `*.controller.ts`), PascalCase classes, DI tokens as `Symbol("SCREAMING_SNAKE_NAME")` exported alongside the port interface, tests co-located as `*.test.ts`, explicit `.ts` import extensions (ESM).
- Thin Prisma-passthrough repositories are **not unit-tested individually** (existing convention, restated in `2026-08-02-institution-model-and-manager-scoping.md`'s Global Constraints) — they're exercised indirectly through controller integration tests (NestJS `Test.createTestingModule` + `supertest`, fake repositories injected via DI tokens, no real Postgres in these tests).
- `institutionId` (and, from Task 3 onward, `role`) is carried inside the signed session token payload (JSON, HMAC-signed) — never trust a client-supplied value for either from a request body or query param anywhere in this plan.
- `SuperAdmin` rows are seed-created only — no self-service signup endpoint exists anywhere in this plan (mirrors `Manager`'s existing bootstrap pattern).
- Deactivation, never deletion, for `Manager` and `Sector` — no DELETE endpoint for either anywhere in this plan.
- One manager per sector (`Sector.managerId` is a plain nullable FK, not a join table); a manager may hold several sectors.
- `HOSPITAL_ADMIN` always sees every active sector in its institution regardless of any explicit assignment — there is no separate "assign all sectors" step for that role anywhere in this plan.
- Every step that touches an existing test file states whether it's a full replacement or an addition — follow that exactly; don't invent extra assertions or drop existing ones not called out.
- Full spec: `docs/superpowers/specs/2026-08-02-admin-institutions-sectors-permissions-design.md`. Read it once before starting Task 1 if anything below feels underspecified — this plan implements it exactly, and the spec has the "why" behind each choice.

---

### Task 1: Prisma schema + migration — `SuperAdmin`, `Sector`, `Manager.role`/`isActive`, `Signal.sectorId`

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_admin_sectors_permissions/migration.sql` (hand-edited after `--create-only`)

**Interfaces:**

- Produces (used by every later task): Prisma models `SuperAdmin { id, name (unique), passwordHash, createdAt }`; `Sector { id, institutionId (FK), name, isActive, managerId (nullable FK to Manager), createdAt }` with `@@unique([institutionId, name])`; `ManagerRole` enum (`HOSPITAL_ADMIN` | `SECTOR_MANAGER`); `Manager.role` (default `HOSPITAL_ADMIN`), `Manager.isActive` (default `true`); `Signal.sectorId` (FK to `Sector`, replacing `Signal.department`) with `@@unique([institutionId, sectorId, weekStart])`.

- [ ] **Step 1: Update the schema**

In `apps/api/prisma/schema.prisma`, add the new models and enum, and modify `Manager`/`Signal`:

```prisma
model SuperAdmin {
  id           String   @id @default(cuid())
  name         String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  @@map("super_admins")
}

enum ManagerRole {
  HOSPITAL_ADMIN
  SECTOR_MANAGER
}

model Sector {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  name          String
  isActive      Boolean     @default(true)
  managerId     String?
  manager       Manager?    @relation(fields: [managerId], references: [id])
  createdAt     DateTime    @default(now())

  signals       Signal[]

  @@unique([institutionId, name])
  @@map("sectors")
}
```

Replace the `Signal` model:

```prisma
model Signal {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  sectorId      String
  sector        Sector      @relation(fields: [sectorId], references: [id])
  weekStart     DateTime
  checkIns      Int         @default(0)
  concerning    Int         @default(0)
  createdAt     DateTime    @default(now())

  @@unique([institutionId, sectorId, weekStart])
  @@map("signals")
}
```

Replace the `Manager` model:

```prisma
model Manager {
  id            String      @id @default(cuid())
  name          String      @unique
  passwordHash  String
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  role          ManagerRole @default(HOSPITAL_ADMIN)
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())

  sectors       Sector[]

  @@map("managers")
}
```

Add `sectors Sector[]` to the `Institution` model's relation list (alongside its existing `managers`, `managerInsights`, `signals`).

- [ ] **Step 2: Generate a migration skeleton without applying it**

Local Postgres must be running:

```bash
docker compose -f docker/docker-compose.yml up -d postgres
```

From `apps/api/`:

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate dev --create-only --name add_admin_sectors_permissions
```

This creates `apps/api/prisma/migrations/<timestamp>_add_admin_sectors_permissions/migration.sql` with Prisma's auto-generated diff but does not apply it — expected, since Prisma can't know `signals` should drop/recreate rather than error on the new required `sectorId` column. The next step replaces its content entirely.

- [ ] **Step 3: Replace the migration file's content by hand**

Open the generated `migration.sql` and replace its entire content with:

```sql
-- CreateTable
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "super_admins_name_key" ON "super_admins"("name");

-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('HOSPITAL_ADMIN', 'SECTOR_MANAGER');

-- AlterTable managers: add role/isActive with safe defaults, no backfill needed
ALTER TABLE "managers" ADD COLUMN "role" "ManagerRole" NOT NULL DEFAULT 'HOSPITAL_ADMIN';
ALTER TABLE "managers" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable sectors (before signals, since signals.sectorId FKs into it)
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sectors_institutionId_name_key" ON "sectors"("institutionId", "name");
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable signals (demo-only, disposable data — clean cutover, no backfill, re-seeded after this migration)
DROP TABLE "signals";

-- CreateTable signals (replaces the department-keyed table with a sectorId FK)
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "checkIns" INTEGER NOT NULL DEFAULT 0,
    "concerning" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "signals_institutionId_sectorId_weekStart_key" ON "signals"("institutionId", "sectorId", "weekStart");
ALTER TABLE "signals" ADD CONSTRAINT "signals_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "signals" ADD CONSTRAINT "signals_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate dev
```

Expected: Prisma detects the already-written migration file, applies it, and regenerates the client (`apps/api/generated/prisma`) — no new migration is created.

- [ ] **Step 5: Verify against local data**

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "\dt"
```

Expected output includes `super_admins` and `sectors`, `signals` still present (recreated with the new shape).

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "\d signals"
```

Expected: `sectorId` column present, `department` column gone.

- [ ] **Step 6: Verify the client compiles against every existing usage**

```bash
pnpm --filter @zelo/api exec tsc --noEmit
```

Expected: FAILS in several places — this is expected, and later tasks fix every one:

- `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`, `prisma-signal.repository.ts`, `get-manager-signals.use-case.ts` (+ its test) reference `row.department` — fixed by Task 2.
- `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`, `prisma-signal-checkin.repository.ts`, `record-signal-checkin.use-case.ts`, `signal-checkin.controller.ts` (+ tests) reference `department` — fixed by Task 2.
- `apps/api/prisma/seed-data.ts`, `seed.ts` reference `SimulatedSignalSeedRow.department` and don't yet create `Sector`/`SuperAdmin` rows or set `Manager.role` — fixed by Task 12 (left broken until then, matching this codebase's established "later tasks fix every compile error" pattern from the prior migration plan).

Skim the full error list once and confirm every error's file is one of the ones named above — if `tsc` reports an error in a file not covered by a later task, stop and investigate before continuing.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add SuperAdmin, Sector, ManagerRole, and Signal.sectorId to the schema"
```

---

### Task 2: `Signal.department` → `Signal.sectorId` rename (repository, use-case, check-in)

**Files:**

- Modify: `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
- Modify: `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts`
- Modify: `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts`
- Modify: `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.test.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`

**Interfaces:**

- Consumes: `Signal.sectorId`, `Sector.name` (Task 1).
- Produces (used later by Task 10, which layers sector-filtering on top once `SectorRepository` exists — deliberately **not** built here, since the "who can see which sectors" resolution this task's use-case would otherwise need doesn't exist until Task 7): `SignalRepository.findAll(institutionId: string): Promise<SignalRow[]>` — unfiltered, every sector in the institution — where `SignalRow = { sectorId: string; sectorName: string; weekStart: Date; checkIns: number; concerning: number }`; `GetManagerSignalsUseCase.execute(institutionId: string): Promise<ManagerSignalsResponse>` (same single-argument signature as before this task, response shape unchanged — `segments[].label` is still the display name, just sourced from `sectorName` now instead of the free-text `department`); `RecordSignalCheckinUseCase.execute(input: { institutionId, sectorId, concerning, deviceSignalId }, now?)`; `UnknownInstitutionOrSectorError` (renamed from `UnknownInstitutionError`).

- [ ] **Step 1: Write the failing test for `GetManagerSignalsUseCase`**

Replace `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts` in full — every row now has `sectorId`/`sectorName` instead of `department`; `execute()`'s signature is otherwise untouched by this task (still one argument, still returns every sector unfiltered — Task 10 is what adds a filter parameter, once there's a real notion of "which sectors can this manager see" to feed it):

```ts
import { describe, expect, it } from "vitest";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SignalRepository, SignalRow } from "../ports/signal-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../ports/simulated-follow-up-repository.port.ts";

class FakeSignalRepository implements SignalRepository {
  public lastInstitutionId: string | null = null;
  constructor(private readonly rows: SignalRow[]) {}
  async findAll(institutionId: string): Promise<SignalRow[]> {
    this.lastInstitutionId = institutionId;
    return this.rows;
  }
}

class FakeSimulatedFollowUpRepository implements SimulatedFollowUpRepository {
  constructor(private readonly rows: SimulatedFollowUpRow[]) {}
  async findAll(): Promise<SimulatedFollowUpRow[]> {
    return this.rows;
  }
}

const WEEK_1 = new Date("2026-06-15T00:00:00.000Z");
const WEEK_2 = new Date("2026-06-22T00:00:00.000Z"); // most recent

describe("GetManagerSignalsUseCase", () => {
  it("passes the given institutionId through to the repository", async () => {
    const repository = new FakeSignalRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    await useCase.execute("institution-1");

    expect(repository.lastInstitutionId).toBe("institution-1");
  });

  it("computes segments from the most recent week only, excluding sectors under k=5, labeling by sectorName", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.segments).toEqual(
      expect.arrayContaining([
        { label: "A", value: 60, n: 10 },
        { label: "B", value: 40, n: 10 },
      ]),
    );
    expect(result.segments).toHaveLength(2); // "C" (n=4) suppressed
  });

  it("computes overallConcerningRate from only the visible sectors' most recent week", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.overallConcerningRate).toBe(0.5); // (6+4)/(10+10), C excluded
  });

  it("computes weeklyTrend and checkInsLast4Weeks as sums including the suppressed sector", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "a", sectorName: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.weeklyTrend).toEqual([
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.375 },
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5 },
    ]);
    expect(result.checkInsLast4Weeks).toBe(48);
  });

  it("returns 0 for overallConcerningRate (not NaN) when every sector is suppressed", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "tiny", sectorName: "Tiny", weekStart: WEEK_2, checkIns: 2, concerning: 1 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.segments).toEqual([]);
    expect(result.overallConcerningRate).toBe(0);
    expect(result.checkInsLast4Weeks).toBe(2);
  });

  it("returns all-zero/empty output for an unseeded (empty) database, without crashing", async () => {
    const repository = new FakeSignalRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result).toEqual({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
    });
  });
});

describe("GetManagerSignalsUseCase - followUpResponseRate", () => {
  it("computes the rate from the most recent week only", async () => {
    const repository = new FakeSignalRepository([]);
    const followUpRepository = new FakeSimulatedFollowUpRepository([
      { weekStart: WEEK_1, sent: 20, responded: 5 },
      { weekStart: WEEK_2, sent: 20, responded: 15 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, followUpRepository);

    const result = await useCase.execute("institution-1");

    expect(result.followUpResponseRate).toBe(0.75);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test get-manager-signals -- --run`
Expected: FAIL — `SignalRow` still has `department`.

- [ ] **Step 3: Update the signal repository port**

Replace `apps/api/src/modules/manager/application/ports/signal-repository.port.ts` in full:

```ts
export interface SignalRow {
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

export interface SignalRepository {
  findAll(institutionId: string): Promise<SignalRow[]>;
}

export const SIGNAL_REPOSITORY = Symbol("SIGNAL_REPOSITORY");
```

- [ ] **Step 4: Update the Prisma adapter**

Replace `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { SignalRepository, SignalRow } from "../../application/ports/signal-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaSignalRepository implements SignalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(institutionId: string): Promise<SignalRow[]> {
    const rows = await this.prisma.signal.findMany({
      where: { institutionId },
      select: { sectorId: true, weekStart: true, checkIns: true, concerning: true, sector: { select: { name: true } } },
    });
    return rows.map((row) => ({
      sectorId: row.sectorId,
      sectorName: row.sector.name,
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    }));
  }
}
```

- [ ] **Step 5: Update `GetManagerSignalsUseCase`**

Replace `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts` in full — only the internal grouping key changes (`department` string → `sectorId`, labeling by `sectorName`); the method signature and every branch of control flow are otherwise identical to what this use-case already did:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { K_ANONYMITY_THRESHOLD } from "../constants.ts";
import { SIGNAL_REPOSITORY, type SignalRepository, type SignalRow } from "../ports/signal-repository.port.ts";
import {
  SIMULATED_FOLLOW_UP_REPOSITORY,
  type SimulatedFollowUpRepository,
} from "../ports/simulated-follow-up-repository.port.ts";

export interface ManagerSignalsResponse {
  overallConcerningRate: number;
  checkInsLast4Weeks: number;
  weeklyTrend: { weekStart: string; concerningRate: number }[];
  segments: { label: string; value: number; n: number }[];
  followUpResponseRate: number;
}

const RECENT_WEEKS_FOR_VOLUME = 4;

@Injectable()
export class GetManagerSignalsUseCase {
  constructor(
    @Inject(SIGNAL_REPOSITORY) private readonly repository: SignalRepository,
    @Inject(SIMULATED_FOLLOW_UP_REPOSITORY) private readonly followUpRepository: SimulatedFollowUpRepository,
  ) {}

  async execute(institutionId: string): Promise<ManagerSignalsResponse> {
    const rows = await this.repository.findAll(institutionId);
    const followUpResponseRate = await this.computeFollowUpResponseRate();

    if (rows.length === 0) {
      return { overallConcerningRate: 0, checkInsLast4Weeks: 0, weeklyTrend: [], segments: [], followUpResponseRate };
    }

    const weekTimes = [...new Set(rows.map((r) => r.weekStart.getTime()))].sort((a, b) => a - b);
    const mostRecentWeek = weekTimes[weekTimes.length - 1]!;

    const bySector = new Map<string, SignalRow[]>();
    for (const row of rows) {
      const list = bySector.get(row.sectorId) ?? [];
      list.push(row);
      bySector.set(row.sectorId, list);
    }

    const segments: { label: string; value: number; n: number }[] = [];
    let visibleConcerning = 0;
    let visibleCheckIns = 0;

    for (const [, sectorRows] of bySector) {
      const currentWeekRow = sectorRows.find((r) => r.weekStart.getTime() === mostRecentWeek);
      if (!currentWeekRow || currentWeekRow.checkIns < K_ANONYMITY_THRESHOLD) continue;

      segments.push({
        label: currentWeekRow.sectorName,
        value: Math.round((currentWeekRow.concerning / currentWeekRow.checkIns) * 100),
        n: currentWeekRow.checkIns,
      });
      visibleConcerning += currentWeekRow.concerning;
      visibleCheckIns += currentWeekRow.checkIns;
    }

    const overallConcerningRate = visibleCheckIns === 0 ? 0 : visibleConcerning / visibleCheckIns;

    const recentWeekTimes = new Set(weekTimes.slice(-RECENT_WEEKS_FOR_VOLUME));
    const checkInsLast4Weeks = rows
      .filter((r) => recentWeekTimes.has(r.weekStart.getTime()))
      .reduce((sum, r) => sum + r.checkIns, 0);

    const weeklyTrend = weekTimes.map((weekTime) => {
      const weekRows = rows.filter((r) => r.weekStart.getTime() === weekTime);
      const totalCheckIns = weekRows.reduce((sum, r) => sum + r.checkIns, 0);
      const totalConcerning = weekRows.reduce((sum, r) => sum + r.concerning, 0);
      return {
        weekStart: new Date(weekTime).toISOString(),
        concerningRate: totalCheckIns === 0 ? 0 : totalConcerning / totalCheckIns,
      };
    });

    return { overallConcerningRate, checkInsLast4Weeks, weeklyTrend, segments, followUpResponseRate };
  }

  private async computeFollowUpResponseRate(): Promise<number> {
    const rows = await this.followUpRepository.findAll();
    if (rows.length === 0) return 0;

    const mostRecent = rows.reduce((latest, row) => (row.weekStart > latest.weekStart ? row : latest));
    return mostRecent.sent === 0 ? 0 : mostRecent.responded / mostRecent.sent;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test get-manager-signals -- --run`
Expected: PASS (all tests).

- [ ] **Step 7: Write the failing test for `RecordSignalCheckinUseCase`**

Replace `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { RecordSignalCheckinUseCase } from "./record-signal-checkin.use-case.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../ports/signal-checkin-repository.port.ts";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public lastParams: RecordCheckinParams | null = null;
  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    this.lastParams = params;
  }
}

describe("RecordSignalCheckinUseCase", () => {
  it("computes weekStart and a dedupKey hashing in sectorId, and forwards to the repository", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: true, deviceSignalId: "device-1" },
      now,
    );

    expect(repository.lastParams).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      concerning: true,
      dedupKey: expect.any(String),
    });
  });

  it("produces a different dedupKey for a different sectorId, same device/institution/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" }, now);
    const first = repository.lastParams!.dedupKey;

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-2", concerning: false, deviceSignalId: "device-1" }, now);
    const second = repository.lastParams!.dedupKey;

    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test record-signal-checkin -- --run`
Expected: FAIL — `RecordSignalCheckinInput` and `RecordCheckinParams` still use `department`.

- [ ] **Step 9: Update the check-in port, use-case, and Prisma adapter**

Replace `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts` in full:

```ts
export interface RecordCheckinParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  concerning: boolean;
  dedupKey: string;
}

export interface SignalCheckinRepository {
  recordCheckin(params: RecordCheckinParams): Promise<void>;
}

export const SIGNAL_CHECKIN_REPOSITORY = Symbol("SIGNAL_CHECKIN_REPOSITORY");

// Thrown by the repository when institutionId or sectorId don't match a real
// Institution/Sector (a foreign-key violation on the Signal insert/update) —
// mapped to a 400 by the controller.
export class UnknownInstitutionOrSectorError extends Error {}
```

Replace `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts` in full:

```ts
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "../../../../shared/date/start-of-iso-week.ts";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  type SignalCheckinRepository,
} from "../ports/signal-checkin-repository.port.ts";

export interface RecordSignalCheckinInput {
  institutionId: string;
  sectorId: string;
  concerning: boolean;
  deviceSignalId: string;
}

@Injectable()
export class RecordSignalCheckinUseCase {
  constructor(@Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository) {}

  async execute(input: RecordSignalCheckinInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(`${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordCheckin({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      concerning: input.concerning,
      dedupKey,
    });
  }
}
```

Replace `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../../application/ports/signal-checkin-repository.port.ts";
import { UnknownInstitutionOrSectorError } from "../../application/ports/signal-checkin-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const FOREIGN_KEY_VIOLATION = "P2003";

@Injectable()
export class PrismaSignalCheckinRepository implements SignalCheckinRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.signalDedupKey.create({ data: { dedupKey: params.dedupKey } });
        await tx.signal.upsert({
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
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION) {
        throw new UnknownInstitutionOrSectorError();
      }
      throw error;
    }
  }
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test record-signal-checkin -- --run`
Expected: PASS (all tests).

- [ ] **Step 11: Update the check-in controller and its test**

Replace `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts` in full:

```ts
import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import { UnknownInstitutionOrSectorError } from "../application/ports/signal-checkin-repository.port.ts";

const SignalCheckinSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  concerning: z.boolean(),
  deviceSignalId: z.string().min(1),
});

@Controller("signals")
export class SignalCheckinController {
  constructor(
    @Inject(RecordSignalCheckinUseCase) private readonly recordSignalCheckin: RecordSignalCheckinUseCase,
  ) {}

  @Post("checkin")
  @HttpCode(204)
  async checkin(@Body() body: unknown): Promise<void> {
    const parsed = SignalCheckinSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.recordSignalCheckin.execute(parsed.data);
    } catch (error) {
      if (error instanceof UnknownInstitutionOrSectorError) {
        throw new BadRequestException("Unknown institutionId or sectorId");
      }
      throw error;
    }
  }
}
```

In `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`, replace every request body's `department: "..."` field with `sectorId: "..."` (same test structure, same assertions — only the field name in the sent payload changes) and rename any reference to `UnknownInstitutionError` to `UnknownInstitutionOrSectorError`.

- [ ] **Step 12: Run the full API test suite and verify only the expected failures remain**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: the tests touched in this task pass. Two more failures are expected and not a regression to fix now: `manager.controller.test.ts` — its `FakeSignalRepository`/seeded rows still use the pre-Task-2 `SignalRow` shape (`department` instead of `sectorId`/`sectorName`), fixed in Task 3 Step 12 alongside that same file's `role`/`isActive` updates (grouping both fixes there avoids touching this file's fixtures twice); and anything `seed.ts`/`seed-data.ts`-dependent, fixed in Task 12. If any *other* test fails, stop and investigate.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/manager/application/ports/signal-repository.port.ts \
        apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts \
        apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts \
        apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts \
        apps/api/src/modules/signal-checkin
git commit -m "refactor(api): rewire Signal aggregation and check-in recording from free-text department to sectorId"
```

---

### Task 3: Carry `role`/`isActive` through Manager login, token, guard — plus a new `HospitalAdminGuard`

**Files:**

- Modify: `apps/api/src/modules/manager/application/ports/manager-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts`
- Modify: `apps/api/src/modules/manager/application/services/manager-token.service.ts`
- Modify: `apps/api/src/modules/manager/application/services/manager-token.service.test.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts`
- Create: `apps/api/src/modules/manager/infrastructure/hospital-admin.guard.ts`
- Create: `apps/api/src/modules/manager/infrastructure/hospital-admin.guard.test.ts`

**Interfaces:**

- Consumes: `Manager.role`, `Manager.isActive` (Task 1).
- Produces (used by every later task touching manager auth, and by Task 9's frontend nav gating): `ManagerRole` type (`"HOSPITAL_ADMIN" | "SECTOR_MANAGER"`), exported from `manager-repository.port.ts`; `ManagerRow { id, name, passwordHash, institutionId, role, isActive }`; `ManagerTokenService.issue(managerId, managerName, institutionId, role): IssuedManagerToken` where `IssuedManagerToken { token, expiresAt, role }` — **`role` is echoed in the plaintext response body, not just embedded in the opaque token**, so the frontend has a stable, documented way to know the logged-in manager's role for UI gating without parsing the token's internal encoding; `DecodedManagerToken { managerId, managerName, institutionId, role }`; `request.manager: { id, name, institutionId, role }`; `HospitalAdminGuard` (throws `ForbiddenException` unless `request.manager.role === "HOSPITAL_ADMIN"`).

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/modules/manager/application/services/manager-token.service.test.ts` in full:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { ManagerTokenService } from "./manager-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("ManagerTokenService", () => {
  it("issues a token (echoing role in the plaintext response) that verify() decodes back to the same manager id/name/institutionId/role", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token, expiresAt, role } = service.issue("manager-1", "Ana Konder", "institution-1", "HOSPITAL_ADMIN");

    expect(role).toBe("HOSPITAL_ADMIN");
    expect(service.verify(token)).toEqual({
      managerId: "manager-1",
      managerName: "Ana Konder",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
    });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("round-trips a SECTOR_MANAGER role correctly", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("manager-2", "Paulo Reis", "institution-1", "SECTOR_MANAGER");

    expect(service.verify(token)).toEqual({
      managerId: "manager-2",
      managerName: "Paulo Reis",
      institutionId: "institution-1",
      role: "SECTOR_MANAGER",
    });
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new ManagerTokenService(fakeConfig("secret-a"));
    const verifier = new ManagerTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue("manager-1", "Ana Konder", "institution-1", "HOSPITAL_ADMIN");

    expect(verifier.verify(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));

    expect(service.verify("not-a-valid-token")).toBeNull();
    expect(service.verify("")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("manager-1", "Ana Konder", "institution-1", "HOSPITAL_ADMIN");

    vi.advanceTimersByTime(9 * 60 * 60 * 1000);
    expect(service.verify(token)).toBeNull();

    vi.useRealTimers();
  });
});
```

Replace `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts` in full:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginManagerUseCase, InvalidManagerCredentialsError } from "./login-manager.use-case.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService } from "../services/manager-token.service.ts";
import type { ManagerRepository, ManagerRow } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  async findByName(name: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
  async findById(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginManagerUseCase", () => {
  it("issues a token carrying the manager's institutionId and role when the name and password match", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", passwordHash, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("Ana Konder", "correct-password");

    expect(result.role).toBe("HOSPITAL_ADMIN");
    expect(tokenService.verify(result.token)).toEqual({
      managerId: "manager-1",
      managerName: "Ana Konder",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
    });
  });

  it("throws InvalidManagerCredentialsError when the name is unknown", async () => {
    const passwordService = new ManagerPasswordService();
    const repository = new FakeManagerRepository();
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown Person", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError when the password is wrong", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", passwordHash, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Ana Konder", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError for a correct password on a deactivated manager, same as a wrong password (no disclosure of deactivation)", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", passwordHash, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: false },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Ana Konder", "correct-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("pays the same password-verification cost for an unknown name as for a known one", async () => {
    const passwordService = new ManagerPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", passwordHash, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown Person", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    verifySpy.mockClear();

    await expect(useCase.execute("Ana Konder", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/api test manager-token.service login-manager.use-case -- --run`
Expected: FAIL — `issue()` doesn't accept a fourth argument, `ManagerRow` has no `role`/`isActive`.

- [ ] **Step 3: Update the manager repository port**

Replace `apps/api/src/modules/manager/application/ports/manager-repository.port.ts` in full:

```ts
export type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

export interface ManagerRow {
  id: string;
  name: string;
  passwordHash: string;
  institutionId: string;
  role: ManagerRole;
  isActive: boolean;
}

export interface ManagerSummaryRow {
  id: string;
  name: string;
  role: ManagerRole;
  isActive: boolean;
  sectorNames: string[];
}

export interface CreateManagerParams {
  name: string;
  passwordHash: string;
  institutionId: string;
  role: ManagerRole;
}

export interface UpdateManagerParams {
  isActive?: boolean;
  role?: ManagerRole;
  passwordHash?: string;
}

export interface ManagerRepository {
  findByName(name: string): Promise<ManagerRow | null>;
  findById(id: string): Promise<ManagerRow | null>;
  findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]>;
  create(params: CreateManagerParams): Promise<{ id: string; name: string }>;
  update(id: string, patch: UpdateManagerParams): Promise<void>;
  countActiveHospitalAdmins(institutionId: string): Promise<number>;
}

export const MANAGER_REPOSITORY = Symbol("MANAGER_REPOSITORY");
```

(`findAllByInstitution`, `create`, `update`, `countActiveHospitalAdmins` are implemented in Task 8 — for this task, add them to `PrismaManagerRepository` as thin passthroughs so the class satisfies the interface; Task 8 is what actually exercises them.)

- [ ] **Step 4: Update the Prisma adapter**

Replace `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateManagerParams,
  ManagerRepository,
  ManagerRow,
  ManagerSummaryRow,
  UpdateManagerParams,
} from "../../application/ports/manager-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaManagerRepository implements ManagerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByName(name: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { name } });
    return row ? this.toRow(row) : null;
  }

  async findById(id: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]> {
    const rows = await this.prisma.manager.findMany({
      where: { institutionId },
      include: { sectors: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      isActive: row.isActive,
      sectorNames: row.sectors.map((sector) => sector.name),
    }));
  }

  async create(params: CreateManagerParams): Promise<{ id: string; name: string }> {
    const row = await this.prisma.manager.create({
      data: {
        name: params.name,
        passwordHash: params.passwordHash,
        institutionId: params.institutionId,
        role: params.role,
      },
    });
    return { id: row.id, name: row.name };
  }

  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    await this.prisma.manager.update({ where: { id }, data: patch });
  }

  async countActiveHospitalAdmins(institutionId: string): Promise<number> {
    return this.prisma.manager.count({ where: { institutionId, role: "HOSPITAL_ADMIN", isActive: true } });
  }

  private toRow(row: { id: string; name: string; passwordHash: string; institutionId: string; role: string; isActive: boolean }): ManagerRow {
    return {
      id: row.id,
      name: row.name,
      passwordHash: row.passwordHash,
      institutionId: row.institutionId,
      role: row.role as ManagerRow["role"],
      isActive: row.isActive,
    };
  }
}
```

- [ ] **Step 5: Update `ManagerTokenService`**

Replace `apps/api/src/modules/manager/application/services/manager-token.service.ts` in full:

```ts
import { createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeStringEqual } from "./timing-safe-equal.ts";
import type { ManagerRole } from "../ports/manager-repository.port.ts";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface IssuedManagerToken {
  token: string;
  expiresAt: string;
  role: ManagerRole;
}

export interface DecodedManagerToken {
  managerId: string;
  managerName: string;
  institutionId: string;
  role: ManagerRole;
}

interface TokenPayload {
  sessionId: string;
  managerId: string;
  managerName: string;
  institutionId: string;
  role: ManagerRole;
  expiresAtEpoch: number;
}

@Injectable()
export class ManagerTokenService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  issue(managerId: string, managerName: string, institutionId: string, role: ManagerRole): IssuedManagerToken {
    const sessionId = randomUUID();
    const expiresAtEpoch = Date.now() + SESSION_DURATION_MS;
    const payload: TokenPayload = { sessionId, managerId, managerName, institutionId, role, expiresAtEpoch };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(payloadB64);

    return { token: `${payloadB64}.${signature}`, expiresAt: new Date(expiresAtEpoch).toISOString(), role };
  }

  verify(token: string): DecodedManagerToken | null {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const expectedSignature = this.sign(payloadB64);
    if (!timingSafeStringEqual(signature, expectedSignature)) return null;

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    } catch {
      return null;
    }

    if (
      typeof payload.managerId !== "string" ||
      typeof payload.managerName !== "string" ||
      typeof payload.institutionId !== "string" ||
      (payload.role !== "HOSPITAL_ADMIN" && payload.role !== "SECTOR_MANAGER") ||
      !Number.isFinite(payload.expiresAtEpoch)
    ) {
      return null;
    }

    if (Date.now() >= payload.expiresAtEpoch) return null;

    return { managerId: payload.managerId, managerName: payload.managerName, institutionId: payload.institutionId, role: payload.role };
  }

  private sign(payloadB64: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("MANAGER_TOKEN_SECRET"))
      .update(payloadB64)
      .digest("base64url");
  }
}
```

- [ ] **Step 6: Update `LoginManagerUseCase`**

Replace `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService, type IssuedManagerToken } from "../services/manager-token.service.ts";

export class InvalidManagerCredentialsError extends Error {}

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
    @Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService,
  ) {}

  async execute(name: string, password: string): Promise<IssuedManagerToken> {
    const manager = await this.managerRepository.findByName(name);

    const isValid = await this.passwordService.verify(password, manager?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!manager || !isValid || !manager.isActive) {
      throw new InvalidManagerCredentialsError();
    }

    return this.tokenService.issue(manager.id, manager.name, manager.institutionId, manager.role);
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @zelo/api test manager-token.service login-manager.use-case -- --run`
Expected: PASS (all tests).

- [ ] **Step 8: Write the failing guard tests**

Replace `apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWithHeader(authorization: string | undefined): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { authorization } as Request["headers"] };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe("ManagerAuthGuard", () => {
  const tokenService = new ManagerTokenService(fakeConfig("test-secret"));
  const guard = new ManagerAuthGuard(tokenService);

  it("allows a request with a valid Bearer token and attaches the decoded manager, including role, to the request", () => {
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.manager).toEqual({ id: "manager-1", name: "Ana Konder", institutionId: "institution-1", role: "SECTOR_MANAGER" });
  });

  it("rejects a request with no Authorization header", () => {
    const { context } = contextWithHeader(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a request with a malformed or tampered token", () => {
    const { context } = contextWithHeader("Bearer not-a-real-token");
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
```

Create `apps/api/src/modules/manager/infrastructure/hospital-admin.guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import { HospitalAdminGuard } from "./hospital-admin.guard.ts";

function contextWithManager(manager: Request["manager"]): ExecutionContext {
  const request: Partial<Request> = { manager };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("HospitalAdminGuard", () => {
  const guard = new HospitalAdminGuard();

  it("allows a HOSPITAL_ADMIN manager through", () => {
    const context = contextWithManager({ id: "m-1", name: "Ana", institutionId: "i-1", role: "HOSPITAL_ADMIN" });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects a SECTOR_MANAGER with 403", () => {
    const context = contextWithManager({ id: "m-2", name: "Paulo", institutionId: "i-1", role: "SECTOR_MANAGER" });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 9: Run the guard tests to verify they fail**

Run: `pnpm --filter @zelo/api test manager-auth.guard hospital-admin.guard -- --run`
Expected: FAIL — `request.manager` has no `role` yet; `hospital-admin.guard.ts` doesn't exist.

- [ ] **Step 10: Update `ManagerAuthGuard` and create `HospitalAdminGuard`**

Replace `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts` in full:

```ts
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import type { ManagerRole } from "../application/ports/manager-repository.port.ts";

declare global {
  namespace Express {
    interface Request {
      manager?: { id: string; name: string; institutionId: string; role: ManagerRole };
    }
  }
}

@Injectable()
export class ManagerAuthGuard implements CanActivate {
  constructor(@Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    request.manager = { id: decoded.managerId, name: decoded.managerName, institutionId: decoded.institutionId, role: decoded.role };
    return true;
  }
}
```

Create `apps/api/src/modules/manager/infrastructure/hospital-admin.guard.ts`:

```ts
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

// Must run after ManagerAuthGuard in the same @UseGuards(...) list —
// it reads request.manager, which only ManagerAuthGuard populates.
@Injectable()
export class HospitalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.manager?.role !== "HOSPITAL_ADMIN") {
      throw new ForbiddenException();
    }
    return true;
  }
}
```

- [ ] **Step 11: Run the guard tests to verify they pass**

Run: `pnpm --filter @zelo/api test manager-auth.guard hospital-admin.guard -- --run`
Expected: PASS (all tests).

- [ ] **Step 12: Fix the now-broken `manager.controller.test.ts` and register `HospitalAdminGuard`**

`manager.controller.test.ts`'s `FakeManagerRepository` needs the four new interface methods (throwing `"not used in this test"` like Step 3's fake, since this controller's own tests don't exercise them) and its seeded rows need `role`/`isActive`. In `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`:

- Add to `FakeManagerRepository`: `findById`, `findAllByInstitution`, `create`, `update`, `countActiveHospitalAdmins` — each `async () => { throw new Error("not used in this test"); }`, matching Step 3's pattern.
- Add `role: "HOSPITAL_ADMIN"` and `isActive: true` to both seeded rows (`manager-1`/Ana Konder, `manager-2`/Beatriz Lima).
- Every call to `signalRepository.setRowsForInstitution` in this file's existing tests now needs rows shaped `{ sectorId, sectorName, weekStart, checkIns, concerning }` instead of `{ department, weekStart, checkIns, concerning }` (`FakeSignalRepository` from Task 2's shape) — update the "GET /manager/signals returns only the authenticated manager's own institution's data" test's fixture rows accordingly, keeping the same numeric assertions (`sectorName` in place of the old `department` string, e.g. `sectorId: "sector-a", sectorName: "A"`).
- In `apps/api/src/modules/manager/manager.module.ts`, add `HospitalAdminGuard` to the `providers` array (it's `@Injectable()` with no constructor dependencies, so no extra wiring needed).

- [ ] **Step 13: Run the full manager module test suite**

Run: `pnpm --filter @zelo/api test manager -- --run`
Expected: PASS (all tests).

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/modules/manager
git commit -m "feat(api): carry role/isActive through manager login, session token, and guard; add HospitalAdminGuard"
```

---

### Task 4: Super-admin auth stack (`admin` module) — `POST /admin/login`

**Files:**

- Create: `apps/api/src/modules/admin/application/services/admin-password.service.ts`
- Create: `apps/api/src/modules/admin/application/services/timing-safe-equal.ts`
- Create: `apps/api/src/modules/admin/application/services/admin-token.service.ts`
- Create: `apps/api/src/modules/admin/application/services/admin-token.service.test.ts`
- Create: `apps/api/src/modules/admin/application/ports/admin-repository.port.ts`
- Create: `apps/api/src/modules/admin/infrastructure/persistence/prisma-admin.repository.ts`
- Create: `apps/api/src/modules/admin/application/use-cases/login-admin.use-case.ts`
- Create: `apps/api/src/modules/admin/application/use-cases/login-admin.use-case.test.ts`
- Create: `apps/api/src/modules/admin/infrastructure/admin-auth.guard.ts`
- Create: `apps/api/src/modules/admin/infrastructure/admin-auth.guard.test.ts`
- Create: `apps/api/src/modules/admin/infrastructure/admin.controller.ts`
- Create: `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts`
- Create: `apps/api/src/modules/admin/admin.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**

- Consumes: `SuperAdmin` Prisma model (Task 1).
- Produces (used by Task 5): `AdminRepository { findByName(name): Promise<AdminRow | null> }`, `ADMIN_REPOSITORY` token; `AdminTokenService.issue(adminId, adminName): IssuedAdminToken`; `AdminAuthGuard` attaching `request.admin = { id, name }`; `AdminModule` (importable, exports nothing yet — Task 5 adds to it directly since it's a small, single-purpose module, not split further).

This task mirrors Task 3's manager auth stack exactly (same primitives, `SuperAdmin`/`admin` instead of `Manager`/`manager`, no `institutionId`/`role` to carry since a super-admin isn't scoped to one institution).

- [ ] **Step 1: Create the password service (no test — thin wrapper, identical shape to the already-tested `ManagerPasswordService`)**

Create `apps/api/src/modules/admin/application/services/admin-password.service.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

@Injectable()
export class AdminPasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    return `${salt}:${derived.toString("hex")}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [salt, hashHex] = stored.split(":");
    if (!salt || !hashHex) return false;

    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    const storedBuf = Buffer.from(hashHex, "hex");
    return derived.length === storedBuf.length && timingSafeEqual(derived, storedBuf);
  }
}
```

Create `apps/api/src/modules/admin/application/services/timing-safe-equal.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
```

- [ ] **Step 2: Write the failing test for `AdminTokenService`**

Create `apps/api/src/modules/admin/application/services/admin-token.service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { AdminTokenService } from "./admin-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("AdminTokenService", () => {
  it("issues a token that verify() decodes back to the same admin id/name", () => {
    const service = new AdminTokenService(fakeConfig("test-secret"));
    const { token, expiresAt } = service.issue("admin-1", "Zelo Ops");

    expect(service.verify(token)).toEqual({ adminId: "admin-1", adminName: "Zelo Ops" });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new AdminTokenService(fakeConfig("secret-a"));
    const verifier = new AdminTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue("admin-1", "Zelo Ops");

    expect(verifier.verify(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    const service = new AdminTokenService(fakeConfig("test-secret"));
    expect(service.verify("not-a-valid-token")).toBeNull();
    expect(service.verify("")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const service = new AdminTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("admin-1", "Zelo Ops");

    vi.advanceTimersByTime(9 * 60 * 60 * 1000);
    expect(service.verify(token)).toBeNull();

    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test admin-token.service -- --run`
Expected: FAIL — `admin-token.service.ts` doesn't exist yet.

- [ ] **Step 4: Create `AdminTokenService`**

Create `apps/api/src/modules/admin/application/services/admin-token.service.ts`:

```ts
import { createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeStringEqual } from "./timing-safe-equal.ts";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface IssuedAdminToken {
  token: string;
  expiresAt: string;
}

export interface DecodedAdminToken {
  adminId: string;
  adminName: string;
}

interface TokenPayload {
  sessionId: string;
  adminId: string;
  adminName: string;
  expiresAtEpoch: number;
}

@Injectable()
export class AdminTokenService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  issue(adminId: string, adminName: string): IssuedAdminToken {
    const sessionId = randomUUID();
    const expiresAtEpoch = Date.now() + SESSION_DURATION_MS;
    const payload: TokenPayload = { sessionId, adminId, adminName, expiresAtEpoch };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(payloadB64);

    return { token: `${payloadB64}.${signature}`, expiresAt: new Date(expiresAtEpoch).toISOString() };
  }

  verify(token: string): DecodedAdminToken | null {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const expectedSignature = this.sign(payloadB64);
    if (!timingSafeStringEqual(signature, expectedSignature)) return null;

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    } catch {
      return null;
    }

    if (typeof payload.adminId !== "string" || typeof payload.adminName !== "string" || !Number.isFinite(payload.expiresAtEpoch)) {
      return null;
    }

    if (Date.now() >= payload.expiresAtEpoch) return null;

    return { adminId: payload.adminId, adminName: payload.adminName };
  }

  private sign(payloadB64: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("ADMIN_TOKEN_SECRET"))
      .update(payloadB64)
      .digest("base64url");
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test admin-token.service -- --run`
Expected: PASS (all tests).

- [ ] **Step 6: Create the admin repository port and Prisma adapter (no standalone test — thin passthrough, per Global Constraints)**

Create `apps/api/src/modules/admin/application/ports/admin-repository.port.ts`:

```ts
export interface AdminRow {
  id: string;
  name: string;
  passwordHash: string;
}

export interface AdminRepository {
  findByName(name: string): Promise<AdminRow | null>;
}

export const ADMIN_REPOSITORY = Symbol("ADMIN_REPOSITORY");
```

Create `apps/api/src/modules/admin/infrastructure/persistence/prisma-admin.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { AdminRepository, AdminRow } from "../../application/ports/admin-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaAdminRepository implements AdminRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByName(name: string): Promise<AdminRow | null> {
    const row = await this.prisma.superAdmin.findUnique({ where: { name } });
    if (!row) return null;
    return { id: row.id, name: row.name, passwordHash: row.passwordHash };
  }
}
```

- [ ] **Step 7: Write the failing test for `LoginAdminUseCase`**

Create `apps/api/src/modules/admin/application/use-cases/login-admin.use-case.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginAdminUseCase, InvalidAdminCredentialsError } from "./login-admin.use-case.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
import { AdminTokenService } from "../services/admin-token.service.ts";
import type { AdminRepository, AdminRow } from "../ports/admin-repository.port.ts";

class FakeAdminRepository implements AdminRepository {
  constructor(private readonly rows: AdminRow[]) {}
  async findByName(name: string): Promise<AdminRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginAdminUseCase", () => {
  it("issues a token when the name and password match", async () => {
    const passwordService = new AdminPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("Zelo Ops", "correct-password");

    expect(tokenService.verify(result.token)).toEqual({ adminId: "admin-1", adminName: "Zelo Ops" });
  });

  it("throws InvalidAdminCredentialsError when the name is unknown", async () => {
    const passwordService = new AdminPasswordService();
    const repository = new FakeAdminRepository([]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown", "any-password")).rejects.toThrow(InvalidAdminCredentialsError);
  });

  it("throws InvalidAdminCredentialsError when the password is wrong", async () => {
    const passwordService = new AdminPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Zelo Ops", "wrong-password")).rejects.toThrow(InvalidAdminCredentialsError);
  });

  it("pays the same password-verification cost for an unknown name as for a known one", async () => {
    const passwordService = new AdminPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown", "any-password")).rejects.toThrow(InvalidAdminCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test login-admin -- --run`
Expected: FAIL — `login-admin.use-case.ts` doesn't exist yet.

- [ ] **Step 9: Create `LoginAdminUseCase`**

Create `apps/api/src/modules/admin/application/use-cases/login-admin.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { ADMIN_REPOSITORY, type AdminRepository } from "../ports/admin-repository.port.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
import { AdminTokenService, type IssuedAdminToken } from "../services/admin-token.service.ts";

export class InvalidAdminCredentialsError extends Error {}

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginAdminUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
    @Inject(AdminPasswordService) private readonly passwordService: AdminPasswordService,
    @Inject(AdminTokenService) private readonly tokenService: AdminTokenService,
  ) {}

  async execute(name: string, password: string): Promise<IssuedAdminToken> {
    const admin = await this.adminRepository.findByName(name);

    const isValid = await this.passwordService.verify(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!admin || !isValid) {
      throw new InvalidAdminCredentialsError();
    }

    return this.tokenService.issue(admin.id, admin.name);
  }
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test login-admin -- --run`
Expected: PASS (all tests).

- [ ] **Step 11: Write the failing guard test**

Create `apps/api/src/modules/admin/infrastructure/admin-auth.guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { AdminAuthGuard } from "./admin-auth.guard.ts";
import { AdminTokenService } from "../application/services/admin-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWithHeader(authorization: string | undefined): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { authorization } as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

describe("AdminAuthGuard", () => {
  const tokenService = new AdminTokenService(fakeConfig("test-secret"));
  const guard = new AdminAuthGuard(tokenService);

  it("allows a request with a valid Bearer token and attaches the decoded admin to the request", () => {
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.admin).toEqual({ id: "admin-1", name: "Zelo Ops" });
  });

  it("rejects a request with no Authorization header", () => {
    const { context } = contextWithHeader(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a request with a malformed or tampered token", () => {
    const { context } = contextWithHeader("Bearer not-a-real-token");
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 12: Run the test to verify it fails, then create `AdminAuthGuard`**

Run: `pnpm --filter @zelo/api test admin-auth.guard -- --run` — expected FAIL (`admin-auth.guard.ts` doesn't exist).

Create `apps/api/src/modules/admin/infrastructure/admin-auth.guard.ts`:

```ts
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AdminTokenService } from "../application/services/admin-token.service.ts";

declare global {
  namespace Express {
    interface Request {
      admin?: { id: string; name: string };
    }
  }
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(@Inject(AdminTokenService) private readonly tokenService: AdminTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    request.admin = { id: decoded.adminId, name: decoded.adminName };
    return true;
  }
}
```

Run: `pnpm --filter @zelo/api test admin-auth.guard -- --run` — expected PASS.

- [ ] **Step 13: Write the failing controller test**

Create `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts`:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { AdminController } from "./admin.controller.ts";
import { LoginAdminUseCase } from "../application/use-cases/login-admin.use-case.ts";
import { AdminTokenService } from "../application/services/admin-token.service.ts";
import { AdminPasswordService } from "../application/services/admin-password.service.ts";
import { ADMIN_REPOSITORY } from "../application/ports/admin-repository.port.ts";
import type { AdminRepository, AdminRow } from "../application/ports/admin-repository.port.ts";

class FakeAdminRepository implements AdminRepository {
  public rows: AdminRow[] = [];
  async findByName(name: string): Promise<AdminRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { ADMIN_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("admin controller", () => {
  let app: INestApplication;
  let adminRepository: FakeAdminRepository;

  beforeAll(async () => {
    const passwordService = new AdminPasswordService();
    adminRepository = new FakeAdminRepository();
    adminRepository.rows = [{ id: "admin-1", name: "Zelo Ops", passwordHash: await passwordService.hash("test-password") }];

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        LoginAdminUseCase,
        AdminTokenService,
        AdminPasswordService,
        { provide: ADMIN_REPOSITORY, useValue: adminRepository },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /admin/login returns a token for the correct name and password", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({ name: "Zelo Ops", password: "test-password" });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("POST /admin/login rejects an unknown name with 401", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({ name: "Unknown", password: "test-password" });
    expect(response.status).toBe(401);
  });

  it("POST /admin/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({});
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 14: Run the test to verify it fails, then create `AdminController` and `AdminModule`**

Run: `pnpm --filter @zelo/api test admin.controller -- --run` — expected FAIL (`admin.controller.ts` doesn't exist).

Create `apps/api/src/modules/admin/infrastructure/admin.controller.ts` (this task only needs the `login` handler — Task 5 adds `institutions` handlers to this same file):

```ts
import { BadRequestException, Body, Controller, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { LoginAdminUseCase, InvalidAdminCredentialsError } from "../application/use-cases/login-admin.use-case.ts";
import type { IssuedAdminToken } from "../application/services/admin-token.service.ts";

const LoginRequestSchema = z.object({ name: z.string().min(1).max(200), password: z.string().min(1).max(200) });

@Controller("admin")
export class AdminController {
  constructor(private readonly loginAdmin: LoginAdminUseCase) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedAdminToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginAdmin.execute(parsed.data.name, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidAdminCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
```

Note the constructor uses plain constructor-parameter injection (`private readonly loginAdmin: LoginAdminUseCase`) rather than `@Inject(...)` — both work for a class token (no interface indirection), and this matches how simple, single-dependency controllers are written elsewhere in this codebase when the token is a concrete class, not a `Symbol`.

Create `apps/api/src/modules/admin/admin.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AdminController } from "./infrastructure/admin.controller.ts";
import { AdminAuthGuard } from "./infrastructure/admin-auth.guard.ts";
import { PrismaAdminRepository } from "./infrastructure/persistence/prisma-admin.repository.ts";
import { LoginAdminUseCase } from "./application/use-cases/login-admin.use-case.ts";
import { AdminTokenService } from "./application/services/admin-token.service.ts";
import { AdminPasswordService } from "./application/services/admin-password.service.ts";
import { ADMIN_REPOSITORY } from "./application/ports/admin-repository.port.ts";

@Module({
  controllers: [AdminController],
  providers: [
    LoginAdminUseCase,
    AdminTokenService,
    AdminPasswordService,
    AdminAuthGuard,
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
  ],
})
export class AdminModule {}
```

Run: `pnpm --filter @zelo/api test admin.controller -- --run` — expected PASS.

- [ ] **Step 15: Register `AdminModule` and add `ADMIN_TOKEN_SECRET`**

In `apps/api/src/app.module.ts`, import and register `AdminModule` alongside the existing module imports (add `import { AdminModule } from "./modules/admin/admin.module.ts";` and `AdminModule` in the `imports` array).

In `apps/api/.env.example`, add a line after `MANAGER_TOKEN_SECRET=change-me-in-production`:

```env
ADMIN_TOKEN_SECRET=change-me-in-production
```

- [ ] **Step 16: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS, except the still-expected seed-related compile gap from Task 1 (unaffected by this task).

- [ ] **Step 17: Commit**

```bash
git add apps/api/src/modules/admin apps/api/src/app.module.ts apps/api/.env.example
git commit -m "feat(api): add super-admin auth stack (password/token/guard/login) as its own module"
```

---

### Task 5: `POST`/`GET /admin/institutions` — institution + first hospital-admin creation

**Files:**

- Create: `apps/api/src/shared/generate-temporary-password.ts`
- Create: `apps/api/src/shared/generate-temporary-password.test.ts`
- Create: `apps/api/src/modules/admin/application/ports/admin-institution-repository.port.ts`
- Create: `apps/api/src/modules/admin/infrastructure/persistence/prisma-admin-institution.repository.ts`
- Create: `apps/api/src/modules/admin/application/use-cases/create-institution.use-case.ts`
- Create: `apps/api/src/modules/admin/application/use-cases/create-institution.use-case.test.ts`
- Create: `apps/api/src/modules/admin/application/use-cases/list-institutions.use-case.ts`
- Modify: `apps/api/src/modules/admin/infrastructure/admin.controller.ts`
- Modify: `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`

**Interfaces:**

- Consumes: `Institution`/`Manager` Prisma models, `ManagerRepository`-shaped `create()` semantics (Task 1, Task 3 — this task uses its own dedicated repository rather than reaching into the manager module, since institution+first-manager creation is one atomic transaction across two tables that the admin module owns end-to-end).
- Produces: `generateTemporaryPassword(): string` (shared, also used by Task 8); `CreateInstitutionUseCase.execute(params): Promise<{ institution, hospitalAdmin, temporaryPassword }>`; `ListInstitutionsUseCase.execute(): Promise<AdminInstitutionRow[]>`; `POST /admin/institutions`, `GET /admin/institutions` (both `AdminAuthGuard`-gated).

- [ ] **Step 1: Write the failing test for the shared temp-password generator**

Create `apps/api/src/shared/generate-temporary-password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "./generate-temporary-password.ts";

describe("generateTemporaryPassword", () => {
  it("returns a string at least 12 characters long", () => {
    expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(12);
  });

  it("returns a different value on each call", () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test generate-temporary-password -- --run`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Create the generator**

Create `apps/api/src/shared/generate-temporary-password.ts`:

```ts
import { randomBytes } from "node:crypto";

// URL-safe base64 of 9 random bytes = 12 characters, no ambiguous punctuation
// (`+`, `/`, `=`) that could confuse someone copy-typing it from a screen.
export function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test generate-temporary-password -- --run`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `CreateInstitutionUseCase`**

Create `apps/api/src/modules/admin/application/use-cases/create-institution.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CreateInstitutionUseCase } from "./create-institution.use-case.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
import {
  DuplicateInstitutionOrManagerError,
  type AdminInstitutionRepository,
  type AdminInstitutionRow,
} from "../ports/admin-institution-repository.port.ts";

class FakeAdminInstitutionRepository implements AdminInstitutionRepository {
  public lastCreateParams: Parameters<AdminInstitutionRepository["createWithHospitalAdmin"]>[0] | null = null;
  public shouldThrowDuplicate = false;

  async createWithHospitalAdmin(
    params: Parameters<AdminInstitutionRepository["createWithHospitalAdmin"]>[0],
  ): ReturnType<AdminInstitutionRepository["createWithHospitalAdmin"]> {
    this.lastCreateParams = params;
    if (this.shouldThrowDuplicate) throw new DuplicateInstitutionOrManagerError();
    return {
      institution: { id: "institution-1", name: params.institutionName, inviteCode: params.inviteCode },
      hospitalAdmin: { id: "manager-1", name: params.hospitalAdminName },
    };
  }

  async findAll(): Promise<AdminInstitutionRow[]> {
    throw new Error("not used in this test");
  }
}

describe("CreateInstitutionUseCase", () => {
  it("hashes a generated temporary password and returns it in plaintext alongside the created rows", async () => {
    const repository = new FakeAdminInstitutionRepository();
    const passwordService = new AdminPasswordService();
    const useCase = new CreateInstitutionUseCase(repository, passwordService);

    const result = await useCase.execute({
      institutionName: "Hospital Teste",
      inviteCode: "teste-2026",
      hospitalAdminName: "Mauricio",
    });

    expect(result.institution).toEqual({ id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026" });
    expect(result.hospitalAdmin).toEqual({ id: "manager-1", name: "Mauricio" });
    expect(result.temporaryPassword).toEqual(expect.any(String));

    const passedHash = repository.lastCreateParams!.hospitalAdminPasswordHash;
    expect(await passwordService.verify(result.temporaryPassword, passedHash)).toBe(true);
  });

  it("propagates DuplicateInstitutionOrManagerError from the repository", async () => {
    const repository = new FakeAdminInstitutionRepository();
    repository.shouldThrowDuplicate = true;
    const useCase = new CreateInstitutionUseCase(repository, new AdminPasswordService());

    await expect(
      useCase.execute({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio" }),
    ).rejects.toThrow(DuplicateInstitutionOrManagerError);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test create-institution -- --run`
Expected: FAIL — `create-institution.use-case.ts` and `admin-institution-repository.port.ts` don't exist yet.

- [ ] **Step 7: Create the port, Prisma adapter, and use-case**

Create `apps/api/src/modules/admin/application/ports/admin-institution-repository.port.ts`:

```ts
export interface AdminInstitutionRow {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: Date;
  hospitalAdminNames: string[];
}

export interface CreateInstitutionParams {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminPasswordHash: string;
}

export interface AdminInstitutionRepository {
  createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string } }>;
  findAll(): Promise<AdminInstitutionRow[]>;
}

export const ADMIN_INSTITUTION_REPOSITORY = Symbol("ADMIN_INSTITUTION_REPOSITORY");

// Thrown on a unique-constraint violation on institution name/inviteCode or manager name.
export class DuplicateInstitutionOrManagerError extends Error {}
```

Create `apps/api/src/modules/admin/infrastructure/persistence/prisma-admin-institution.repository.ts` (no standalone test — thin Prisma passthrough, exercised via `admin.controller.test.ts` in Step 13):

```ts
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  AdminInstitutionRepository,
  AdminInstitutionRow,
  CreateInstitutionParams,
} from "../../application/ports/admin-institution-repository.port.ts";
import { DuplicateInstitutionOrManagerError } from "../../application/ports/admin-institution-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

@Injectable()
export class PrismaAdminInstitutionRepository implements AdminInstitutionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string } }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const institution = await tx.institution.create({
          data: { name: params.institutionName, inviteCode: params.inviteCode },
        });
        const hospitalAdmin = await tx.manager.create({
          data: {
            name: params.hospitalAdminName,
            passwordHash: params.hospitalAdminPasswordHash,
            institutionId: institution.id,
            role: "HOSPITAL_ADMIN",
          },
        });
        return {
          institution: { id: institution.id, name: institution.name, inviteCode: institution.inviteCode },
          hospitalAdmin: { id: hospitalAdmin.id, name: hospitalAdmin.name },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new DuplicateInstitutionOrManagerError();
      }
      throw error;
    }
  }

  async findAll(): Promise<AdminInstitutionRow[]> {
    const institutions = await this.prisma.institution.findMany({
      include: { managers: { where: { role: "HOSPITAL_ADMIN" }, select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      inviteCode: institution.inviteCode,
      createdAt: institution.createdAt,
      hospitalAdminNames: institution.managers.map((manager) => manager.name),
    }));
  }
}
```

Create `apps/api/src/modules/admin/application/use-cases/create-institution.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionRepository,
} from "../ports/admin-institution-repository.port.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";

export interface CreateInstitutionInput {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
}

export interface CreateInstitutionResult {
  institution: { id: string; name: string; inviteCode: string };
  hospitalAdmin: { id: string; name: string };
  temporaryPassword: string;
}

@Injectable()
export class CreateInstitutionUseCase {
  constructor(
    @Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly repository: AdminInstitutionRepository,
    @Inject(AdminPasswordService) private readonly passwordService: AdminPasswordService,
  ) {}

  async execute(input: CreateInstitutionInput): Promise<CreateInstitutionResult> {
    const temporaryPassword = generateTemporaryPassword();
    const hospitalAdminPasswordHash = await this.passwordService.hash(temporaryPassword);

    const { institution, hospitalAdmin } = await this.repository.createWithHospitalAdmin({
      institutionName: input.institutionName,
      inviteCode: input.inviteCode,
      hospitalAdminName: input.hospitalAdminName,
      hospitalAdminPasswordHash,
    });

    return { institution, hospitalAdmin, temporaryPassword };
  }
}
```

Create `apps/api/src/modules/admin/application/use-cases/list-institutions.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionRepository,
  type AdminInstitutionRow,
} from "../ports/admin-institution-repository.port.ts";

@Injectable()
export class ListInstitutionsUseCase {
  constructor(@Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly repository: AdminInstitutionRepository) {}

  async execute(): Promise<AdminInstitutionRow[]> {
    return this.repository.findAll();
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test create-institution -- --run`
Expected: PASS (all tests).

- [ ] **Step 9: Extend `admin.controller.test.ts` with the institutions endpoints**

Add to `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts` (new imports, a fake repository, and new `it` blocks — keep every existing test from Task 4 as-is):

```ts
import { CreateInstitutionUseCase } from "../application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "../application/use-cases/list-institutions.use-case.ts";
import { AdminAuthGuard } from "./admin-auth.guard.ts";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  DuplicateInstitutionOrManagerError,
} from "../application/ports/admin-institution-repository.port.ts";
import type { AdminInstitutionRepository, AdminInstitutionRow } from "../application/ports/admin-institution-repository.port.ts";
```

```ts
class FakeAdminInstitutionRepository implements AdminInstitutionRepository {
  public rows: AdminInstitutionRow[] = [];
  public shouldThrowDuplicate = false;
  async createWithHospitalAdmin(params: {
    institutionName: string;
    inviteCode: string;
    hospitalAdminName: string;
    hospitalAdminPasswordHash: string;
  }) {
    if (this.shouldThrowDuplicate) throw new DuplicateInstitutionOrManagerError();
    return {
      institution: { id: "institution-1", name: params.institutionName, inviteCode: params.inviteCode },
      hospitalAdmin: { id: "manager-1", name: params.hospitalAdminName },
    };
  }
  async findAll(): Promise<AdminInstitutionRow[]> {
    return this.rows;
  }
}
```

Add `CreateInstitutionUseCase`, `ListInstitutionsUseCase`, `AdminAuthGuard`, and `{ provide: ADMIN_INSTITUTION_REPOSITORY, useValue: institutionRepository }` (a new `institutionRepository = new FakeAdminInstitutionRepository()` declared alongside `adminRepository` in `beforeAll`) to the `Test.createTestingModule({...})` call's `providers` array.

Add these `it` blocks (need a valid admin token first — reuse the existing `getToken`-style helper pattern from `manager.controller.test.ts`, adapted: `const login = await request(app.getHttpServer()).post("/admin/login").send({ name: "Zelo Ops", password: "test-password" }); const token = login.body.token;`):

```ts
it("POST /admin/institutions rejects a request with no token", async () => {
  const response = await request(app.getHttpServer()).post("/admin/institutions").send({});
  expect(response.status).toBe(401);
});

it("POST /admin/institutions creates the institution and its first hospital admin, returning a temporary password", async () => {
  const login = await request(app.getHttpServer()).post("/admin/login").send({ name: "Zelo Ops", password: "test-password" });
  const token = login.body.token;

  const response = await request(app.getHttpServer())
    .post("/admin/institutions")
    .set("Authorization", `Bearer ${token}`)
    .send({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio" });

  expect(response.status).toBe(201);
  expect(response.body.institution).toEqual({ id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026" });
  expect(response.body.hospitalAdmin).toEqual({ id: "manager-1", name: "Mauricio" });
  expect(response.body.temporaryPassword).toEqual(expect.any(String));
});

it("POST /admin/institutions returns 409 on a duplicate institution or manager name", async () => {
  institutionRepository.shouldThrowDuplicate = true;
  const login = await request(app.getHttpServer()).post("/admin/login").send({ name: "Zelo Ops", password: "test-password" });
  const token = login.body.token;

  const response = await request(app.getHttpServer())
    .post("/admin/institutions")
    .set("Authorization", `Bearer ${token}`)
    .send({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio" });

  expect(response.status).toBe(409);
  institutionRepository.shouldThrowDuplicate = false;
});

it("GET /admin/institutions rejects a request with no token", async () => {
  const response = await request(app.getHttpServer()).get("/admin/institutions");
  expect(response.status).toBe(401);
});

it("GET /admin/institutions returns the repository's rows", async () => {
  institutionRepository.rows = [
    { id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026", createdAt: new Date("2026-08-01T00:00:00.000Z"), hospitalAdminNames: ["Mauricio"] },
  ];
  const login = await request(app.getHttpServer()).post("/admin/login").send({ name: "Zelo Ops", password: "test-password" });
  const token = login.body.token;

  const response = await request(app.getHttpServer()).get("/admin/institutions").set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual([
    expect.objectContaining({ id: "institution-1", name: "Hospital Teste", hospitalAdminNames: ["Mauricio"] }),
  ]);
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test admin.controller -- --run`
Expected: FAIL — `AdminController` has no `institutions` handlers yet.

- [ ] **Step 11: Extend `AdminController` and `AdminModule`**

Replace `apps/api/src/modules/admin/infrastructure/admin.controller.ts` in full:

```ts
import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { LoginAdminUseCase, InvalidAdminCredentialsError } from "../application/use-cases/login-admin.use-case.ts";
import { CreateInstitutionUseCase, type CreateInstitutionResult } from "../application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "../application/use-cases/list-institutions.use-case.ts";
import type { AdminInstitutionRow } from "../application/ports/admin-institution-repository.port.ts";
import { DuplicateInstitutionOrManagerError } from "../application/ports/admin-institution-repository.port.ts";
import type { IssuedAdminToken } from "../application/services/admin-token.service.ts";
import { AdminAuthGuard } from "./admin-auth.guard.ts";

const LoginRequestSchema = z.object({ name: z.string().min(1).max(200), password: z.string().min(1).max(200) });
const CreateInstitutionSchema = z.object({
  institutionName: z.string().min(1).max(200),
  inviteCode: z.string().min(1).max(100),
  hospitalAdminName: z.string().min(1).max(200),
});

@Controller("admin")
export class AdminController {
  constructor(
    private readonly loginAdmin: LoginAdminUseCase,
    private readonly createInstitution: CreateInstitutionUseCase,
    private readonly listInstitutions: ListInstitutionsUseCase,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedAdminToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginAdmin.execute(parsed.data.name, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidAdminCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("institutions")
  @HttpCode(201)
  @UseGuards(AdminAuthGuard)
  async createInstitutionHandler(@Body() body: unknown): Promise<CreateInstitutionResult> {
    const parsed = CreateInstitutionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.createInstitution.execute(parsed.data);
    } catch (error) {
      if (error instanceof DuplicateInstitutionOrManagerError) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  @Get("institutions")
  @UseGuards(AdminAuthGuard)
  async listInstitutionsHandler(): Promise<AdminInstitutionRow[]> {
    return this.listInstitutions.execute();
  }
}
```

Replace `apps/api/src/modules/admin/admin.module.ts` in full:

```ts
import { Module } from "@nestjs/common";
import { AdminController } from "./infrastructure/admin.controller.ts";
import { AdminAuthGuard } from "./infrastructure/admin-auth.guard.ts";
import { PrismaAdminRepository } from "./infrastructure/persistence/prisma-admin.repository.ts";
import { PrismaAdminInstitutionRepository } from "./infrastructure/persistence/prisma-admin-institution.repository.ts";
import { LoginAdminUseCase } from "./application/use-cases/login-admin.use-case.ts";
import { CreateInstitutionUseCase } from "./application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "./application/use-cases/list-institutions.use-case.ts";
import { AdminTokenService } from "./application/services/admin-token.service.ts";
import { AdminPasswordService } from "./application/services/admin-password.service.ts";
import { ADMIN_REPOSITORY } from "./application/ports/admin-repository.port.ts";
import { ADMIN_INSTITUTION_REPOSITORY } from "./application/ports/admin-institution-repository.port.ts";

@Module({
  controllers: [AdminController],
  providers: [
    LoginAdminUseCase,
    CreateInstitutionUseCase,
    ListInstitutionsUseCase,
    AdminTokenService,
    AdminPasswordService,
    AdminAuthGuard,
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
    { provide: ADMIN_INSTITUTION_REPOSITORY, useClass: PrismaAdminInstitutionRepository },
  ],
})
export class AdminModule {}
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test admin.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/shared/generate-temporary-password.ts apps/api/src/shared/generate-temporary-password.test.ts apps/api/src/modules/admin
git commit -m "feat(api): add POST/GET /admin/institutions for super-admin institution + first hospital-admin creation"
```

---

### Task 6: Frontend — super-admin login page + admin institutions page

**Files:**

- Create: `apps/web/src/ports/admin-auth.port.ts`
- Create: `apps/web/src/ports/admin-institution.port.ts`
- Create: `apps/web/src/infrastructure/http/http-admin-auth.adapter.ts`
- Create: `apps/web/src/infrastructure/http/http-admin-institution.adapter.ts`
- Create: `apps/web/src/use-cases/login-admin.usecase.ts`
- Create: `apps/web/src/use-cases/login-admin.usecase.test.ts`
- Create: `apps/web/src/use-cases/create-institution.usecase.ts`
- Create: `apps/web/src/use-cases/list-institutions.usecase.ts`
- Create: `apps/web/src/stores/admin-session.store.ts`
- Create: `apps/web/src/stores/admin-session.store.test.ts`
- Create: `apps/web/src/presentation/hooks/useAdminLogin.ts`
- Create: `apps/web/src/presentation/hooks/useCreateInstitution.ts`
- Create: `apps/web/src/presentation/hooks/useAdminInstitutions.ts`
- Create: `apps/web/src/presentation/pages/AdminLoginPage.tsx`
- Create: `apps/web/src/presentation/pages/AdminLoginPage.test.tsx`
- Create: `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`
- Create: `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx`
- Modify: `apps/web/src/presentation/lib/routes.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Consumes: `POST /admin/login`, `POST /admin/institutions`, `GET /admin/institutions` (Task 4, Task 5).
- Produces: `routes.adminLogin` (`/admin/login`), `routes.admin` (`/admin`); `useAdminSessionStore` (mirrors `useManagerSessionStore`).

- [ ] **Step 1: Ports**

Create `apps/web/src/ports/admin-auth.port.ts`:

```ts
import { z } from "zod";

export const AdminLoginResultSchema = z.object({ token: z.string(), expiresAt: z.string() });
export type AdminLoginResult = z.infer<typeof AdminLoginResultSchema>;

export class InvalidAdminCredentialsError extends Error {}

export interface AdminAuthPort {
  login(name: string, password: string): Promise<AdminLoginResult>;
}
```

Create `apps/web/src/ports/admin-institution.port.ts`:

```ts
import { z } from "zod";

export const CreateInstitutionResultSchema = z.object({
  institution: z.object({ id: z.string(), name: z.string(), inviteCode: z.string() }),
  hospitalAdmin: z.object({ id: z.string(), name: z.string() }),
  temporaryPassword: z.string(),
});
export type CreateInstitutionResult = z.infer<typeof CreateInstitutionResultSchema>;

export const AdminInstitutionListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  inviteCode: z.string(),
  createdAt: z.string(),
  hospitalAdminNames: z.array(z.string()),
});
export type AdminInstitutionListItem = z.infer<typeof AdminInstitutionListItemSchema>;

export class DuplicateInstitutionError extends Error {}
export class UnauthorizedAdminError extends Error {}

export interface CreateInstitutionParams {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
}

export interface AdminInstitutionPort {
  create(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult>;
  list(token: string): Promise<AdminInstitutionListItem[]>;
}
```

- [ ] **Step 2: HTTP adapters**

Create `apps/web/src/infrastructure/http/http-admin-auth.adapter.ts`:

```ts
import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";
import { AdminLoginResultSchema, InvalidAdminCredentialsError } from "@/ports/admin-auth.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpAdminAuthAdapter implements AdminAuthPort {
  async login(name: string, password: string): Promise<AdminLoginResult> {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });

    if (response.status === 401) {
      throw new InvalidAdminCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`admin login failed with status ${response.status}`);
    }

    return AdminLoginResultSchema.parse(await response.json());
  }
}
```

Create `apps/web/src/infrastructure/http/http-admin-institution.adapter.ts`:

```ts
import type { AdminInstitutionPort, AdminInstitutionListItem, CreateInstitutionParams, CreateInstitutionResult } from "@/ports/admin-institution.port";
import {
  AdminInstitutionListItemSchema,
  CreateInstitutionResultSchema,
  DuplicateInstitutionError,
  UnauthorizedAdminError,
} from "@/ports/admin-institution.port";
import { z } from "zod";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpAdminInstitutionAdapter implements AdminInstitutionPort {
  async create(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (response.status === 409) throw new DuplicateInstitutionError();
    if (!response.ok) throw new Error(`create institution failed with status ${response.status}`);

    return CreateInstitutionResultSchema.parse(await response.json());
  }

  async list(token: string): Promise<AdminInstitutionListItem[]> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (!response.ok) throw new Error(`list institutions failed with status ${response.status}`);

    return z.array(AdminInstitutionListItemSchema).parse(await response.json());
  }
}
```

- [ ] **Step 3: Write the failing test for `LoginAdminUseCase` (frontend)**

Create `apps/web/src/use-cases/login-admin.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LoginAdminUseCase } from "./login-admin.usecase";
import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";

class FakeAdminAuthAdapter implements AdminAuthPort {
  constructor(private readonly result: AdminLoginResult) {}
  async login(): Promise<AdminLoginResult> {
    return this.result;
  }
}

describe("LoginAdminUseCase", () => {
  it("delegates to the port and returns its result", async () => {
    const port = new FakeAdminAuthAdapter({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z" });
    const useCase = new LoginAdminUseCase(port);

    const result = await useCase.execute("Zelo Ops", "password");

    expect(result).toEqual({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z" });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails, then create the frontend use-cases**

Run: `pnpm --filter web test login-admin.usecase -- --run` — expected FAIL (file doesn't exist).

Create `apps/web/src/use-cases/login-admin.usecase.ts`:

```ts
import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";

export class LoginAdminUseCase {
  constructor(private readonly adminAuthPort: AdminAuthPort) {}

  async execute(name: string, password: string): Promise<AdminLoginResult> {
    return this.adminAuthPort.login(name, password);
  }
}
```

Create `apps/web/src/use-cases/create-institution.usecase.ts`:

```ts
import type { AdminInstitutionPort, CreateInstitutionParams, CreateInstitutionResult } from "@/ports/admin-institution.port";

export class CreateInstitutionUseCase {
  constructor(private readonly adminInstitutionPort: AdminInstitutionPort) {}

  async execute(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult> {
    return this.adminInstitutionPort.create(token, params);
  }
}
```

Create `apps/web/src/use-cases/list-institutions.usecase.ts`:

```ts
import type { AdminInstitutionListItem, AdminInstitutionPort } from "@/ports/admin-institution.port";

export class ListInstitutionsUseCase {
  constructor(private readonly adminInstitutionPort: AdminInstitutionPort) {}

  async execute(token: string): Promise<AdminInstitutionListItem[]> {
    return this.adminInstitutionPort.list(token);
  }
}
```

Run: `pnpm --filter web test login-admin.usecase -- --run` — expected PASS.

- [ ] **Step 5: Write the failing test for the admin session store**

Create `apps/web/src/stores/admin-session.store.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useAdminSessionStore } from "./admin-session.store";

describe("useAdminSessionStore", () => {
  beforeEach(() => {
    useAdminSessionStore.getState().clearSession();
  });

  it("isValid() is false with no session", () => {
    expect(useAdminSessionStore.getState().isValid()).toBe(false);
  });

  it("isValid() is true after setSession with a future expiry", () => {
    useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
    expect(useAdminSessionStore.getState().isValid()).toBe(true);
  });

  it("isValid() is false after clearSession", () => {
    useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
    useAdminSessionStore.getState().clearSession();
    expect(useAdminSessionStore.getState().isValid()).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails, then create the store**

Run: `pnpm --filter web test admin-session.store -- --run` — expected FAIL (file doesn't exist).

Create `apps/web/src/stores/admin-session.store.ts` (mirrors `manager-session.store.ts` exactly, same `sessionStorage`/`TD-001` rationale, separate storage key so an admin and a manager session on the same browser tab never collide):

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AdminSessionState {
  token: string | null;
  expiresAt: string | null;
  setSession: (token: string, expiresAt: string) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const useAdminSessionStore = create<AdminSessionState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      setSession: (token, expiresAt) => set({ token, expiresAt }),
      clearSession: () => set({ token: null, expiresAt: null }),
      isValid: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return new Date(expiresAt).getTime() > Date.now();
      },
    }),
    { name: "zelo.admin-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
```

Run: `pnpm --filter web test admin-session.store -- --run` — expected PASS.

- [ ] **Step 7: Wire the container and hooks**

In `apps/web/src/app/container.ts`, add (alongside the existing manager/institution exports):

```ts
import { LoginAdminUseCase } from "@/use-cases/login-admin.usecase";
import { HttpAdminAuthAdapter } from "@/infrastructure/http/http-admin-auth.adapter";
import { CreateInstitutionUseCase } from "@/use-cases/create-institution.usecase";
import { ListInstitutionsUseCase } from "@/use-cases/list-institutions.usecase";
import { HttpAdminInstitutionAdapter } from "@/infrastructure/http/http-admin-institution.adapter";

export const loginAdminUseCase = new LoginAdminUseCase(new HttpAdminAuthAdapter());
export const createInstitutionUseCase = new CreateInstitutionUseCase(new HttpAdminInstitutionAdapter());
export const listInstitutionsUseCase = new ListInstitutionsUseCase(new HttpAdminInstitutionAdapter());
```

Create `apps/web/src/presentation/hooks/useAdminLogin.ts` (mirrors `useManagerLogin.ts`):

```ts
import { useMutation } from "@tanstack/react-query";
import { loginAdminUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

interface LoginVariables {
  name: string;
  password: string;
}

export function useAdminLogin() {
  const setSession = useAdminSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ name, password }: LoginVariables) => loginAdminUseCase.execute(name, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
```

Create `apps/web/src/presentation/hooks/useCreateInstitution.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createInstitutionUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import type { CreateInstitutionParams } from "@/ports/admin-institution.port";

export function useCreateInstitution() {
  const token = useAdminSessionStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateInstitutionParams) => createInstitutionUseCase.execute(token!, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-institutions"] });
    },
  });
}
```

Create `apps/web/src/presentation/hooks/useAdminInstitutions.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listInstitutionsUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

export function useAdminInstitutions() {
  const token = useAdminSessionStore((state) => state.token);

  return useQuery({
    queryKey: ["admin-institutions", token],
    queryFn: () => listInstitutionsUseCase.execute(token!),
    enabled: token !== null,
    retry: false,
  });
}
```

- [ ] **Step 8: Add routes**

In `apps/web/src/presentation/lib/routes.ts`, add two entries to the exported `routes` object:

```ts
  adminLogin: "/admin/login",
  admin: "/admin",
```

- [ ] **Step 9: Write the failing test for `AdminLoginPage`**

Create `apps/web/src/presentation/pages/AdminLoginPage.test.tsx` (mirrors `ManagerLoginPage.test.tsx`'s exact pattern: a local `renderPage()` helper with `QueryClientProvider` + `MemoryRouter`, and mocking via `vi.spyOn(container.<useCase>, "execute")` on the `* as container` import — this codebase has no shared render-helper module, don't invent one):

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminLoginPage } from "./AdminLoginPage";
import * as container from "@/app/container";
import { InvalidAdminCredentialsError } from "@/ports/admin-auth.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/login"]}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<div>Admin institutions</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminLoginPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to /admin on a correct name and password", async () => {
    vi.spyOn(container.loginAdminUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome"), "Zelo Ops");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Admin institutions")).toBeInTheDocument();
  });

  it("shows an inline error on invalid credentials, without navigating", async () => {
    vi.spyOn(container.loginAdminUseCase, "execute").mockRejectedValue(new InvalidAdminCredentialsError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome"), "Zelo Ops");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nome ou senha incorretos."));
    expect(screen.queryByText("Admin institutions")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run the test to verify it fails, then create `AdminLoginPage`**

Run: `pnpm --filter web test AdminLoginPage -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/pages/AdminLoginPage.tsx` (mirrors `ManagerLoginPage.tsx` exactly, `/admin` instead of `/manager`, no "Início" back link since this area has no médico-facing entry point to return to — back goes nowhere meaningful, so this page has no `BackButton` at all, matching how `screens/02-privacy.md`'s standalone screens without a natural "back" omit it too):

```tsx
import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useAdminLogin } from "@/presentation/hooks/useAdminLogin";
import { InvalidAdminCredentialsError } from "@/ports/admin-auth.port";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const login = useAdminLogin();

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    login.mutate({ name, password }, { onSuccess: () => navigate(routes.admin) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidAdminCredentialsError
      ? "Nome ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso administrativo</h1>
        <p className="text-caption text-muted">Entre com seu nome e senha de administrador da plataforma.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="admin-name" className="text-label font-semibold text-ink-2">
              Nome
            </label>
            <input
              id="admin-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Digite seu nome"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            <label htmlFor="admin-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            {errorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-6">
            <Button
              type="submit"
              variant="primary"
              loading={login.isPending}
              disabled={name.trim().length === 0 || password.trim().length === 0}
            >
              Entrar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
```

Run: `pnpm --filter web test AdminLoginPage -- --run` — expected PASS.

- [ ] **Step 11: Write the failing test for `AdminInstitutionsPage`**

Create `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx` (same local-`renderPage()` + `* as container` spy convention as Step 9, seeding `useAdminSessionStore` directly since this page assumes an already-authenticated admin — matching how `ManagerDashboardPage.test.tsx` seeds `useManagerSessionStore` directly rather than going through a login flow first):

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminInstitutionsPage } from "./AdminInstitutionsPage";
import * as container from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminInstitutionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminInstitutionsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
  });

  it("lists existing institutions", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Mauricio"] },
    ]);
    renderPage();

    expect(await screen.findByText("Hospital Teste")).toBeInTheDocument();
  });

  it("creates an institution and shows the one-time temporary password", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "1", name: "Hospital Teste", inviteCode: "teste-2026" },
      hospitalAdmin: { id: "m1", name: "Mauricio" },
      temporaryPassword: "abc123xyz789",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome do hospital"), "Hospital Teste");
    await user.type(screen.getByLabelText("Código de convite"), "teste-2026");
    await user.type(screen.getByLabelText("Nome do gestor do hospital"), "Mauricio");
    await user.click(screen.getByRole("button", { name: "Criar instituição" }));

    await waitFor(() => expect(screen.getByText("abc123xyz789")).toBeInTheDocument());
  });
});
```

- [ ] **Step 12: Run the test to verify it fails, then create `AdminInstitutionsPage`**

Run: `pnpm --filter web test AdminInstitutionsPage -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`:

```tsx
import { useState, type SubmitEvent } from "react";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { useAdminInstitutions } from "@/presentation/hooks/useAdminInstitutions";
import { useCreateInstitution } from "@/presentation/hooks/useCreateInstitution";
import type { CreateInstitutionResult } from "@/ports/admin-institution.port";

export function AdminInstitutionsPage() {
  const institutions = useAdminInstitutions();
  const createInstitution = useCreateInstitution();
  const [institutionName, setInstitutionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hospitalAdminName, setHospitalAdminName] = useState("");
  const [lastCreated, setLastCreated] = useState<CreateInstitutionResult | null>(null);

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    createInstitution.mutate(
      { institutionName, inviteCode, hospitalAdminName },
      {
        onSuccess: (result) => {
          setLastCreated(result);
          setInstitutionName("");
          setInviteCode("");
          setHospitalAdminName("");
        },
      },
    );
  };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Instituições</h1>
        <p className="text-caption text-muted">Cadastre um novo hospital e seu primeiro gestor.</p>

        {lastCreated && (
          <Card tone="brand-tint" className="mt-4" role="status">
            <p className="text-label font-semibold text-ink-2">
              Senha temporária de {lastCreated.hospitalAdmin.name}: <span className="font-mono">{lastCreated.temporaryPassword}</span>
            </p>
            <p className="mt-1 text-caption text-muted">
              Copie e repasse esta senha agora — ela não será exibida novamente.
            </p>
          </Card>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="mt-4">
            <label htmlFor="institution-name" className="text-label font-semibold text-ink-2">
              Nome do hospital
            </label>
            <input
              id="institution-name"
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            <label htmlFor="invite-code-input" className="mt-4 block text-label font-semibold text-ink-2">
              Código de convite
            </label>
            <input
              id="invite-code-input"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            <label htmlFor="hospital-admin-name" className="mt-4 block text-label font-semibold text-ink-2">
              Nome do gestor do hospital
            </label>
            <input
              id="hospital-admin-name"
              value={hospitalAdminName}
              onChange={(event) => setHospitalAdminName(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            {createInstitution.isError && (
              <p role="alert" className="mt-2 text-label text-danger">
                Não foi possível criar a instituição agora. Tente novamente.
              </p>
            )}
          </Card>

          <div className="mt-4">
            <Button
              type="submit"
              variant="primary"
              loading={createInstitution.isPending}
              disabled={institutionName.trim().length === 0 || inviteCode.trim().length === 0 || hospitalAdminName.trim().length === 0}
            >
              Criar instituição
            </Button>
          </div>
        </form>

        <div className="mt-6">
          <p className="text-body font-extrabold text-ink">Instituições cadastradas</p>
          <div className="mt-3 flex flex-col gap-3">
            {(institutions.data ?? []).map((institution) => (
              <Card key={institution.id}>
                <p className="text-body font-extrabold text-ink">{institution.name}</p>
                <p className="text-caption text-muted">Código: {institution.inviteCode}</p>
                <p className="text-caption text-muted">Gestores: {institution.hospitalAdminNames.join(", ") || "—"}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
```

Run: `pnpm --filter web test AdminInstitutionsPage -- --run` — expected PASS.

- [ ] **Step 13: Wire routes into the router**

In `apps/web/src/app/router.tsx`, add imports for `AdminLoginPage`, `AdminInstitutionsPage`, and `useAdminSessionStore`, and two entries to `routeChildren`:

```tsx
  { path: "admin/login", Component: AdminLoginPage },
  {
    path: "admin",
    Component: AdminInstitutionsPage,
    loader: () => (useAdminSessionStore.getState().isValid() ? null : redirect(routes.adminLogin)),
  },
```

- [ ] **Step 14: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add apps/web/src/ports/admin-auth.port.ts apps/web/src/ports/admin-institution.port.ts \
        apps/web/src/infrastructure/http/http-admin-auth.adapter.ts apps/web/src/infrastructure/http/http-admin-institution.adapter.ts \
        apps/web/src/use-cases/login-admin.usecase.ts apps/web/src/use-cases/login-admin.usecase.test.ts \
        apps/web/src/use-cases/create-institution.usecase.ts apps/web/src/use-cases/list-institutions.usecase.ts \
        apps/web/src/stores/admin-session.store.ts apps/web/src/stores/admin-session.store.test.ts \
        apps/web/src/presentation/hooks/useAdminLogin.ts apps/web/src/presentation/hooks/useCreateInstitution.ts apps/web/src/presentation/hooks/useAdminInstitutions.ts \
        apps/web/src/presentation/pages/AdminLoginPage.tsx apps/web/src/presentation/pages/AdminLoginPage.test.tsx \
        apps/web/src/presentation/pages/AdminInstitutionsPage.tsx apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx \
        apps/web/src/presentation/lib/routes.ts apps/web/src/app/router.tsx apps/web/src/app/container.ts
git commit -m "feat(web): add super-admin login and institution-creation pages"
```

---

### Task 7: Sector module (backend) + hospital-admin sectors endpoints

**Files:**

- Create: `apps/api/src/modules/sector/application/ports/sector-repository.port.ts`
- Create: `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`
- Create: `apps/api/src/modules/sector/sector.module.ts`
- Create: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
- Create: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: `Sector`, `Manager` Prisma models (Task 1); `ManagerAuthGuard`, `HospitalAdminGuard` (Task 3).
- Produces (used by Task 8, Task 10, Task 11): full `SectorRepository` port — `create`, `findAllForAdmin`, `findById`, `update`, `findActiveByInstitution`, `findActiveByIds`, `findAssignedSectorIds`, `reassignManagerSectors`, `findByIdsInInstitution` — implemented in full now even though only `create`/`findAllForAdmin`/`findById`/`update` are wired to an endpoint in this task (the other methods back endpoints added in Task 8/10/11; implementing the whole interface once avoids a port that changes shape three more times). `SECTOR_REPOSITORY` token; `GET/POST/PATCH /manager/admin/sectors[/:id]` (`ManagerAuthGuard` + `HospitalAdminGuard`).

- [ ] **Step 1: Create the port**

Create `apps/api/src/modules/sector/application/ports/sector-repository.port.ts`:

```ts
export interface AdminSectorRow {
  id: string;
  name: string;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
}

export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
}

export interface SectorRepository {
  create(institutionId: string, name: string): Promise<{ id: string; name: string }>;
  findAllForAdmin(institutionId: string): Promise<AdminSectorRow[]>;
  findById(id: string): Promise<{ id: string; institutionId: string } | null>;
  update(id: string, patch: UpdateSectorParams): Promise<void>;
  findActiveByInstitution(institutionId: string): Promise<{ id: string; name: string }[]>;
  findActiveByIds(institutionId: string, sectorIds: string[]): Promise<{ id: string; name: string }[]>;
  findAssignedSectorIds(managerId: string): Promise<string[]>;
  reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]): Promise<void>;
  findByIdsInInstitution(institutionId: string, sectorIds: string[]): Promise<{ id: string }[]>;
}

export const SECTOR_REPOSITORY = Symbol("SECTOR_REPOSITORY");

// Thrown on a unique-constraint violation on (institutionId, name).
export class SectorNameConflictError extends Error {}
```

- [ ] **Step 2: Create the Prisma adapter (no standalone test — thin passthrough, exercised via `manager-admin.controller.test.ts`)**

Create `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  AdminSectorRow,
  SectorRepository,
  UpdateSectorParams,
} from "../../application/ports/sector-repository.port.ts";
import { SectorNameConflictError } from "../../application/ports/sector-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

@Injectable()
export class PrismaSectorRepository implements SectorRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(institutionId: string, name: string): Promise<{ id: string; name: string }> {
    try {
      const row = await this.prisma.sector.create({ data: { institutionId, name } });
      return { id: row.id, name: row.name };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new SectorNameConflictError();
      }
      throw error;
    }
  }

  async findAllForAdmin(institutionId: string): Promise<AdminSectorRow[]> {
    const rows = await this.prisma.sector.findMany({
      where: { institutionId },
      include: { manager: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      managerId: row.managerId,
      managerName: row.manager?.name ?? null,
    }));
  }

  async findById(id: string): Promise<{ id: string; institutionId: string } | null> {
    const row = await this.prisma.sector.findUnique({ where: { id } });
    return row ? { id: row.id, institutionId: row.institutionId } : null;
  }

  async update(id: string, patch: UpdateSectorParams): Promise<void> {
    await this.prisma.sector.update({ where: { id }, data: patch });
  }

  async findActiveByInstitution(institutionId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.sector.findMany({
      where: { institutionId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async findActiveByIds(institutionId: string, sectorIds: string[]): Promise<{ id: string; name: string }[]> {
    if (sectorIds.length === 0) return [];
    return this.prisma.sector.findMany({
      where: { institutionId, isActive: true, id: { in: sectorIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async findAssignedSectorIds(managerId: string): Promise<string[]> {
    const rows = await this.prisma.sector.findMany({ where: { managerId }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.sector.updateMany({
        where: { institutionId, managerId, id: { notIn: sectorIds } },
        data: { managerId: null },
      }),
      this.prisma.sector.updateMany({
        where: { institutionId, id: { in: sectorIds } },
        data: { managerId },
      }),
    ]);
  }

  async findByIdsInInstitution(institutionId: string, sectorIds: string[]): Promise<{ id: string }[]> {
    if (sectorIds.length === 0) return [];
    return this.prisma.sector.findMany({ where: { institutionId, id: { in: sectorIds } }, select: { id: true } });
  }
}
```

- [ ] **Step 3: Create `SectorModule`**

Create `apps/api/src/modules/sector/sector.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaSectorRepository } from "./infrastructure/persistence/prisma-sector.repository.ts";
import { SECTOR_REPOSITORY } from "./application/ports/sector-repository.port.ts";

@Module({
  providers: [{ provide: SECTOR_REPOSITORY, useClass: PrismaSectorRepository }],
  exports: [SECTOR_REPOSITORY],
})
export class SectorModule {}
```

- [ ] **Step 4: Write the failing test for the sectors admin endpoints**

Create `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`:

```ts
import { describe, expect, it, afterAll, beforeAll, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { ManagerAdminController } from "./manager-admin.controller.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { HospitalAdminGuard } from "./hospital-admin.guard.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { SECTOR_REPOSITORY } from "../../sector/application/ports/sector-repository.port.ts";
import type { AdminSectorRow, SectorRepository, UpdateSectorParams } from "../../sector/application/ports/sector-repository.port.ts";
import { SectorNameConflictError } from "../../sector/application/ports/sector-repository.port.ts";

class FakeSectorRepository implements SectorRepository {
  public rows: (AdminSectorRow & { institutionId: string })[] = [];
  public shouldThrowConflict = false;

  async create(institutionId: string, name: string) {
    if (this.shouldThrowConflict) throw new SectorNameConflictError();
    const row = { id: `sector-${this.rows.length + 1}`, name, isActive: true, managerId: null, managerName: null, institutionId };
    this.rows.push(row);
    return { id: row.id, name: row.name };
  }
  async findAllForAdmin(institutionId: string): Promise<AdminSectorRow[]> {
    return this.rows.filter((row) => row.institutionId === institutionId);
  }
  async findById(id: string) {
    const row = this.rows.find((r) => r.id === id);
    return row ? { id: row.id, institutionId: row.institutionId } : null;
  }
  async update(id: string, patch: UpdateSectorParams): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (patch.isActive !== undefined) row.isActive = patch.isActive;
    if (patch.managerId !== undefined) row.managerId = patch.managerId;
  }
  async findActiveByInstitution() {
    throw new Error("not used in this test");
  }
  async findActiveByIds() {
    throw new Error("not used in this test");
  }
  async findAssignedSectorIds() {
    throw new Error("not used in this test");
  }
  async reassignManagerSectors() {
    throw new Error("not used in this test");
  }
  async findByIdsInInstitution() {
    throw new Error("not used in this test");
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { MANAGER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("manager admin controller — sectors", () => {
  let app: INestApplication;
  let sectorRepository: FakeSectorRepository;
  let tokenService: ManagerTokenService;

  beforeAll(async () => {
    tokenService = new ManagerTokenService(fakeConfig());
    sectorRepository = new FakeSectorRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [ManagerAdminController],
      providers: [
        ManagerAuthGuard,
        HospitalAdminGuard,
        { provide: ManagerTokenService, useValue: tokenService },
        { provide: SECTOR_REPOSITORY, useValue: sectorRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sectorRepository.rows = [];
    sectorRepository.shouldThrowConflict = false;
  });

  function hospitalAdminToken(): string {
    return tokenService.issue("manager-1", "Mauricio", "institution-1", "HOSPITAL_ADMIN").token;
  }
  function sectorManagerToken(): string {
    return tokenService.issue("manager-2", "Paulo", "institution-1", "SECTOR_MANAGER").token;
  }

  it("GET /manager/admin/sectors rejects a SECTOR_MANAGER with 403", async () => {
    const response = await request(app.getHttpServer())
      .get("/manager/admin/sectors")
      .set("Authorization", `Bearer ${sectorManagerToken()}`);
    expect(response.status).toBe(403);
  });

  it("POST then GET /manager/admin/sectors round-trips a created sector for a HOSPITAL_ADMIN", async () => {
    const token = hospitalAdminToken();
    const createResponse = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "UTI" });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toEqual({ id: expect.any(String), name: "UTI" });

    const listResponse = await request(app.getHttpServer())
      .get("/manager/admin/sectors")
      .set("Authorization", `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      { id: createResponse.body.id, name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
  });

  it("POST /manager/admin/sectors returns 409 on a duplicate name", async () => {
    sectorRepository.shouldThrowConflict = true;
    const response = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ name: "UTI" });
    expect(response.status).toBe(409);
  });

  it("PATCH /manager/admin/sectors/:id deactivates a sector", async () => {
    const token = hospitalAdminToken();
    const created = await request(app.getHttpServer()).post("/manager/admin/sectors").set("Authorization", `Bearer ${token}`).send({ name: "UTI" });

    const patchResponse = await request(app.getHttpServer())
      .patch(`/manager/admin/sectors/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });
    expect(patchResponse.status).toBe(204);

    const listResponse = await request(app.getHttpServer()).get("/manager/admin/sectors").set("Authorization", `Bearer ${token}`);
    expect(listResponse.body[0].isActive).toBe(false);
  });

  it("PATCH /manager/admin/sectors/:id returns 404 for a sector in a different institution", async () => {
    sectorRepository.rows.push({ id: "other-sector", name: "Other", isActive: true, managerId: null, managerName: null, institutionId: "institution-2" });

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/sectors/other-sector")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ isActive: false });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: FAIL — `manager-admin.controller.ts` doesn't exist yet.

- [ ] **Step 6: Create `ManagerAdminController`**

Create `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts` (this task only implements the sectors handlers — Task 8 adds the managers handlers to this same file, base path `manager/admin`):

```ts
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { HospitalAdminGuard } from "./hospital-admin.guard.ts";
import { SECTOR_REPOSITORY, type SectorRepository, type AdminSectorRow } from "../../sector/application/ports/sector-repository.port.ts";
import { SectorNameConflictError } from "../../sector/application/ports/sector-repository.port.ts";

const CreateSectorSchema = z.object({ name: z.string().trim().min(1).max(200) });
const UpdateSectorSchema = z.object({ isActive: z.boolean().optional(), managerId: z.string().nullable().optional() });

@Controller("manager/admin")
@UseGuards(ManagerAuthGuard, HospitalAdminGuard)
export class ManagerAdminController {
  constructor(@Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository) {}

  @Get("sectors")
  async listSectors(@Req() request: Request): Promise<AdminSectorRow[]> {
    return this.sectorRepository.findAllForAdmin(request.manager!.institutionId);
  }

  @Post("sectors")
  @HttpCode(201)
  async createSector(@Req() request: Request, @Body() body: unknown): Promise<{ id: string; name: string }> {
    const parsed = CreateSectorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.sectorRepository.create(request.manager!.institutionId, parsed.data.name);
    } catch (error) {
      if (error instanceof SectorNameConflictError) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  @Patch("sectors/:id")
  @HttpCode(204)
  async updateSector(@Req() request: Request, @Param("id") id: string, @Body() body: unknown): Promise<void> {
    const parsed = UpdateSectorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const sector = await this.sectorRepository.findById(id);
    if (!sector || sector.institutionId !== request.manager!.institutionId) {
      throw new NotFoundException();
    }

    await this.sectorRepository.update(id, parsed.data);
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 8: Register `SectorModule` and `ManagerAdminController`**

In `apps/api/src/modules/manager/manager.module.ts`, add `import { SectorModule } from "../sector/sector.module.ts";` and `import { ManagerAdminController } from "./infrastructure/manager-admin.controller.ts";`; add `imports: [SectorModule]` to the `@Module({...})` decorator; add `ManagerAdminController` to the `controllers` array (alongside the existing `ManagerController`).

Do **not** add `SectorModule` to `app.module.ts` — it's imported directly by whichever feature module needs it (`ManagerModule` now, `InstitutionModule` in Task 11 too), following Nest's standard "import where used" pattern; it doesn't need its own top-level registration since it declares no controllers.

- [ ] **Step 9: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS, except the still-expected seed-related gap from Task 1.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/sector apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts \
        apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts apps/api/src/modules/manager/manager.module.ts
git commit -m "feat(api): add Sector module and hospital-admin sectors CRUD endpoints"
```

---

### Task 8: Manager admin endpoints (managers tab) + last-active-hospital-admin guard

**Files:**

- Create: `apps/api/src/modules/manager/application/use-cases/manager-admin-errors.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/update-manager.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/update-manager.use-case.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/reset-manager-password.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/reset-manager-password.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`

**Interfaces:**

- Consumes: `ManagerRepository` (Task 3), `SectorRepository` (Task 7).
- Produces (used by Task 9 frontend): `GET/POST/PATCH /manager/admin/managers[/:id]`, `POST /manager/admin/managers/:id/reset-password`.

- [ ] **Step 1: Create the shared error classes**

Create `apps/api/src/modules/manager/application/use-cases/manager-admin-errors.ts`:

```ts
export class ManagerNotFoundError extends Error {}
export class SectorNotInInstitutionError extends Error {}
export class LastActiveHospitalAdminError extends Error {}
```

- [ ] **Step 2: Write the failing test for `CreateManagerUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CreateManagerUseCase } from "./create-manager.use-case.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import type { CreateManagerParams, ManagerRepository, ManagerRow, ManagerSummaryRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public lastCreateParams: CreateManagerParams | null = null;
  async findByName(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<ManagerSummaryRow[]> {
    throw new Error("not used in this test");
  }
  async create(params: CreateManagerParams): Promise<{ id: string; name: string }> {
    this.lastCreateParams = params;
    return { id: "manager-new", name: params.name };
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

class FakeSectorRepository {
  public lastReassign: { institutionId: string; managerId: string; sectorIds: string[] } | null = null;
  public knownSectorIds = new Set<string>();
  async findByIdsInInstitution(institutionId: string, sectorIds: string[]) {
    return sectorIds.filter((id) => this.knownSectorIds.has(id)).map((id) => ({ id }));
  }
  async reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]) {
    this.lastReassign = { institutionId, managerId, sectorIds };
  }
}

describe("CreateManagerUseCase", () => {
  it("creates a HOSPITAL_ADMIN manager without touching sector assignment", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new ManagerPasswordService());

    const result = await useCase.execute({ institutionId: "institution-1", name: "Mauricio", role: "HOSPITAL_ADMIN" });

    expect(result.manager).toEqual({ id: "manager-new", name: "Mauricio" });
    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(managerRepository.lastCreateParams).toEqual({
      name: "Mauricio",
      passwordHash: expect.any(String),
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
    });
    expect(sectorRepository.lastReassign).toBeNull();
  });

  it("creates a SECTOR_MANAGER and assigns the given sectors, all belonging to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a", "sector-b"]);
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new ManagerPasswordService());

    await useCase.execute({ institutionId: "institution-1", name: "Paulo", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-b"] });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-new", sectorIds: ["sector-a", "sector-b"] });
  });

  it("throws SectorNotInInstitutionError when a sectorId doesn't belong to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a"]);
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new ManagerPasswordService());

    await expect(
      useCase.execute({ institutionId: "institution-1", name: "Paulo", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-unknown"] }),
    ).rejects.toThrow(SectorNotInInstitutionError);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test create-manager -- --run`
Expected: FAIL — `create-manager.use-case.ts` doesn't exist yet.

- [ ] **Step 4: Create `CreateManagerUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerRole } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";

export interface CreateManagerInput {
  institutionId: string;
  name: string;
  role: ManagerRole;
  sectorIds?: string[];
}

export interface CreateManagerResult {
  manager: { id: string; name: string };
  temporaryPassword: string;
}

@Injectable()
export class CreateManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
  ) {}

  async execute(input: CreateManagerInput): Promise<CreateManagerResult> {
    const sectorIds = input.sectorIds ?? [];

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      const owned = await this.sectorRepository.findByIdsInInstitution(input.institutionId, sectorIds);
      if (owned.length !== sectorIds.length) {
        throw new SectorNotInInstitutionError();
      }
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);

    const manager = await this.managerRepository.create({
      name: input.name,
      passwordHash,
      institutionId: input.institutionId,
      role: input.role,
    });

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      await this.sectorRepository.reassignManagerSectors(input.institutionId, manager.id, sectorIds);
    }

    return { manager, temporaryPassword };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test create-manager -- --run`
Expected: PASS (all tests).

- [ ] **Step 6: Write the failing test for `UpdateManagerUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/update-manager.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { UpdateManagerUseCase } from "./update-manager.use-case.ts";
import { LastActiveHospitalAdminError, ManagerNotFoundError, SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  public activeHospitalAdmins = 1;
  public lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByName(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    this.lastUpdate = { id, patch };
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  }
  async countActiveHospitalAdmins(): Promise<number> {
    return this.activeHospitalAdmins;
  }
}

class FakeSectorRepository {
  public lastReassign: { institutionId: string; managerId: string; sectorIds: string[] } | null = null;
  public knownSectorIds = new Set<string>();
  async findByIdsInInstitution(institutionId: string, sectorIds: string[]) {
    return sectorIds.filter((id) => this.knownSectorIds.has(id)).map((id) => ({ id }));
  }
  async reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]) {
    this.lastReassign = { institutionId, managerId, sectorIds };
  }
}

function managerRow(overrides: Partial<ManagerRow> = {}): ManagerRow {
  return { id: "manager-1", name: "Ana", passwordHash: "hash", institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true, ...overrides };
}

describe("UpdateManagerUseCase", () => {
  it("throws ManagerNotFoundError when the manager doesn't belong to the given institution", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [managerRow({ institutionId: "institution-other" })];
    const useCase = new UpdateManagerUseCase(managerRepository, new FakeSectorRepository() as never);

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { isActive: false } })).rejects.toThrow(ManagerNotFoundError);
  });

  it("throws LastActiveHospitalAdminError when deactivating the institution's only active HOSPITAL_ADMIN", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [managerRow({ role: "HOSPITAL_ADMIN" })];
    managerRepository.activeHospitalAdmins = 1;
    const useCase = new UpdateManagerUseCase(managerRepository, new FakeSectorRepository() as never);

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { isActive: false } })).rejects.toThrow(LastActiveHospitalAdminError);
  });

  it("allows deactivating a HOSPITAL_ADMIN when another active HOSPITAL_ADMIN exists, clearing their sectors", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [managerRow({ role: "HOSPITAL_ADMIN" })];
    managerRepository.activeHospitalAdmins = 2;
    const sectorRepository = new FakeSectorRepository();
    const useCase = new UpdateManagerUseCase(managerRepository, sectorRepository as never);

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { isActive: false } });

    expect(managerRepository.lastUpdate).toEqual({ id: "manager-1", patch: { isActive: false } });
    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-1", sectorIds: [] });
  });

  it("allows deactivating a SECTOR_MANAGER unconditionally, clearing their sectors", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [managerRow({ role: "SECTOR_MANAGER" })];
    managerRepository.activeHospitalAdmins = 0; // irrelevant for a non-HOSPITAL_ADMIN
    const sectorRepository = new FakeSectorRepository();
    const useCase = new UpdateManagerUseCase(managerRepository, sectorRepository as never);

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { isActive: false } });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-1", sectorIds: [] });
  });

  it("reassigns sectors when sectorIds is provided without deactivating", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [managerRow()];
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a"]);
    const useCase = new UpdateManagerUseCase(managerRepository, sectorRepository as never);

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { sectorIds: ["sector-a"] } });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-1", sectorIds: ["sector-a"] });
  });

  it("throws SectorNotInInstitutionError when a provided sectorId doesn't belong to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [managerRow()];
    const sectorRepository = new FakeSectorRepository();
    const useCase = new UpdateManagerUseCase(managerRepository, sectorRepository as never);

    await expect(
      useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { sectorIds: ["sector-unknown"] } }),
    ).rejects.toThrow(SectorNotInInstitutionError);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test update-manager -- --run`
Expected: FAIL — `update-manager.use-case.ts` doesn't exist yet.

- [ ] **Step 8: Create `UpdateManagerUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/update-manager.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerRole } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import { LastActiveHospitalAdminError, ManagerNotFoundError, SectorNotInInstitutionError } from "./manager-admin-errors.ts";

export interface UpdateManagerInput {
  institutionId: string;
  managerId: string;
  patch: { isActive?: boolean; role?: ManagerRole; sectorIds?: string[] };
}

@Injectable()
export class UpdateManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  async execute(input: UpdateManagerInput): Promise<void> {
    const manager = await this.managerRepository.findById(input.managerId);
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    const deactivating = input.patch.isActive === false;
    if (deactivating && manager.role === "HOSPITAL_ADMIN" && manager.isActive) {
      const activeHospitalAdmins = await this.managerRepository.countActiveHospitalAdmins(input.institutionId);
      if (activeHospitalAdmins <= 1) {
        throw new LastActiveHospitalAdminError();
      }
    }

    await this.managerRepository.update(input.managerId, {
      isActive: input.patch.isActive,
      role: input.patch.role,
    });

    if (deactivating) {
      // Sectors lose their manager on deactivation regardless of any sectorIds
      // passed alongside it — clearing wins, matching the spec's "sector
      // becomes unassigned" behavior.
      await this.sectorRepository.reassignManagerSectors(input.institutionId, input.managerId, []);
      return;
    }

    if (input.patch.sectorIds) {
      const owned = await this.sectorRepository.findByIdsInInstitution(input.institutionId, input.patch.sectorIds);
      if (owned.length !== input.patch.sectorIds.length) {
        throw new SectorNotInInstitutionError();
      }
      await this.sectorRepository.reassignManagerSectors(input.institutionId, input.managerId, input.patch.sectorIds);
    }
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test update-manager -- --run`
Expected: PASS (all tests).

- [ ] **Step 10: Write the failing test for `ResetManagerPasswordUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/reset-manager-password.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ResetManagerPasswordUseCase } from "./reset-manager-password.use-case.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  public lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByName(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    this.lastUpdate = { id, patch };
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

describe("ResetManagerPasswordUseCase", () => {
  it("throws ManagerNotFoundError when the manager doesn't belong to the given institution", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [{ id: "manager-1", name: "Ana", passwordHash: "hash", institutionId: "institution-other", role: "SECTOR_MANAGER", isActive: true }];
    const useCase = new ResetManagerPasswordUseCase(managerRepository, new ManagerPasswordService());

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1" })).rejects.toThrow(ManagerNotFoundError);
  });

  it("generates and hashes a new temporary password", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [{ id: "manager-1", name: "Ana", passwordHash: "old-hash", institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true }];
    const passwordService = new ManagerPasswordService();
    const useCase = new ResetManagerPasswordUseCase(managerRepository, passwordService);

    const result = await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(result.temporaryPassword).toEqual(expect.any(String));
    const newHash = managerRepository.lastUpdate!.patch.passwordHash!;
    expect(await passwordService.verify(result.temporaryPassword, newHash)).toBe(true);
  });
});
```

- [ ] **Step 11: Run the test to verify it fails, then create `ResetManagerPasswordUseCase`**

Run: `pnpm --filter @zelo/api test reset-manager-password -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/manager/application/use-cases/reset-manager-password.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";

export interface ResetManagerPasswordInput {
  institutionId: string;
  managerId: string;
}

@Injectable()
export class ResetManagerPasswordUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
  ) {}

  async execute(input: ResetManagerPasswordInput): Promise<{ temporaryPassword: string }> {
    const manager = await this.managerRepository.findById(input.managerId);
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.managerRepository.update(input.managerId, { passwordHash });

    return { temporaryPassword };
  }
}
```

Run: `pnpm --filter @zelo/api test reset-manager-password -- --run` — expected PASS.

- [ ] **Step 12: Extend `manager-admin.controller.test.ts` with managers-tab tests**

Add to `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts` (new imports, a fake manager repository alongside the existing `FakeSectorRepository`, wired into the same `Test.createTestingModule` call, and new `it` blocks — keep every existing sectors test from Step 4 as-is):

```ts
import { CreateManagerUseCase } from "../application/use-cases/create-manager.use-case.ts";
import { UpdateManagerUseCase } from "../application/use-cases/update-manager.use-case.ts";
import { ResetManagerPasswordUseCase } from "../application/use-cases/reset-manager-password.use-case.ts";
import { ManagerPasswordService } from "../application/services/manager-password.service.ts";
import { MANAGER_REPOSITORY } from "../application/ports/manager-repository.port.ts";
import type { CreateManagerParams, ManagerRepository, ManagerRow, ManagerSummaryRow, UpdateManagerParams } from "../application/ports/manager-repository.port.ts";
```

```ts
class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  public activeHospitalAdmins = 1;
  async findByName(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]> {
    return this.rows
      .filter((r) => r.institutionId === institutionId)
      .map((r) => ({ id: r.id, name: r.name, role: r.role, isActive: r.isActive, sectorNames: [] }));
  }
  async create(params: CreateManagerParams): Promise<{ id: string; name: string }> {
    const row: ManagerRow = { id: `manager-${this.rows.length + 10}`, name: params.name, passwordHash: params.passwordHash, institutionId: params.institutionId, role: params.role, isActive: true };
    this.rows.push(row);
    return { id: row.id, name: row.name };
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  }
  async countActiveHospitalAdmins(institutionId: string): Promise<number> {
    return this.activeHospitalAdmins;
  }
}
```

Add `managerRepository = new FakeManagerRepository()` in `beforeAll` (and reset `managerRepository.rows = []` / `activeHospitalAdmins = 1` in `beforeEach` alongside the existing sector reset), add `CreateManagerUseCase`, `UpdateManagerUseCase`, `ResetManagerPasswordUseCase`, `ManagerPasswordService`, and `{ provide: MANAGER_REPOSITORY, useValue: managerRepository }` to the `Test.createTestingModule({...})` providers array.

Add these `it` blocks:

```ts
it("GET /manager/admin/managers returns every manager in the institution", async () => {
  managerRepository.rows = [{ id: "manager-1", name: "Mauricio", passwordHash: "h", institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];

  const response = await request(app.getHttpServer()).get("/manager/admin/managers").set("Authorization", `Bearer ${hospitalAdminToken()}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual([{ id: "manager-1", name: "Mauricio", role: "HOSPITAL_ADMIN", isActive: true, sectorNames: [] }]);
});

it("POST /manager/admin/managers creates a SECTOR_MANAGER and returns a temporary password", async () => {
  sectorRepository.rows = [{ id: "sector-a", name: "UTI", isActive: true, managerId: null, managerName: null, institutionId: "institution-1" }];

  const response = await request(app.getHttpServer())
    .post("/manager/admin/managers")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ name: "Paulo", role: "SECTOR_MANAGER", sectorIds: ["sector-a"] });

  expect(response.status).toBe(201);
  expect(response.body.manager).toEqual({ id: expect.any(String), name: "Paulo" });
  expect(response.body.temporaryPassword).toEqual(expect.any(String));
});

it("POST /manager/admin/managers rejects a SECTOR_MANAGER request with no sectorIds", async () => {
  const response = await request(app.getHttpServer())
    .post("/manager/admin/managers")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ name: "Paulo", role: "SECTOR_MANAGER" });

  expect(response.status).toBe(400);
});

it("PATCH /manager/admin/managers/:id returns 409 when deactivating the institution's last active HOSPITAL_ADMIN", async () => {
  managerRepository.rows = [{ id: "manager-1", name: "Mauricio", passwordHash: "h", institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];
  managerRepository.activeHospitalAdmins = 1;

  const response = await request(app.getHttpServer())
    .patch("/manager/admin/managers/manager-1")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ isActive: false });

  expect(response.status).toBe(409);
});

it("POST /manager/admin/managers/:id/reset-password returns a new temporary password", async () => {
  managerRepository.rows = [{ id: "manager-1", name: "Paulo", passwordHash: "old", institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true }];

  const response = await request(app.getHttpServer())
    .post("/manager/admin/managers/manager-1/reset-password")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`);

  expect(response.status).toBe(200);
  expect(response.body.temporaryPassword).toEqual(expect.any(String));
});
```

- [ ] **Step 13: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: FAIL — `ManagerAdminController` has no managers handlers yet.

- [ ] **Step 14: Extend `ManagerAdminController`**

Replace `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts` in full:

```ts
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { HospitalAdminGuard } from "./hospital-admin.guard.ts";
import { SECTOR_REPOSITORY, type SectorRepository, type AdminSectorRow } from "../../sector/application/ports/sector-repository.port.ts";
import { SectorNameConflictError } from "../../sector/application/ports/sector-repository.port.ts";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerSummaryRow } from "../application/ports/manager-repository.port.ts";
import { CreateManagerUseCase, type CreateManagerResult } from "../application/use-cases/create-manager.use-case.ts";
import { UpdateManagerUseCase } from "../application/use-cases/update-manager.use-case.ts";
import { ResetManagerPasswordUseCase } from "../application/use-cases/reset-manager-password.use-case.ts";
import { LastActiveHospitalAdminError, ManagerNotFoundError, SectorNotInInstitutionError } from "../application/use-cases/manager-admin-errors.ts";

const CreateSectorSchema = z.object({ name: z.string().trim().min(1).max(200) });
const UpdateSectorSchema = z.object({ isActive: z.boolean().optional(), managerId: z.string().nullable().optional() });

const CreateManagerSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
    sectorIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.role !== "SECTOR_MANAGER" || (data.sectorIds && data.sectorIds.length > 0), {
    message: "sectorIds is required and non-empty when role is SECTOR_MANAGER",
    path: ["sectorIds"],
  });

const UpdateManagerSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]).optional(),
  sectorIds: z.array(z.string()).optional(),
});

@Controller("manager/admin")
@UseGuards(ManagerAuthGuard, HospitalAdminGuard)
export class ManagerAdminController {
  constructor(
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    private readonly createManager: CreateManagerUseCase,
    private readonly updateManager: UpdateManagerUseCase,
    private readonly resetManagerPassword: ResetManagerPasswordUseCase,
  ) {}

  @Get("sectors")
  async listSectors(@Req() request: Request): Promise<AdminSectorRow[]> {
    return this.sectorRepository.findAllForAdmin(request.manager!.institutionId);
  }

  @Post("sectors")
  @HttpCode(201)
  async createSector(@Req() request: Request, @Body() body: unknown): Promise<{ id: string; name: string }> {
    const parsed = CreateSectorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.sectorRepository.create(request.manager!.institutionId, parsed.data.name);
    } catch (error) {
      if (error instanceof SectorNameConflictError) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  @Patch("sectors/:id")
  @HttpCode(204)
  async updateSector(@Req() request: Request, @Param("id") id: string, @Body() body: unknown): Promise<void> {
    const parsed = UpdateSectorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const sector = await this.sectorRepository.findById(id);
    if (!sector || sector.institutionId !== request.manager!.institutionId) {
      throw new NotFoundException();
    }

    await this.sectorRepository.update(id, parsed.data);
  }

  @Get("managers")
  async listManagers(@Req() request: Request): Promise<ManagerSummaryRow[]> {
    return this.managerRepository.findAllByInstitution(request.manager!.institutionId);
  }

  @Post("managers")
  @HttpCode(201)
  async createManagerHandler(@Req() request: Request, @Body() body: unknown): Promise<CreateManagerResult> {
    const parsed = CreateManagerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.createManager.execute({ institutionId: request.manager!.institutionId, ...parsed.data });
    } catch (error) {
      if (error instanceof SectorNotInInstitutionError) {
        throw new BadRequestException("One or more sectorIds do not belong to this institution");
      }
      throw error;
    }
  }

  @Patch("managers/:id")
  @HttpCode(204)
  async updateManagerHandler(@Req() request: Request, @Param("id") id: string, @Body() body: unknown): Promise<void> {
    const parsed = UpdateManagerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.updateManager.execute({ institutionId: request.manager!.institutionId, managerId: id, patch: parsed.data });
    } catch (error) {
      if (error instanceof ManagerNotFoundError) {
        throw new NotFoundException();
      }
      if (error instanceof LastActiveHospitalAdminError) {
        throw new ConflictException();
      }
      if (error instanceof SectorNotInInstitutionError) {
        throw new BadRequestException("One or more sectorIds do not belong to this institution");
      }
      throw error;
    }
  }

  @Post("managers/:id/reset-password")
  @HttpCode(200)
  async resetManagerPasswordHandler(@Req() request: Request, @Param("id") id: string): Promise<{ temporaryPassword: string }> {
    try {
      return await this.resetManagerPassword.execute({ institutionId: request.manager!.institutionId, managerId: id });
    } catch (error) {
      if (error instanceof ManagerNotFoundError) {
        throw new NotFoundException();
      }
      throw error;
    }
  }
}
```

- [ ] **Step 15: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 16: Register the new use-cases in `ManagerModule`**

In `apps/api/src/modules/manager/manager.module.ts`, add `CreateManagerUseCase`, `UpdateManagerUseCase`, `ResetManagerPasswordUseCase` to the `providers` array (each is a plain `@Injectable()` class token, no `useClass`/`useValue` wrapper needed, same as the existing `LoginManagerUseCase` entry).

- [ ] **Step 17: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS, except the still-expected seed-related gap from Task 1.

- [ ] **Step 18: Commit**

```bash
git add apps/api/src/modules/manager
git commit -m "feat(api): add hospital-admin managers CRUD, password reset, and last-active-admin guard"
```

---

### Task 9: Frontend — hospital-admin panel (Sectors + Managers tabs) + nav gating

**Files:**

- Modify: `apps/web/src/ports/manager-auth.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-auth.adapter.ts` (no code change expected — `ManagerLoginResultSchema.parse` already passes `role` through once the schema gains the field; listed for completeness)
- Modify: `apps/web/src/stores/manager-session.store.ts`
- Modify: `apps/web/src/stores/manager-session.store.test.ts`
- Modify: `apps/web/src/presentation/hooks/useManagerLogin.ts`
- Create: `apps/web/src/ports/manager-admin.port.ts`
- Create: `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts`
- Create: `apps/web/src/use-cases/list-sectors.usecase.ts`
- Create: `apps/web/src/use-cases/create-sector.usecase.ts`
- Create: `apps/web/src/use-cases/update-sector.usecase.ts`
- Create: `apps/web/src/use-cases/list-managers.usecase.ts`
- Create: `apps/web/src/use-cases/create-manager.usecase.ts`
- Create: `apps/web/src/use-cases/update-manager.usecase.ts`
- Create: `apps/web/src/use-cases/reset-manager-password.usecase.ts`
- Create: `apps/web/src/presentation/hooks/useAdminSectors.ts`
- Create: `apps/web/src/presentation/hooks/useCreateSector.ts`
- Create: `apps/web/src/presentation/hooks/useUpdateSector.ts`
- Create: `apps/web/src/presentation/hooks/useAdminManagers.ts`
- Create: `apps/web/src/presentation/hooks/useCreateManager.ts`
- Create: `apps/web/src/presentation/hooks/useUpdateManager.ts`
- Create: `apps/web/src/presentation/hooks/useResetManagerPassword.ts`
- Create: `apps/web/src/presentation/pages/ManagerAdminPage.tsx`
- Create: `apps/web/src/presentation/pages/ManagerAdminPage.test.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`
- Modify: `apps/web/src/presentation/lib/routes.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Consumes: `IssuedManagerToken` now carrying `role` (Task 3); `GET/POST/PATCH /manager/admin/sectors[/:id]`, `GET/POST/PATCH /manager/admin/managers[/:id]`, `POST /manager/admin/managers/:id/reset-password` (Task 7, Task 8).
- Produces: `routes.managerAdmin` (`/manager/admin`); `useManagerSessionStore` now exposes `role`.

- [ ] **Step 1: Carry `role` through the manager session store and login**

Replace `apps/web/src/ports/manager-auth.port.ts` in full:

```ts
import { z } from "zod";

export const ManagerLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
});
export type ManagerLoginResult = z.infer<typeof ManagerLoginResultSchema>;

export class InvalidManagerCredentialsError extends Error {}

export interface ManagerAuthPort {
  login(name: string, password: string): Promise<ManagerLoginResult>;
}
```

Replace `apps/web/src/stores/manager-session.store.test.ts`'s existing assertions that call `setSession(token, expiresAt)` with the three-argument form (add `, "HOSPITAL_ADMIN"` or `"SECTOR_MANAGER"` to each call, matching whatever each existing test's scenario implies — default to `"HOSPITAL_ADMIN"` where the role doesn't matter to that test), and add one new test:

```ts
it("stores and exposes the manager's role", () => {
  useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "SECTOR_MANAGER");
  expect(useManagerSessionStore.getState().role).toBe("SECTOR_MANAGER");
});
```

Replace `apps/web/src/stores/manager-session.store.ts` in full:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

interface ManagerSessionState {
  token: string | null;
  expiresAt: string | null;
  role: ManagerRole | null;
  setSession: (token: string, expiresAt: string, role: ManagerRole) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const useManagerSessionStore = create<ManagerSessionState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      role: null,
      setSession: (token, expiresAt, role) => set({ token, expiresAt, role }),
      clearSession: () => set({ token: null, expiresAt: null, role: null }),
      isValid: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return new Date(expiresAt).getTime() > Date.now();
      },
    }),
    { name: "zelo.manager-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
```

Replace `apps/web/src/presentation/hooks/useManagerLogin.ts` in full:

```ts
import { useMutation } from "@tanstack/react-query";
import { loginManagerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

interface LoginVariables {
  name: string;
  password: string;
}

export function useManagerLogin() {
  const setSession = useManagerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ name, password }: LoginVariables) => loginManagerUseCase.execute(name, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt, result.role);
    },
  });
}
```

Run: `pnpm --filter web test manager-session.store useManagerLogin ManagerLoginPage -- --run`
Expected: PASS (all tests — `ManagerLoginPage.test.tsx`'s existing mocked `execute` resolves need `role: "HOSPITAL_ADMIN"` added to their mocked return values; update those two mock objects in that file the same way).

- [ ] **Step 2: Ports and HTTP adapter for the admin panel**

Create `apps/web/src/ports/manager-admin.port.ts`:

```ts
import { z } from "zod";

export const AdminSectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  managerId: z.string().nullable(),
  managerName: z.string().nullable(),
});
export type AdminSector = z.infer<typeof AdminSectorSchema>;

export const ManagerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
  isActive: z.boolean(),
  sectorNames: z.array(z.string()),
});
export type ManagerSummary = z.infer<typeof ManagerSummarySchema>;

export const CreateManagerResultSchema = z.object({
  manager: z.object({ id: z.string(), name: z.string() }),
  temporaryPassword: z.string(),
});
export type CreateManagerResult = z.infer<typeof CreateManagerResultSchema>;

export const ResetPasswordResultSchema = z.object({ temporaryPassword: z.string() });

export class SectorNameConflictError extends Error {}
export class InvalidManagerAdminRequestError extends Error {}
export class LastActiveHospitalAdminError extends Error {}
export class ManagerAdminNotFoundError extends Error {}

export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
}

export interface CreateManagerParams {
  name: string;
  role: "HOSPITAL_ADMIN" | "SECTOR_MANAGER";
  sectorIds?: string[];
}

export interface UpdateManagerParams {
  isActive?: boolean;
  role?: "HOSPITAL_ADMIN" | "SECTOR_MANAGER";
  sectorIds?: string[];
}

export interface ManagerAdminPort {
  listSectors(token: string): Promise<AdminSector[]>;
  createSector(token: string, name: string): Promise<{ id: string; name: string }>;
  updateSector(token: string, id: string, patch: UpdateSectorParams): Promise<void>;
  listManagers(token: string): Promise<ManagerSummary[]>;
  createManager(token: string, params: CreateManagerParams): Promise<CreateManagerResult>;
  updateManager(token: string, id: string, patch: UpdateManagerParams): Promise<void>;
  resetManagerPassword(token: string, id: string): Promise<{ temporaryPassword: string }>;
}
```

Create `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts`:

```ts
import { z } from "zod";
import type {
  AdminSector,
  CreateManagerParams,
  CreateManagerResult,
  ManagerAdminPort,
  ManagerSummary,
  UpdateManagerParams,
  UpdateSectorParams,
} from "@/ports/manager-admin.port";
import {
  AdminSectorSchema,
  CreateManagerResultSchema,
  InvalidManagerAdminRequestError,
  LastActiveHospitalAdminError,
  ManagerAdminNotFoundError,
  ManagerSummarySchema,
  ResetPasswordResultSchema,
  SectorNameConflictError,
} from "@/ports/manager-admin.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function authHeaders(token: string): HeadersInit {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export class HttpManagerAdminAdapter implements ManagerAdminPort {
  async listSectors(token: string): Promise<AdminSector[]> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error(`list sectors failed with status ${response.status}`);
    return z.array(AdminSectorSchema).parse(await response.json());
  }

  async createSector(token: string, name: string): Promise<{ id: string; name: string }> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name }),
    });
    if (response.status === 409) throw new SectorNameConflictError();
    if (!response.ok) throw new Error(`create sector failed with status ${response.status}`);
    return response.json();
  }

  async updateSector(token: string, id: string, patch: UpdateSectorParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`update sector failed with status ${response.status}`);
  }

  async listManagers(token: string): Promise<ManagerSummary[]> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error(`list managers failed with status ${response.status}`);
    return z.array(ManagerSummarySchema).parse(await response.json());
  }

  async createManager(token: string, params: CreateManagerParams): Promise<CreateManagerResult> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(params),
    });
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`create manager failed with status ${response.status}`);
    return CreateManagerResultSchema.parse(await response.json());
  }

  async updateManager(token: string, id: string, patch: UpdateManagerParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (response.status === 409) throw new LastActiveHospitalAdminError();
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`update manager failed with status ${response.status}`);
  }

  async resetManagerPassword(token: string, id: string): Promise<{ temporaryPassword: string }> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers/${id}/reset-password`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`reset manager password failed with status ${response.status}`);
    return ResetPasswordResultSchema.parse(await response.json());
  }
}
```

- [ ] **Step 3: Frontend use-cases (thin pass-throughs, matching the existing one-class-per-operation convention — no standalone tests, same as `lookup-institution.usecase.ts` which also has none beyond what the page test already covers)**

Create `apps/web/src/use-cases/list-sectors.usecase.ts`:

```ts
import type { AdminSector, ManagerAdminPort } from "@/ports/manager-admin.port";

export class ListSectorsUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string): Promise<AdminSector[]> {
    return this.port.listSectors(token);
  }
}
```

Create `apps/web/src/use-cases/create-sector.usecase.ts`:

```ts
import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class CreateSectorUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, name: string): Promise<{ id: string; name: string }> {
    return this.port.createSector(token, name);
  }
}
```

Create `apps/web/src/use-cases/update-sector.usecase.ts`:

```ts
import type { ManagerAdminPort, UpdateSectorParams } from "@/ports/manager-admin.port";

export class UpdateSectorUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string, patch: UpdateSectorParams): Promise<void> {
    return this.port.updateSector(token, id, patch);
  }
}
```

Create `apps/web/src/use-cases/list-managers.usecase.ts`:

```ts
import type { ManagerAdminPort, ManagerSummary } from "@/ports/manager-admin.port";

export class ListManagersUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string): Promise<ManagerSummary[]> {
    return this.port.listManagers(token);
  }
}
```

Create `apps/web/src/use-cases/create-manager.usecase.ts`:

```ts
import type { CreateManagerParams, CreateManagerResult, ManagerAdminPort } from "@/ports/manager-admin.port";

export class CreateManagerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, params: CreateManagerParams): Promise<CreateManagerResult> {
    return this.port.createManager(token, params);
  }
}
```

Create `apps/web/src/use-cases/update-manager.usecase.ts`:

```ts
import type { ManagerAdminPort, UpdateManagerParams } from "@/ports/manager-admin.port";

export class UpdateManagerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string, patch: UpdateManagerParams): Promise<void> {
    return this.port.updateManager(token, id, patch);
  }
}
```

Create `apps/web/src/use-cases/reset-manager-password.usecase.ts`:

```ts
import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class ResetManagerPasswordUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string): Promise<{ temporaryPassword: string }> {
    return this.port.resetManagerPassword(token, id);
  }
}
```

- [ ] **Step 4: Wire the container and hooks**

In `apps/web/src/app/container.ts`, add:

```ts
import { HttpManagerAdminAdapter } from "@/infrastructure/http/http-manager-admin.adapter";
import { ListSectorsUseCase } from "@/use-cases/list-sectors.usecase";
import { CreateSectorUseCase } from "@/use-cases/create-sector.usecase";
import { UpdateSectorUseCase } from "@/use-cases/update-sector.usecase";
import { ListManagersUseCase } from "@/use-cases/list-managers.usecase";
import { CreateManagerUseCase as CreateManagerAdminUseCase } from "@/use-cases/create-manager.usecase";
import { UpdateManagerUseCase as UpdateManagerAdminUseCase } from "@/use-cases/update-manager.usecase";
import { ResetManagerPasswordUseCase } from "@/use-cases/reset-manager-password.usecase";

const managerAdminAdapter = new HttpManagerAdminAdapter();
export const listSectorsUseCase = new ListSectorsUseCase(managerAdminAdapter);
export const createSectorUseCase = new CreateSectorUseCase(managerAdminAdapter);
export const updateSectorUseCase = new UpdateSectorUseCase(managerAdminAdapter);
export const listManagersUseCase = new ListManagersUseCase(managerAdminAdapter);
export const createManagerAdminUseCase = new CreateManagerAdminUseCase(managerAdminAdapter);
export const updateManagerAdminUseCase = new UpdateManagerAdminUseCase(managerAdminAdapter);
export const resetManagerPasswordUseCase = new ResetManagerPasswordUseCase(managerAdminAdapter);
```

(Aliased on import — `CreateManagerUseCase`/`UpdateManagerUseCase` would otherwise collide with Task 6's super-admin-side `create-institution.usecase.ts`/`list-institutions.usecase.ts` naming pattern; no actual name collision exists today, but the alias keeps `container.ts`'s exported symbol names unambiguous between "an admin creating a manager" and any future manager-side use-case with a similar short name.)

Create the seven hooks, each following `useManagerSignals.ts`/`useManagerLogin.ts`'s exact `useQuery`/`useMutation` pattern:

`apps/web/src/presentation/hooks/useAdminSectors.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listSectorsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useAdminSectors() {
  const token = useManagerSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["admin-sectors", token],
    queryFn: () => listSectorsUseCase.execute(token!),
    enabled: token !== null,
  });
}
```

`apps/web/src/presentation/hooks/useCreateSector.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSectorUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useCreateSector() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createSectorUseCase.execute(token!, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sectors"] }),
  });
}
```

`apps/web/src/presentation/hooks/useUpdateSector.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSectorUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { UpdateSectorParams } from "@/ports/manager-admin.port";

export function useUpdateSector() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSectorParams }) => updateSectorUseCase.execute(token!, id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sectors"] }),
  });
}
```

`apps/web/src/presentation/hooks/useAdminManagers.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listManagersUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useAdminManagers() {
  const token = useManagerSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["admin-managers", token],
    queryFn: () => listManagersUseCase.execute(token!),
    enabled: token !== null,
  });
}
```

`apps/web/src/presentation/hooks/useCreateManager.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createManagerAdminUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { CreateManagerParams } from "@/ports/manager-admin.port";

export function useCreateManager() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateManagerParams) => createManagerAdminUseCase.execute(token!, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
```

`apps/web/src/presentation/hooks/useUpdateManager.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateManagerAdminUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { UpdateManagerParams } from "@/ports/manager-admin.port";

export function useUpdateManager() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateManagerParams }) => updateManagerAdminUseCase.execute(token!, id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
```

`apps/web/src/presentation/hooks/useResetManagerPassword.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { resetManagerPasswordUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useResetManagerPassword() {
  const token = useManagerSessionStore((state) => state.token);
  return useMutation({
    mutationFn: (id: string) => resetManagerPasswordUseCase.execute(token!, id),
  });
}
```

- [ ] **Step 5: Add the route**

In `apps/web/src/presentation/lib/routes.ts`, add:

```ts
  managerAdmin: "/manager/admin",
```

- [ ] **Step 6: Write the failing test for `ManagerAdminPage`**

Create `apps/web/src/presentation/pages/ManagerAdminPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminPage } from "./ManagerAdminPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/admin"]}>
        <Routes>
          <Route path="/manager/admin" element={<ManagerAdminPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerAdminPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  });

  it("shows sectors by default and lets an admin create one", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createSectorUseCase, "execute").mockResolvedValue({ id: "sector-1", name: "UTI" });
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Nome do setor"), "UTI");
    await user.click(screen.getByRole("button", { name: "Adicionar setor" }));

    await waitFor(() => expect(container.createSectorUseCase.execute).toHaveBeenCalledWith("token", "UTI"));
  });

  it("switches to the managers tab and creates a SECTOR_MANAGER", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createManagerAdminUseCase, "execute").mockResolvedValue({
      manager: { id: "manager-2", name: "Paulo" },
      temporaryPassword: "temp-pass-123",
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.type(screen.getByLabelText("Nome do gestor"), "Paulo");
    await user.click(screen.getByRole("button", { name: "Adicionar gestor" }));

    await waitFor(() => expect(screen.getByText("temp-pass-123")).toBeInTheDocument());
  });
});
```

- [ ] **Step 7: Run the test to verify it fails, then create `ManagerAdminPage`**

Run: `pnpm --filter web test ManagerAdminPage -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/pages/ManagerAdminPage.tsx`:

```tsx
import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useAdminSectors } from "@/presentation/hooks/useAdminSectors";
import { useCreateSector } from "@/presentation/hooks/useCreateSector";
import { useUpdateSector } from "@/presentation/hooks/useUpdateSector";
import { useAdminManagers } from "@/presentation/hooks/useAdminManagers";
import { useCreateManager } from "@/presentation/hooks/useCreateManager";
import { useUpdateManager } from "@/presentation/hooks/useUpdateManager";
import type { CreateManagerResult } from "@/ports/manager-admin.port";

const SUGGESTED_SECTOR_NAMES = ["UTI", "Pronto-Socorro", "Clínica Médica", "Centro Cirúrgico", "Pediatria", "Ambulatório", "Plantão Noturno"];

function SectorsTab() {
  const sectors = useAdminSectors();
  const createSector = useCreateSector();
  const updateSector = useUpdateSector();
  const [name, setName] = useState("");

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    createSector.mutate(name, { onSuccess: () => setName("") });
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
          <label htmlFor="sector-name" className="text-label font-semibold text-ink-2">
            Nome do setor
          </label>
          <input
            id="sector-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_SECTOR_NAMES.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setName(suggestion)}
                className="rounded-pill border border-line px-3 py-1 text-label text-muted"
              >
                {suggestion}
              </button>
            ))}
          </div>
          {createSector.isError && (
            <p role="alert" className="mt-2 text-label text-danger">
              Já existe um setor com esse nome.
            </p>
          )}
        </Card>
        <div className="mt-3">
          <Button type="submit" variant="primary" loading={createSector.isPending} disabled={name.trim().length === 0}>
            Adicionar setor
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {(sectors.data ?? []).map((sector) => (
          <Card key={sector.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body font-extrabold text-ink">{sector.name}</p>
                <p className="text-caption text-muted">
                  {sector.managerName ?? "Sem gestor"} · {sector.isActive ? "Ativo" : "Inativo"}
                </p>
              </div>
              <Button
                variant="outline"
                full={false}
                onClick={() => updateSector.mutate({ id: sector.id, patch: { isActive: !sector.isActive } })}
              >
                {sector.isActive ? "Desativar" : "Ativar"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ManagersTab() {
  const managers = useAdminManagers();
  const createManager = useCreateManager();
  const updateManager = useUpdateManager();
  const [name, setName] = useState("");
  const [lastCreated, setLastCreated] = useState<CreateManagerResult | null>(null);

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    createManager.mutate(
      { name, role: "HOSPITAL_ADMIN" },
      {
        onSuccess: (result) => {
          setLastCreated(result);
          setName("");
        },
      },
    );
  };

  return (
    <div>
      {lastCreated && (
        <Card tone="brand-tint" className="mt-4" role="status">
          <p className="text-label font-semibold text-ink-2">
            Senha temporária de {lastCreated.manager.name}: <span className="font-mono">{lastCreated.temporaryPassword}</span>
          </p>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
          <label htmlFor="manager-name-input" className="text-label font-semibold text-ink-2">
            Nome do gestor
          </label>
          <input
            id="manager-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
          />
        </Card>
        <div className="mt-3">
          <Button type="submit" variant="primary" loading={createManager.isPending} disabled={name.trim().length === 0}>
            Adicionar gestor
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {(managers.data ?? []).map((manager) => (
          <Card key={manager.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body font-extrabold text-ink">{manager.name}</p>
                <p className="text-caption text-muted">
                  {manager.role === "HOSPITAL_ADMIN" ? "Gestor do hospital" : `Gestor de setor · ${manager.sectorNames.join(", ") || "sem setor"}`}
                  {" · "}
                  {manager.isActive ? "Ativo" : "Inativo"}
                </p>
              </div>
              <Button
                variant="outline"
                full={false}
                onClick={() => updateManager.mutate({ id: manager.id, patch: { isActive: !manager.isActive } })}
              >
                {manager.isActive ? "Desativar" : "Ativar"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ManagerAdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"sectors" | "managers">("sectors");

  return (
    <PhoneShell bg="canvas-alt">
      <div className="pt-6.5">
        <BackButton label="Painel" onClick={() => navigate(routes.manager)} />
        <h1 className="mt-4 text-h2 text-ink">Administração</h1>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("sectors")}
            className={["rounded-pill px-4 py-2 text-label font-semibold", tab === "sectors" ? "bg-brand text-white" : "bg-surface text-ink"].join(" ")}
          >
            Setores
          </button>
          <button
            type="button"
            onClick={() => setTab("managers")}
            className={["rounded-pill px-4 py-2 text-label font-semibold", tab === "managers" ? "bg-brand text-white" : "bg-surface text-ink"].join(" ")}
          >
            Gestores
          </button>
        </div>

        {tab === "sectors" ? <SectorsTab /> : <ManagersTab />}
      </div>
    </PhoneShell>
  );
}
```

Run: `pnpm --filter web test ManagerAdminPage -- --run` — expected PASS.

- [ ] **Step 8: Gate the nav link and the route by role**

In `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`, add a role check next to the existing header controls: import `useManagerSessionStore` (already used elsewhere in this file for `clearSession`) and `Link`/`routes.managerAdmin` (already imported for `routes.managerHistory`), then render a link only for hospital admins. Add this line inside the component, alongside the existing `clearSession` destructure:

```tsx
  const role = useManagerSessionStore((state) => state.role);
```

And inside the header's `SectionLabel` block (right after `<SectionLabel>Painel do gestor</SectionLabel>`), add:

```tsx
{role === "HOSPITAL_ADMIN" && (
  <Link to={routes.managerAdmin} className="text-label font-bold text-brand">
    Administração
  </Link>
)}
```

Add one new test to `ManagerDashboardPage.test.tsx`: seed `useManagerSessionStore` with `role: "SECTOR_MANAGER"` in one test and assert `screen.queryByText("Administração")` is absent; seed with `role: "HOSPITAL_ADMIN"` in another and assert it's present.

In `apps/web/src/app/router.tsx`, add the route (client-side UX gate only — the real access control is the server's 403 on every `/manager/admin/*` endpoint call, per Task 7/8):

```tsx
  {
    path: "manager/admin",
    Component: ManagerAdminPage,
    loader: () => {
      if (!useManagerSessionStore.getState().isValid()) return redirect(routes.managerLogin);
      if (useManagerSessionStore.getState().role !== "HOSPITAL_ADMIN") return redirect(routes.manager);
      return null;
    },
  },
```

(Import `ManagerAdminPage` alongside the other page imports at the top of the file.)

- [ ] **Step 9: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/ports/manager-auth.port.ts apps/web/src/stores/manager-session.store.ts apps/web/src/stores/manager-session.store.test.ts \
        apps/web/src/presentation/hooks/useManagerLogin.ts apps/web/src/presentation/pages/ManagerLoginPage.test.tsx \
        apps/web/src/ports/manager-admin.port.ts apps/web/src/infrastructure/http/http-manager-admin.adapter.ts \
        apps/web/src/use-cases/list-sectors.usecase.ts apps/web/src/use-cases/create-sector.usecase.ts apps/web/src/use-cases/update-sector.usecase.ts \
        apps/web/src/use-cases/list-managers.usecase.ts apps/web/src/use-cases/create-manager.usecase.ts apps/web/src/use-cases/update-manager.usecase.ts \
        apps/web/src/use-cases/reset-manager-password.usecase.ts \
        apps/web/src/presentation/hooks/useAdminSectors.ts apps/web/src/presentation/hooks/useCreateSector.ts apps/web/src/presentation/hooks/useUpdateSector.ts \
        apps/web/src/presentation/hooks/useAdminManagers.ts apps/web/src/presentation/hooks/useCreateManager.ts apps/web/src/presentation/hooks/useUpdateManager.ts \
        apps/web/src/presentation/hooks/useResetManagerPassword.ts \
        apps/web/src/presentation/pages/ManagerAdminPage.tsx apps/web/src/presentation/pages/ManagerAdminPage.test.tsx \
        apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx \
        apps/web/src/presentation/lib/routes.ts apps/web/src/app/router.tsx apps/web/src/app/container.ts
git commit -m "feat(web): add hospital-admin panel (sectors + managers tabs) with role-gated nav and route"
```

---

### Task 10: Dashboard sector filter (backend resolution + frontend multiselect)

**Files:**

- Modify: `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/resolve-accessible-sector-ids.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/resolve-accessible-sector-ids.use-case.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/get-accessible-sectors.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/get-accessible-sectors.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`
- Modify: `apps/web/src/ports/manager-signals.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-signals.adapter.ts`
- Modify: `apps/web/src/use-cases/get-manager-signals.usecase.ts`
- Modify: `apps/web/src/use-cases/get-manager-signals.usecase.test.ts`
- Modify: `apps/web/src/presentation/hooks/useManagerSignals.ts`
- Create: `apps/web/src/ports/manager-sectors.port.ts`
- Create: `apps/web/src/infrastructure/http/http-manager-sectors.adapter.ts`
- Create: `apps/web/src/use-cases/list-accessible-sectors.usecase.ts`
- Create: `apps/web/src/presentation/hooks/useManagerSectors.ts`
- Create: `apps/web/src/presentation/ui/SectorMultiSelect.tsx`
- Create: `apps/web/src/presentation/ui/SectorMultiSelect.test.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Consumes: `SectorRepository.findActiveByInstitution`, `findActiveByIds`, `findAssignedSectorIds` (Task 7); `GetManagerSignalsUseCase.execute(institutionId)` (Task 2, single-arg as of that task).
- Produces: `SignalRepository.findAll(institutionId, sectorIds)` and `GetManagerSignalsUseCase.execute(institutionId, sectorIds)` — **this task is what adds the `sectorIds` parameter**, deferred from Task 2 because it depends on `SectorRepository` (Task 7), which didn't exist yet at that point; `GET /manager/sectors` (accessible-only, both roles); `GET /manager/signals?sectorIds=a,b,c` (optional filter, server-resolved).

- [ ] **Step 1: Write the failing test for the `sectorIds`-filtered `SignalRepository`/`GetManagerSignalsUseCase`**

Replace `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts` in full — every `execute()` call gains a second `sectorIds` argument, `FakeSignalRepository.findAll` gains a matching second parameter, and one new test asserts the empty-list short-circuit (every other test's assertions are unchanged from Task 2, just with `, ["a", "b", "c"]`-style second arguments added where the fixture has multiple sectors, or `, ["<the-one-sector-id>"]` where it has one):

```ts
import { describe, expect, it } from "vitest";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SignalRepository, SignalRow } from "../ports/signal-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../ports/simulated-follow-up-repository.port.ts";

class FakeSignalRepository implements SignalRepository {
  public lastCall: { institutionId: string; sectorIds: string[] } | null = null;
  constructor(private readonly rows: SignalRow[]) {}
  async findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]> {
    this.lastCall = { institutionId, sectorIds };
    return this.rows;
  }
}

class FakeSimulatedFollowUpRepository implements SimulatedFollowUpRepository {
  constructor(private readonly rows: SimulatedFollowUpRow[]) {}
  async findAll(): Promise<SimulatedFollowUpRow[]> {
    return this.rows;
  }
}

const WEEK_1 = new Date("2026-06-15T00:00:00.000Z");
const WEEK_2 = new Date("2026-06-22T00:00:00.000Z"); // most recent

describe("GetManagerSignalsUseCase", () => {
  it("passes the given institutionId and sectorIds through to the repository", async () => {
    const repository = new FakeSignalRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    await useCase.execute("institution-1", ["sector-a", "sector-b"]);

    expect(repository.lastCall).toEqual({ institutionId: "institution-1", sectorIds: ["sector-a", "sector-b"] });
  });

  it("returns the all-zero response without calling the repository when sectorIds is empty", async () => {
    const repository = new FakeSignalRepository([{ sectorId: "x", sectorName: "X", weekStart: WEEK_1, checkIns: 10, concerning: 5 }]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", []);

    expect(result).toEqual({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
    });
    expect(repository.lastCall).toBeNull();
  });

  it("computes segments from the most recent week only, excluding sectors under k=5, labeling by sectorName", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["a", "b", "c"]);

    expect(result.segments).toEqual(
      expect.arrayContaining([
        { label: "A", value: 60, n: 10 },
        { label: "B", value: 40, n: 10 },
      ]),
    );
    expect(result.segments).toHaveLength(2); // "C" (n=4) suppressed
  });

  it("computes overallConcerningRate from only the visible sectors' most recent week", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["a", "b", "c"]);

    expect(result.overallConcerningRate).toBe(0.5); // (6+4)/(10+10), C excluded
  });

  it("computes weeklyTrend and checkInsLast4Weeks as sums including the suppressed sector", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "a", sectorName: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["a", "b", "c"]);

    expect(result.weeklyTrend).toEqual([
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.375 },
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5 },
    ]);
    expect(result.checkInsLast4Weeks).toBe(48);
  });

  it("returns 0 for overallConcerningRate (not NaN) when every sector is suppressed", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "tiny", sectorName: "Tiny", weekStart: WEEK_2, checkIns: 2, concerning: 1 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["tiny"]);

    expect(result.segments).toEqual([]);
    expect(result.overallConcerningRate).toBe(0);
    expect(result.checkInsLast4Weeks).toBe(2);
  });
});

describe("GetManagerSignalsUseCase - followUpResponseRate", () => {
  it("computes the rate from the most recent week only", async () => {
    const repository = new FakeSignalRepository([]);
    const followUpRepository = new FakeSimulatedFollowUpRepository([
      { weekStart: WEEK_1, sent: 20, responded: 5 },
      { weekStart: WEEK_2, sent: 20, responded: 15 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, followUpRepository);

    const result = await useCase.execute("institution-1", ["a"]);

    expect(result.followUpResponseRate).toBe(0.75);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test get-manager-signals -- --run`
Expected: FAIL — `execute()` doesn't accept a second argument yet.

- [ ] **Step 3: Update the port, adapter, and use-case to accept `sectorIds`**

Replace `apps/api/src/modules/manager/application/ports/signal-repository.port.ts` in full:

```ts
export interface SignalRow {
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

export interface SignalRepository {
  findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]>;
}

export const SIGNAL_REPOSITORY = Symbol("SIGNAL_REPOSITORY");
```

Replace `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts` in full — the query gains a `sectorId: { in: sectorIds }` filter:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { SignalRepository, SignalRow } from "../../application/ports/signal-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaSignalRepository implements SignalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]> {
    const rows = await this.prisma.signal.findMany({
      where: { institutionId, sectorId: { in: sectorIds } },
      select: { sectorId: true, weekStart: true, checkIns: true, concerning: true, sector: { select: { name: true } } },
    });
    return rows.map((row) => ({
      sectorId: row.sectorId,
      sectorName: row.sector.name,
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    }));
  }
}
```

Replace `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts` in full — `execute` gains `sectorIds: string[]` and short-circuits to the all-zero response when it's empty (an empty accessible-sector set — e.g. a `SECTOR_MANAGER` with every assigned sector deactivated — must never reach the repository with an ambiguous "no filter" empty array):

```ts
import { Inject, Injectable } from "@nestjs/common";
import { K_ANONYMITY_THRESHOLD } from "../constants.ts";
import { SIGNAL_REPOSITORY, type SignalRepository, type SignalRow } from "../ports/signal-repository.port.ts";
import {
  SIMULATED_FOLLOW_UP_REPOSITORY,
  type SimulatedFollowUpRepository,
} from "../ports/simulated-follow-up-repository.port.ts";

export interface ManagerSignalsResponse {
  overallConcerningRate: number;
  checkInsLast4Weeks: number;
  weeklyTrend: { weekStart: string; concerningRate: number }[];
  segments: { label: string; value: number; n: number }[];
  followUpResponseRate: number;
}

const RECENT_WEEKS_FOR_VOLUME = 4;
const EMPTY_RESPONSE: Omit<ManagerSignalsResponse, "followUpResponseRate"> = {
  overallConcerningRate: 0,
  checkInsLast4Weeks: 0,
  weeklyTrend: [],
  segments: [],
};

@Injectable()
export class GetManagerSignalsUseCase {
  constructor(
    @Inject(SIGNAL_REPOSITORY) private readonly repository: SignalRepository,
    @Inject(SIMULATED_FOLLOW_UP_REPOSITORY) private readonly followUpRepository: SimulatedFollowUpRepository,
  ) {}

  async execute(institutionId: string, sectorIds: string[]): Promise<ManagerSignalsResponse> {
    const followUpResponseRate = await this.computeFollowUpResponseRate();

    if (sectorIds.length === 0) {
      return { ...EMPTY_RESPONSE, followUpResponseRate };
    }

    const rows = await this.repository.findAll(institutionId, sectorIds);
    if (rows.length === 0) {
      return { ...EMPTY_RESPONSE, followUpResponseRate };
    }

    const weekTimes = [...new Set(rows.map((r) => r.weekStart.getTime()))].sort((a, b) => a - b);
    const mostRecentWeek = weekTimes[weekTimes.length - 1]!;

    const bySector = new Map<string, SignalRow[]>();
    for (const row of rows) {
      const list = bySector.get(row.sectorId) ?? [];
      list.push(row);
      bySector.set(row.sectorId, list);
    }

    const segments: { label: string; value: number; n: number }[] = [];
    let visibleConcerning = 0;
    let visibleCheckIns = 0;

    for (const [, sectorRows] of bySector) {
      const currentWeekRow = sectorRows.find((r) => r.weekStart.getTime() === mostRecentWeek);
      if (!currentWeekRow || currentWeekRow.checkIns < K_ANONYMITY_THRESHOLD) continue;

      segments.push({
        label: currentWeekRow.sectorName,
        value: Math.round((currentWeekRow.concerning / currentWeekRow.checkIns) * 100),
        n: currentWeekRow.checkIns,
      });
      visibleConcerning += currentWeekRow.concerning;
      visibleCheckIns += currentWeekRow.checkIns;
    }

    const overallConcerningRate = visibleCheckIns === 0 ? 0 : visibleConcerning / visibleCheckIns;

    const recentWeekTimes = new Set(weekTimes.slice(-RECENT_WEEKS_FOR_VOLUME));
    const checkInsLast4Weeks = rows
      .filter((r) => recentWeekTimes.has(r.weekStart.getTime()))
      .reduce((sum, r) => sum + r.checkIns, 0);

    const weeklyTrend = weekTimes.map((weekTime) => {
      const weekRows = rows.filter((r) => r.weekStart.getTime() === weekTime);
      const totalCheckIns = weekRows.reduce((sum, r) => sum + r.checkIns, 0);
      const totalConcerning = weekRows.reduce((sum, r) => sum + r.concerning, 0);
      return {
        weekStart: new Date(weekTime).toISOString(),
        concerningRate: totalCheckIns === 0 ? 0 : totalConcerning / totalCheckIns,
      };
    });

    return { overallConcerningRate, checkInsLast4Weeks, weeklyTrend, segments, followUpResponseRate };
  }

  private async computeFollowUpResponseRate(): Promise<number> {
    const rows = await this.followUpRepository.findAll();
    if (rows.length === 0) return 0;

    const mostRecent = rows.reduce((latest, row) => (row.weekStart > latest.weekStart ? row : latest));
    return mostRecent.sent === 0 ? 0 : mostRecent.responded / mostRecent.sent;
  }
}
```

Run: `pnpm --filter @zelo/api test get-manager-signals -- --run` — expected PASS.

Note: this leaves `manager.controller.ts`'s existing `signals()` handler (`this.getManagerSignals.execute(request.manager!.institutionId)`, one argument) failing to typecheck until Step 7 of this same task rewrites it — unlike the schema-migration gaps in Task 1/2, this one closes within this task, not several tasks later, so no intermediate commit here leaves the build broken. Do not commit between this step and Step 7.

- [ ] **Step 4: Write the failing test for `ResolveAccessibleSectorIdsUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/resolve-accessible-sector-ids.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ResolveAccessibleSectorIdsUseCase } from "./resolve-accessible-sector-ids.use-case.ts";

class FakeSectorRepository {
  constructor(private readonly active: { id: string; name: string }[], private readonly assigned: string[]) {}
  async findActiveByInstitution() {
    return this.active;
  }
  async findActiveByIds(_institutionId: string, ids: string[]) {
    return this.active.filter((sector) => ids.includes(sector.id));
  }
  async findAssignedSectorIds() {
    return this.assigned;
  }
}

describe("ResolveAccessibleSectorIdsUseCase", () => {
  it("returns every active sector id for a HOSPITAL_ADMIN with no requested filter", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], []);
    const useCase = new ResolveAccessibleSectorIdsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "HOSPITAL_ADMIN", managerId: "m-1" });

    expect(result).toEqual(["a", "b"]);
  });

  it("intersects a HOSPITAL_ADMIN's requested subset with all active sectors", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], []);
    const useCase = new ResolveAccessibleSectorIdsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "HOSPITAL_ADMIN", managerId: "m-1", requestedSectorIds: ["a"] });

    expect(result).toEqual(["a"]);
  });

  it("returns only a SECTOR_MANAGER's assigned sectors when no filter is requested", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["b"]);
    const useCase = new ResolveAccessibleSectorIdsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2" });

    expect(result).toEqual(["b"]);
  });

  it("silently drops a SECTOR_MANAGER's requested id that falls outside their assignment, rather than erroring", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["b"]);
    const useCase = new ResolveAccessibleSectorIdsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2", requestedSectorIds: ["a", "b"] });

    expect(result).toEqual(["b"]);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails, then create the use-case**

Run: `pnpm --filter @zelo/api test resolve-accessible-sector-ids -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/manager/application/use-cases/resolve-accessible-sector-ids.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import type { ManagerRole } from "../ports/manager-repository.port.ts";

export interface ResolveAccessibleSectorIdsInput {
  institutionId: string;
  role: ManagerRole;
  managerId: string;
  requestedSectorIds?: string[];
}

@Injectable()
export class ResolveAccessibleSectorIdsUseCase {
  constructor(@Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository) {}

  async execute(input: ResolveAccessibleSectorIdsInput): Promise<string[]> {
    if (input.role === "HOSPITAL_ADMIN") {
      const active = await this.sectorRepository.findActiveByInstitution(input.institutionId);
      const activeIds = new Set(active.map((sector) => sector.id));
      if (!input.requestedSectorIds) return [...activeIds];
      return input.requestedSectorIds.filter((id) => activeIds.has(id));
    }

    const assigned = await this.sectorRepository.findAssignedSectorIds(input.managerId);
    if (!input.requestedSectorIds) return assigned;
    const assignedSet = new Set(assigned);
    return input.requestedSectorIds.filter((id) => assignedSet.has(id));
  }
}
```

Run: `pnpm --filter @zelo/api test resolve-accessible-sector-ids -- --run` — expected PASS.

- [ ] **Step 6: Write the failing test for `GetAccessibleSectorsUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/get-accessible-sectors.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GetAccessibleSectorsUseCase } from "./get-accessible-sectors.use-case.ts";

class FakeSectorRepository {
  constructor(private readonly active: { id: string; name: string }[], private readonly assigned: string[]) {}
  async findActiveByInstitution() {
    return this.active;
  }
  async findActiveByIds(_institutionId: string, ids: string[]) {
    return this.active.filter((sector) => ids.includes(sector.id));
  }
  async findAssignedSectorIds() {
    return this.assigned;
  }
}

describe("GetAccessibleSectorsUseCase", () => {
  it("returns every active sector for a HOSPITAL_ADMIN", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], []);
    const useCase = new GetAccessibleSectorsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "HOSPITAL_ADMIN", managerId: "m-1" });

    expect(result).toEqual([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
  });

  it("returns only a SECTOR_MANAGER's assigned active sectors", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["b"]);
    const useCase = new GetAccessibleSectorsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2" });

    expect(result).toEqual([{ id: "b", name: "B" }]);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails, then create the use-case**

Run: `pnpm --filter @zelo/api test get-accessible-sectors -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/manager/application/use-cases/get-accessible-sectors.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import type { ManagerRole } from "../ports/manager-repository.port.ts";

export interface GetAccessibleSectorsInput {
  institutionId: string;
  role: ManagerRole;
  managerId: string;
}

@Injectable()
export class GetAccessibleSectorsUseCase {
  constructor(@Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository) {}

  async execute(input: GetAccessibleSectorsInput): Promise<{ id: string; name: string }[]> {
    if (input.role === "HOSPITAL_ADMIN") {
      return this.sectorRepository.findActiveByInstitution(input.institutionId);
    }

    const assignedIds = await this.sectorRepository.findAssignedSectorIds(input.managerId);
    return this.sectorRepository.findActiveByIds(input.institutionId, assignedIds);
  }
}
```

Run: `pnpm --filter @zelo/api test get-accessible-sectors -- --run` — expected PASS.

- [ ] **Step 8: Extend `manager.controller.test.ts` with the new endpoint and the filtered-signals behavior**

First, update this file's existing `FakeSignalRepository` (already updated once in Task 3 Step 12 for the `sectorId`/`sectorName` row shape) to match this task's Step 3 port change: `findAll` now takes a second `sectorIds: string[]` parameter. Change its `findAll` method to `async findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]> { return (this.byInstitution[institutionId] ?? []).filter((row) => sectorIds.includes(row.sectorId)); }` (filtering by the passed-in ids, not just institution, so the new "narrows to the requested sectors" test below actually exercises real filtering rather than a fake that ignores its second argument).

Because every `GET /manager/signals` call now resolves `sectorIds` via `ResolveAccessibleSectorIdsUseCase` → `FakeSectorRepository.findActiveByInstitution` first (a `HOSPITAL_ADMIN`, which every manager fixture in this file is), the **pre-existing** "GET /manager/signals returns only the authenticated manager's own institution's data, suppressing n<5 departments" test (from before this task) needs one addition: before its `GET /manager/signals` calls, seed `sectorRepository.activeByInstitution = { "institution-a": [{ id: "sector-a", name: "A" }, { id: "sector-tiny", name: "Tiny" }], "institution-b": [{ id: "sector-a", name: "A" }] };` — matching the `sectorId`s that test's `signalRepository.setRowsForInstitution` fixtures already use (per Task 3 Step 12). Without this, `findActiveByInstitution` returns `[]` for both institutions by default, `sectorIds` resolves to empty, and the endpoint would short-circuit to the all-zero response instead of the segments that test asserts.

Then add to `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts` (new imports for `SECTOR_REPOSITORY`/`ResolveAccessibleSectorIdsUseCase`/`GetAccessibleSectorsUseCase`, a `FakeSectorRepository` implementing the full port — reuse the shape from Step 4/6's fakes but implementing every `SectorRepository` method, throwing `"not used in this test"` for the ones this file's tests don't exercise — wired into the existing `Test.createTestingModule` call's `providers` array, plus these `it` blocks):

```ts
it("GET /manager/sectors returns every active sector for a HOSPITAL_ADMIN", async () => {
  sectorRepository.activeByInstitution = { "institution-a": [{ id: "sector-1", name: "UTI" }] };
  const token = await getToken("Ana Konder", "test-password");

  const response = await request(app.getHttpServer()).get("/manager/sectors").set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual([{ id: "sector-1", name: "UTI" }]);
});

it("GET /manager/signals?sectorIds=... narrows the result to the requested, permitted sectors", async () => {
  signalRepository.setRowsForInstitution("institution-a", [
    { sectorId: "sector-1", sectorName: "UTI", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 10, concerning: 6 },
    { sectorId: "sector-2", sectorName: "Pronto-Socorro", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 20, concerning: 2 },
  ]);
  sectorRepository.activeByInstitution = { "institution-a": [{ id: "sector-1", name: "UTI" }, { id: "sector-2", name: "Pronto-Socorro" }] };
  const token = await getToken("Ana Konder", "test-password");

  const response = await request(app.getHttpServer())
    .get("/manager/signals?sectorIds=sector-1")
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.segments).toEqual([{ label: "UTI", value: 60, n: 10 }]);
});
```

Extend the fake to support this (add to `FakeSectorRepository`): a settable `activeByInstitution: Record<string, { id: string; name: string }[]>` map backing `findActiveByInstitution`, and `findActiveByIds` filtering that same map's entries by id; `findAssignedSectorIds` can throw `"not used in this test"` (this file's manager fixtures are all `HOSPITAL_ADMIN`, per Step... — Task 3's fixture update — so it's never reached).

- [ ] **Step 9: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test manager.controller -- --run`
Expected: FAIL — `GET /manager/sectors` doesn't exist yet; `GET /manager/signals` doesn't read `sectorIds` yet.

- [ ] **Step 10: Extend `ManagerController`**

Replace `apps/api/src/modules/manager/infrastructure/manager.controller.ts` in full:

```ts
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { LoginManagerUseCase, InvalidManagerCredentialsError } from "../application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase, type ManagerSignalsResponse } from "../application/use-cases/get-manager-signals.use-case.ts";
import { GenerateManagerInsightUseCase } from "../application/use-cases/generate-manager-insight.use-case.ts";
import { GetManagerInsightHistoryUseCase } from "../application/use-cases/get-manager-insight-history.use-case.ts";
import { ResolveAccessibleSectorIdsUseCase } from "../application/use-cases/resolve-accessible-sector-ids.use-case.ts";
import { GetAccessibleSectorsUseCase } from "../application/use-cases/get-accessible-sectors.use-case.ts";
import { InsightGenerationFailedError, type ManagerInsightResponse } from "../application/ports/ai-insight.port.ts";
import type { StoredManagerInsight } from "../application/ports/manager-insight-repository.port.ts";
import type { IssuedManagerToken } from "../application/services/manager-token.service.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";

const LoginRequestSchema = z.object({ name: z.string().min(1).max(200), password: z.string().min(1).max(200) });

@Controller("manager")
export class ManagerController {
  constructor(
    @Inject(LoginManagerUseCase) private readonly loginManager: LoginManagerUseCase,
    @Inject(GetManagerSignalsUseCase) private readonly getManagerSignals: GetManagerSignalsUseCase,
    @Inject(GenerateManagerInsightUseCase) private readonly generateManagerInsight: GenerateManagerInsightUseCase,
    @Inject(GetManagerInsightHistoryUseCase) private readonly getManagerInsightHistory: GetManagerInsightHistoryUseCase,
    @Inject(ResolveAccessibleSectorIdsUseCase) private readonly resolveAccessibleSectorIds: ResolveAccessibleSectorIdsUseCase,
    @Inject(GetAccessibleSectorsUseCase) private readonly getAccessibleSectors: GetAccessibleSectorsUseCase,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedManagerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginManager.execute(parsed.data.name, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidManagerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Get("sectors")
  @UseGuards(ManagerAuthGuard)
  async sectors(@Req() request: Request): Promise<{ id: string; name: string }[]> {
    return this.getAccessibleSectors.execute({
      institutionId: request.manager!.institutionId,
      role: request.manager!.role,
      managerId: request.manager!.id,
    });
  }

  @Get("signals")
  @UseGuards(ManagerAuthGuard)
  async signals(@Req() request: Request, @Query("sectorIds") sectorIdsParam?: string): Promise<ManagerSignalsResponse> {
    const requestedSectorIds = sectorIdsParam ? sectorIdsParam.split(",").filter((id) => id.length > 0) : undefined;
    const sectorIds = await this.resolveAccessibleSectorIds.execute({
      institutionId: request.manager!.institutionId,
      role: request.manager!.role,
      managerId: request.manager!.id,
      requestedSectorIds,
    });
    return this.getManagerSignals.execute(request.manager!.institutionId, sectorIds);
  }

  @Post("insights")
  @HttpCode(200)
  @UseGuards(ManagerAuthGuard)
  async insights(@Req() request: Request): Promise<ManagerInsightResponse> {
    try {
      return await this.generateManagerInsight.execute(request.manager!.name, request.manager!.institutionId);
    } catch (error) {
      if (error instanceof InsightGenerationFailedError) {
        throw new BadGatewayException();
      }
      throw error;
    }
  }

  @Get("insights/history")
  @UseGuards(ManagerAuthGuard)
  async insightsHistory(@Req() request: Request): Promise<StoredManagerInsight[]> {
    return this.getManagerInsightHistory.execute(request.manager!.institutionId);
  }
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 12: Register the new use-cases in `ManagerModule`**

In `apps/api/src/modules/manager/manager.module.ts`, add `ResolveAccessibleSectorIdsUseCase` and `GetAccessibleSectorsUseCase` to the `providers` array (plain class tokens, same as the other manager use-cases).

- [ ] **Step 13: Frontend — ports and adapter for accessible sectors**

Create `apps/web/src/ports/manager-sectors.port.ts`:

```ts
import { z } from "zod";

export const AccessibleSectorSchema = z.object({ id: z.string(), name: z.string() });
export type AccessibleSector = z.infer<typeof AccessibleSectorSchema>;

export interface ManagerSectorsPort {
  listAccessible(token: string): Promise<AccessibleSector[]>;
}
```

Create `apps/web/src/infrastructure/http/http-manager-sectors.adapter.ts`:

```ts
import { z } from "zod";
import type { AccessibleSector, ManagerSectorsPort } from "@/ports/manager-sectors.port";
import { AccessibleSectorSchema } from "@/ports/manager-sectors.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpManagerSectorsAdapter implements ManagerSectorsPort {
  async listAccessible(token: string): Promise<AccessibleSector[]> {
    const response = await fetch(`${API_BASE_URL}/manager/sectors`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`list accessible sectors failed with status ${response.status}`);
    return z.array(AccessibleSectorSchema).parse(await response.json());
  }
}
```

Create `apps/web/src/use-cases/list-accessible-sectors.usecase.ts`:

```ts
import type { AccessibleSector, ManagerSectorsPort } from "@/ports/manager-sectors.port";

export class ListAccessibleSectorsUseCase {
  constructor(private readonly port: ManagerSectorsPort) {}
  async execute(token: string): Promise<AccessibleSector[]> {
    return this.port.listAccessible(token);
  }
}
```

In `apps/web/src/app/container.ts`, add:

```ts
import { HttpManagerSectorsAdapter } from "@/infrastructure/http/http-manager-sectors.adapter";
import { ListAccessibleSectorsUseCase } from "@/use-cases/list-accessible-sectors.usecase";

export const listAccessibleSectorsUseCase = new ListAccessibleSectorsUseCase(new HttpManagerSectorsAdapter());
```

Create `apps/web/src/presentation/hooks/useManagerSectors.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listAccessibleSectorsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerSectors() {
  const token = useManagerSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["manager-accessible-sectors", token],
    queryFn: () => listAccessibleSectorsUseCase.execute(token!),
    enabled: token !== null,
  });
}
```

- [ ] **Step 14: Frontend — pass `sectorIds` through the signals fetch**

Replace `apps/web/src/ports/manager-signals.port.ts` in full:

```ts
import { z } from "zod";

export const ManagerSignalsResponseSchema = z.object({
  overallConcerningRate: z.number(),
  checkInsLast4Weeks: z.number(),
  weeklyTrend: z.array(z.object({ weekStart: z.string(), concerningRate: z.number() })),
  segments: z.array(z.object({ label: z.string(), value: z.number(), n: z.number() })),
  followUpResponseRate: z.number(),
});
export type ManagerSignalsResponse = z.infer<typeof ManagerSignalsResponseSchema>;

export class UnauthorizedManagerError extends Error {}

export interface ManagerSignalsPort {
  fetchSignals(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse>;
}
```

Replace `apps/web/src/infrastructure/http/http-manager-signals.adapter.ts` in full:

```ts
import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";
import { ManagerSignalsResponseSchema, UnauthorizedManagerError } from "@/ports/manager-signals.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpManagerSignalsAdapter implements ManagerSignalsPort {
  async fetchSignals(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    const query = sectorIds && sectorIds.length > 0 ? `?sectorIds=${sectorIds.map(encodeURIComponent).join(",")}` : "";
    const response = await fetch(`${API_BASE_URL}/manager/signals${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager signals failed with status ${response.status}`);
    }

    return ManagerSignalsResponseSchema.parse(await response.json());
  }
}
```

Replace `apps/web/src/use-cases/get-manager-signals.usecase.ts` in full:

```ts
import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";

export class GetManagerSignalsUseCase {
  constructor(private readonly signalsPort: ManagerSignalsPort) {}

  async execute(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    return this.signalsPort.fetchSignals(token, sectorIds);
  }
}
```

Add one test to `apps/web/src/use-cases/get-manager-signals.usecase.test.ts` (keep the existing two as-is):

```ts
it("forwards sectorIds to the port", async () => {
  const port = new FakeManagerSignalsPort(SAMPLE_RESPONSE);
  const spy = vi.spyOn(port, "fetchSignals");
  const useCase = new GetManagerSignalsUseCase(port);

  await useCase.execute("valid-token", ["sector-1"]);

  expect(spy).toHaveBeenCalledWith("valid-token", ["sector-1"]);
});
```

(Add `import { vi } from "vitest";` to that test file's existing `vitest` import line.)

Replace `apps/web/src/presentation/hooks/useManagerSignals.ts` in full:

```ts
import { useQuery } from "@tanstack/react-query";
import { getManagerSignalsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerSignals(sectorIds?: string[]) {
  const token = useManagerSessionStore((state) => state.token);

  return useQuery({
    queryKey: ["manager-signals", token, sectorIds],
    queryFn: () => getManagerSignalsUseCase.execute(token!, sectorIds),
    enabled: token !== null,
    retry: false,
  });
}
```

- [ ] **Step 15: Write the failing test for `SectorMultiSelect`**

Create `apps/web/src/presentation/ui/SectorMultiSelect.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectorMultiSelect } from "./SectorMultiSelect";

const SECTORS = [{ id: "a", name: "UTI" }, { id: "b", name: "Pronto-Socorro" }];

describe("SectorMultiSelect", () => {
  it("renders one checkbox per sector, all checked when selected is undefined (defaults to all)", () => {
    render(<SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={() => {}} />);

    expect(screen.getByLabelText("UTI")).toBeChecked();
    expect(screen.getByLabelText("Pronto-Socorro")).toBeChecked();
  });

  it("calls onChange with the toggled sector removed from the full set when unchecking one of an implicit all-selected state", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={onChange} />);

    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("calls onChange with the sector added back when re-checking an explicitly narrowed selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={["b"]} onChange={onChange} />);

    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["b", "a"]);
  });
});
```

- [ ] **Step 16: Run the test to verify it fails, then create `SectorMultiSelect`**

Run: `pnpm --filter web test SectorMultiSelect -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/ui/SectorMultiSelect.tsx`:

```tsx
interface SectorMultiSelectProps {
  sectors: { id: string; name: string }[];
  selected: string[] | undefined; // undefined = implicitly "all"
  onChange: (selected: string[]) => void;
}

export function SectorMultiSelect({ sectors, selected, onChange }: SectorMultiSelectProps) {
  const effectiveSelected = selected ?? sectors.map((sector) => sector.id);

  const toggle = (id: string) => {
    const next = effectiveSelected.includes(id)
      ? effectiveSelected.filter((sectorId) => sectorId !== id)
      : [...effectiveSelected, id];
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-3">
      {sectors.map((sector) => (
        <label key={sector.id} className="flex items-center gap-1.5 text-label text-ink-2">
          <input type="checkbox" checked={effectiveSelected.includes(sector.id)} onChange={() => toggle(sector.id)} />
          {sector.name}
        </label>
      ))}
    </div>
  );
}
```

Run: `pnpm --filter web test SectorMultiSelect -- --run` — expected PASS.

- [ ] **Step 17: Wire the filter into `ManagerDashboardPage`**

In `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`, add state and the filter component. Add imports: `useState` from `"react"`, `useManagerSectors` and `SectorMultiSelect`. Add inside the component, before the `useManagerSignals()` call:

```tsx
  const sectorsQuery = useManagerSectors();
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[] | undefined>(undefined);
```

Change the existing `useManagerSignals()` call to `useManagerSignals(selectedSectorIds)`.

Add the filter UI right after the privacy-note paragraph (before the KPI grid), only once sectors have loaded:

```tsx
{sectorsQuery.data && sectorsQuery.data.length > 1 && (
  <div className="mt-3">
    <SectorMultiSelect sectors={sectorsQuery.data} selected={selectedSectorIds} onChange={setSelectedSectorIds} />
  </div>
)}
```

(Rendered only when there's more than one accessible sector — a `SECTOR_MANAGER` with exactly one sector has nothing to filter, and showing a single-item multiselect would be noise.)

Add a test to `ManagerDashboardPage.test.tsx`: mock `useManagerSectors`'s underlying use-case to return two sectors, render the page, assert both sector names appear, click one checkbox, and assert `useManagerSignals`'s underlying `getManagerSignalsUseCase.execute` is eventually called with a `sectorIds` array missing the unchecked one.

- [ ] **Step 18: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 19: Commit**

```bash
git add apps/api/src/modules/manager apps/web/src/ports/manager-signals.port.ts apps/web/src/infrastructure/http/http-manager-signals.adapter.ts \
        apps/web/src/use-cases/get-manager-signals.usecase.ts apps/web/src/use-cases/get-manager-signals.usecase.test.ts \
        apps/web/src/presentation/hooks/useManagerSignals.ts apps/web/src/ports/manager-sectors.port.ts \
        apps/web/src/infrastructure/http/http-manager-sectors.adapter.ts apps/web/src/use-cases/list-accessible-sectors.usecase.ts \
        apps/web/src/presentation/hooks/useManagerSectors.ts apps/web/src/presentation/ui/SectorMultiSelect.tsx \
        apps/web/src/presentation/ui/SectorMultiSelect.test.tsx apps/web/src/presentation/pages/ManagerDashboardPage.tsx \
        apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx apps/web/src/app/container.ts
git commit -m "feat: add sector-scoped dashboard filtering, server-resolved by manager role and assignment"
```

---

### Task 11: Public sectors endpoint + device-linking sector picker

**Files:**

- Modify: `apps/api/src/modules/institution/infrastructure/institution.controller.ts`
- Modify: `apps/api/src/modules/institution/infrastructure/institution.controller.test.ts`
- Modify: `apps/api/src/modules/institution/institution.module.ts`
- Modify: `apps/web/src/ports/institution-link.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-institution-link.adapter.ts`
- Create: `apps/web/src/use-cases/list-institution-sectors.usecase.ts`
- Create: `apps/web/src/presentation/hooks/useInstitutionSectors.ts`
- Modify: `apps/web/src/stores/institution-link.store.ts`
- Modify: `apps/web/src/stores/institution-link.store.test.ts`
- Modify: `apps/web/src/presentation/pages/LinkInstitutionPage.tsx`
- Modify: `apps/web/src/presentation/pages/LinkInstitutionPage.test.tsx`
- Modify: `apps/web/src/presentation/pages/YouPage.tsx`
- Modify: `apps/web/src/ports/signal-checkin.port.ts`
- Modify: `apps/web/src/use-cases/record-signal-checkin.usecase.ts`
- Modify: `apps/web/src/use-cases/record-signal-checkin.usecase.test.ts`
- Modify: `apps/web/src/presentation/hooks/useSubmitAssessment.ts`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Consumes: `SectorRepository.findActiveByInstitution` (Task 7).
- Produces: `GET /institutions/:id/sectors` (public, no auth); `useInstitutionLinkStore` now persists `sectorId`/`sectorName` instead of `department`.

- [ ] **Step 1: Write the failing test for the public sectors endpoint**

Add to `apps/api/src/modules/institution/infrastructure/institution.controller.test.ts` (this file's existing `by-code` tests stay as-is; add a `FakeSectorRepository` and wire `SECTOR_REPOSITORY` into its `Test.createTestingModule` providers, then add):

```ts
it("GET /institutions/:id/sectors returns only active sectors for that institution, no auth required", async () => {
  sectorRepository.activeByInstitution = { "institution-1": [{ id: "sector-1", name: "UTI" }] };

  const response = await request(app.getHttpServer()).get("/institutions/institution-1/sectors");

  expect(response.status).toBe(200);
  expect(response.body).toEqual([{ id: "sector-1", name: "UTI" }]);
});

it("GET /institutions/:id/sectors returns an empty array for an institution with none registered", async () => {
  sectorRepository.activeByInstitution = {};

  const response = await request(app.getHttpServer()).get("/institutions/institution-1/sectors");

  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
});
```

(`FakeSectorRepository` here only needs `findActiveByInstitution` implemented for real — every other `SectorRepository` method can throw `"not used in this test"`, matching the fake-repository convention established in Task 7/10.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test institution.controller -- --run`
Expected: FAIL — `GET /institutions/:id/sectors` doesn't exist yet.

- [ ] **Step 3: Extend `InstitutionController` and `InstitutionModule`**

Replace `apps/api/src/modules/institution/infrastructure/institution.controller.ts` in full:

```ts
import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { GetInstitutionByInviteCodeUseCase } from "../application/use-cases/get-institution-by-invite-code.use-case.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../sector/application/ports/sector-repository.port.ts";

@Controller("institutions")
export class InstitutionController {
  constructor(
    @Inject(GetInstitutionByInviteCodeUseCase)
    private readonly getInstitutionByInviteCode: GetInstitutionByInviteCodeUseCase,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  @Get("by-code/:code")
  async byCode(@Param("code") code: string): Promise<{ id: string; name: string }> {
    const institution = await this.getInstitutionByInviteCode.execute(code);
    if (!institution) {
      throw new NotFoundException();
    }
    return { id: institution.id, name: institution.name };
  }

  @Get(":id/sectors")
  async sectors(@Param("id") id: string): Promise<{ id: string; name: string }[]> {
    return this.sectorRepository.findActiveByInstitution(id);
  }
}
```

Replace `apps/api/src/modules/institution/institution.module.ts` in full:

```ts
import { Module } from "@nestjs/common";
import { InstitutionController } from "./infrastructure/institution.controller.ts";
import { GetInstitutionByInviteCodeUseCase } from "./application/use-cases/get-institution-by-invite-code.use-case.ts";
import { PrismaInstitutionRepository } from "./infrastructure/persistence/prisma-institution.repository.ts";
import { INSTITUTION_REPOSITORY } from "./application/ports/institution-repository.port.ts";
import { SectorModule } from "../sector/sector.module.ts";

@Module({
  imports: [SectorModule],
  controllers: [InstitutionController],
  providers: [
    GetInstitutionByInviteCodeUseCase,
    { provide: INSTITUTION_REPOSITORY, useClass: PrismaInstitutionRepository },
  ],
})
export class InstitutionModule {}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test institution.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 5: Frontend — extend the institution-link port and adapter**

Replace `apps/web/src/ports/institution-link.port.ts` in full:

```ts
import { z } from "zod";

export const InstitutionLookupResultSchema = z.object({ id: z.string(), name: z.string() });
export type InstitutionLookupResult = z.infer<typeof InstitutionLookupResultSchema>;

export const InstitutionSectorSchema = z.object({ id: z.string(), name: z.string() });
export type InstitutionSector = z.infer<typeof InstitutionSectorSchema>;

export class InstitutionNotFoundError extends Error {}

export interface InstitutionLinkPort {
  lookupByCode(code: string): Promise<InstitutionLookupResult>;
  listSectors(institutionId: string): Promise<InstitutionSector[]>;
}
```

Replace `apps/web/src/infrastructure/http/http-institution-link.adapter.ts` in full:

```ts
import { z } from "zod";
import type { InstitutionLinkPort, InstitutionLookupResult, InstitutionSector } from "@/ports/institution-link.port";
import { InstitutionLookupResultSchema, InstitutionNotFoundError, InstitutionSectorSchema } from "@/ports/institution-link.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpInstitutionLinkAdapter implements InstitutionLinkPort {
  async lookupByCode(code: string): Promise<InstitutionLookupResult> {
    const response = await fetch(`${API_BASE_URL}/institutions/by-code/${encodeURIComponent(code)}`);

    if (response.status === 404) {
      throw new InstitutionNotFoundError();
    }
    if (!response.ok) {
      throw new Error(`institution lookup failed with status ${response.status}`);
    }

    return InstitutionLookupResultSchema.parse(await response.json());
  }

  async listSectors(institutionId: string): Promise<InstitutionSector[]> {
    const response = await fetch(`${API_BASE_URL}/institutions/${encodeURIComponent(institutionId)}/sectors`);

    if (!response.ok) {
      throw new Error(`institution sectors lookup failed with status ${response.status}`);
    }

    return z.array(InstitutionSectorSchema).parse(await response.json());
  }
}
```

Create `apps/web/src/use-cases/list-institution-sectors.usecase.ts`:

```ts
import type { InstitutionLinkPort, InstitutionSector } from "@/ports/institution-link.port";

export class ListInstitutionSectorsUseCase {
  constructor(private readonly institutionLinkPort: InstitutionLinkPort) {}

  async execute(institutionId: string): Promise<InstitutionSector[]> {
    return this.institutionLinkPort.listSectors(institutionId);
  }
}
```

In `apps/web/src/app/container.ts`, add:

```ts
import { ListInstitutionSectorsUseCase } from "@/use-cases/list-institution-sectors.usecase";

export const listInstitutionSectorsUseCase = new ListInstitutionSectorsUseCase(new HttpInstitutionLinkAdapter());
```

(Reuses the same `HttpInstitutionLinkAdapter` instance pattern as `lookupInstitutionUseCase` — a fresh instance per export, matching this file's existing convention of not sharing adapter instances across use-cases.)

Create `apps/web/src/presentation/hooks/useInstitutionSectors.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listInstitutionSectorsUseCase } from "@/app/container";

export function useInstitutionSectors(institutionId: string | null) {
  return useQuery({
    queryKey: ["institution-sectors", institutionId],
    queryFn: () => listInstitutionSectorsUseCase.execute(institutionId!),
    enabled: institutionId !== null,
  });
}
```

- [ ] **Step 6: Update the institution-link store**

Replace `apps/web/src/stores/institution-link.store.test.ts`'s calls to `link({ institutionId, institutionName, department })` with `link({ institutionId, institutionName, sectorId, sectorName })`, and any assertion reading `.department` to read `.sectorId`/`.sectorName` instead (same test count and structure, just the field renamed/split).

Replace `apps/web/src/stores/institution-link.store.ts` in full:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface InstitutionLinkState {
  institutionId: string | null;
  institutionName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  deviceSignalId: string | null;
  link: (params: { institutionId: string; institutionName: string; sectorId: string; sectorName: string }) => void;
  unlink: () => void;
}

export const useInstitutionLinkStore = create<InstitutionLinkState>()(
  persist(
    (set) => ({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
      link: ({ institutionId, institutionName, sectorId, sectorName }) =>
        set({ institutionId, institutionName, sectorId, sectorName, deviceSignalId: crypto.randomUUID() }),
      unlink: () => set({ institutionId: null, institutionName: null, sectorId: null, sectorName: null, deviceSignalId: null }),
    }),
    { name: "zelo.institution-link", storage: createJSONStorage(() => localStorage) },
  ),
);
```

- [ ] **Step 7: Update `LinkInstitutionPage`**

Replace `apps/web/src/presentation/pages/LinkInstitutionPage.test.tsx`'s department-step tests: instead of typing into a `department` text input, the tests now mock `useInstitutionSectors`'s underlying use-case (`listInstitutionSectorsUseCase.execute`) to resolve a list of sectors, then click a radio option and submit; add one new test asserting that an empty sector list renders the "ainda não cadastrou os setores" message and disables/hides the submit control. (Mirror this file's existing mocking convention — `vi.spyOn` on the relevant `* as container` export — rather than inventing a new test utility.)

Replace `apps/web/src/presentation/pages/LinkInstitutionPage.tsx` in full:

```tsx
import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useLookupInstitution } from "@/presentation/hooks/useLookupInstitution";
import { useInstitutionSectors } from "@/presentation/hooks/useInstitutionSectors";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

export function LinkInstitutionPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"code" | "sector">("code");
  const [code, setCode] = useState("");
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [institution, setInstitution] = useState<{ id: string; name: string } | null>(null);
  const lookup = useLookupInstitution();
  const sectors = useInstitutionSectors(institution?.id ?? null);
  const link = useInstitutionLinkStore((state) => state.link);

  const handleCodeSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    lookup.mutate(code.trim(), {
      onSuccess: (result) => {
        setInstitution(result);
        setStep("sector");
      },
    });
  };

  const handleSectorSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!institution || !sectorId) return;
    const sector = sectors.data?.find((candidate) => candidate.id === sectorId);
    if (!sector) return;
    link({ institutionId: institution.id, institutionName: institution.name, sectorId: sector.id, sectorName: sector.name });
    navigate(routes.you);
  };

  const errorMessage = lookup.isError
    ? lookup.error instanceof InstitutionNotFoundError
      ? "Código não encontrado."
      : "Não foi possível verificar agora. Tente novamente."
    : null;

  if (step === "sector" && institution) {
    const hasSectors = (sectors.data?.length ?? 0) > 0;

    return (
      <PhoneShell centered>
        <div className="pt-[30px]">
          <BackButton label="Voltar" onClick={() => setStep("code")} />
          <h1 className="mb-[6px] mt-4 text-h1 text-ink">Qual seu setor?</h1>
          <p className="text-caption text-muted">Vinculando a {institution.name}.</p>

          <form onSubmit={handleSectorSubmit}>
            <Card className="mt-5">
              {sectors.isLoading && <p className="text-label text-muted">Carregando setores...</p>}
              {!sectors.isLoading && !hasSectors && (
                <p role="alert" className="text-label text-danger">
                  Seu hospital ainda não cadastrou os setores.
                </p>
              )}
              {!sectors.isLoading &&
                hasSectors &&
                sectors.data!.map((sector) => (
                  <label key={sector.id} className="flex items-center gap-2 py-2 text-label text-ink-2">
                    <input
                      type="radio"
                      name="sector"
                      value={sector.id}
                      checked={sectorId === sector.id}
                      onChange={() => setSectorId(sector.id)}
                    />
                    {sector.name}
                  </label>
                ))}
            </Card>

            <div className="mt-[24px]">
              <Button type="submit" variant="primary" disabled={!hasSectors || sectorId === null}>
                Concluir
              </Button>
            </div>
          </form>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell centered>
      <div className="pt-[30px]">
        <BackButton label="Você" onClick={() => navigate(routes.you)} />
        <h1 className="mb-[6px] mt-4 text-h1 text-ink">Vincular ao hospital</h1>
        <p className="text-caption text-muted">
          Digite o código do seu hospital para aparecer nos números do seu time.
        </p>

        <form onSubmit={handleCodeSubmit}>
          <Card className="mt-5">
            <label htmlFor="invite-code" className="text-label font-semibold text-ink-2">
              Código do hospital
            </label>
            <input
              id="invite-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Digite o código"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            {errorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-[24px]">
            <Button type="submit" variant="primary" loading={lookup.isPending} disabled={code.trim().length === 0}>
              Continuar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
```

Run: `pnpm --filter web test LinkInstitutionPage institution-link.store -- --run` — expected PASS.

- [ ] **Step 8: Update `YouPage`, the check-in port/use-case, and `useSubmitAssessment`**

In `apps/web/src/presentation/pages/YouPage.tsx`, replace `const department = useInstitutionLinkStore((state) => state.department);` with `const sectorName = useInstitutionLinkStore((state) => state.sectorName);` and the JSX line `<p className="text-caption text-muted">{department}</p>` with `<p className="text-caption text-muted">{sectorName}</p>`.

Replace `apps/web/src/ports/signal-checkin.port.ts` in full:

```ts
export interface SignalCheckinParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
  concerning: boolean;
}

export interface SignalCheckinPort {
  checkin(params: SignalCheckinParams): Promise<void>;
}
```

Replace `apps/web/src/use-cases/record-signal-checkin.usecase.ts` in full:

```ts
import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface RecordSignalCheckinInput {
  link: InstitutionLinkSnapshot | null;
  concerning: boolean;
}

export class RecordSignalCheckinUseCase {
  constructor(private readonly checkinPort: SignalCheckinPort) {}

  async execute({ link, concerning }: RecordSignalCheckinInput): Promise<void> {
    if (link === null) return;

    await this.checkinPort.checkin({
      institutionId: link.institutionId,
      sectorId: link.sectorId,
      deviceSignalId: link.deviceSignalId,
      concerning,
    });
  }
}
```

In `apps/web/src/use-cases/record-signal-checkin.usecase.test.ts`, replace every `department: "..."` field (both in `InstitutionLinkSnapshot` fixtures and in the assertions on what `checkinPort.checkin` was called with) with `sectorId: "..."` — same test count and structure, field renamed.

Replace the destructure and call site in `apps/web/src/presentation/hooks/useSubmitAssessment.ts`:

```ts
      const { institutionId, sectorId, deviceSignalId } = useInstitutionLinkStore.getState();
      if (institutionId !== null && sectorId !== null && deviceSignalId !== null) {
        void recordSignalCheckinUseCase
          .execute({
            link: { institutionId, sectorId, deviceSignalId },
            concerning: isConcerningScore(result.totalScore),
          })
          .catch(() => {});
      }
```

(Only these two lines change — the rest of the file, including the surrounding `useMutation`/comment, is unchanged.)

- [ ] **Step 9: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/institution apps/web/src/ports/institution-link.port.ts apps/web/src/infrastructure/http/http-institution-link.adapter.ts \
        apps/web/src/use-cases/list-institution-sectors.usecase.ts apps/web/src/presentation/hooks/useInstitutionSectors.ts \
        apps/web/src/stores/institution-link.store.ts apps/web/src/stores/institution-link.store.test.ts \
        apps/web/src/presentation/pages/LinkInstitutionPage.tsx apps/web/src/presentation/pages/LinkInstitutionPage.test.tsx \
        apps/web/src/presentation/pages/YouPage.tsx apps/web/src/ports/signal-checkin.port.ts \
        apps/web/src/use-cases/record-signal-checkin.usecase.ts apps/web/src/use-cases/record-signal-checkin.usecase.test.ts \
        apps/web/src/presentation/hooks/useSubmitAssessment.ts apps/web/src/app/container.ts
git commit -m "feat: replace free-text department with a registered-sector picker in the device-linking flow"
```

---

### Task 12: Seed data + docs — closes the compile gap left open since Task 1

**Files:**

- Modify: `apps/api/prisma/seed-data.ts`
- Modify: `apps/api/prisma/seed-data.test.ts` (if it exists — check first; update any assertion reading `.department` on a built row)
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/prisma/README.md`

**Interfaces:**

- Consumes: `Sector`, `SuperAdmin`, `Manager.role` (Task 1); `AdminPasswordService` (Task 4).
- Produces: nothing consumed by other tasks — this is the last task in the plan, and it closes the `pnpm --filter @zelo/api exec tsc --noEmit` gap Task 1 Step 6 flagged as expected-until-now.

- [ ] **Step 1: Update `seed-data.ts`**

In `apps/api/prisma/seed-data.ts`:

Rename `SimulatedSignalSeedRow` to `SignalSeedRow` with `sectorName` replacing `department`:

```ts
export interface SignalSeedRow {
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}
```

Rename `SignalScenario.department` to `SignalScenario.sectorName`:

```ts
export interface SignalScenario {
  sectorName: string;
  checkIns: number;
  concerning: number[];
}
```

Update `ZELO_DEMO_SCENARIOS` and `SAO_LUCAS_DEMO_SCENARIOS` to use `sectorName` (same values, field renamed):

```ts
export const ZELO_DEMO_SCENARIOS: SignalScenario[] = [
  { sectorName: "Pronto-socorro", checkIns: 24, concerning: [9, 9, 9, 9, 9, 9] },
  { sectorName: "Plantão noturno", checkIns: 18, concerning: [9, 9, 9, 9, 9, 9] },
  { sectorName: "UTI", checkIns: 10, concerning: [3, 4, 4, 5, 6, 6] },
  { sectorName: "Ambulatório", checkIns: 3, concerning: [1, 1, 1, 1, 1, 1] },
];

export const SAO_LUCAS_DEMO_SCENARIOS: SignalScenario[] = [
  { sectorName: "UTI", checkIns: 8, concerning: [1, 1, 1, 1, 2, 2] },
];
```

Update `buildSeedRows`'s return type and the one field it constructs (`department: scenario.department` → `sectorName: scenario.sectorName`):

```ts
export function buildSeedRows(referenceDate: Date, scenarios: SignalScenario[]): SignalSeedRow[] {
  const currentWeekStart = startOfIsoWeek(referenceDate);
  const rows: SignalSeedRow[] = [];

  for (const scenario of scenarios) {
    for (let i = 0; i < WEEKS_TO_SEED; i++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - (WEEKS_TO_SEED - 1 - i) * 7);
      rows.push({
        sectorName: scenario.sectorName,
        weekStart,
        checkIns: scenario.checkIns,
        concerning: scenario.concerning[i]!,
      });
    }
  }

  return rows;
}
```

Add, after `InstitutionSeedRow`/`INSTITUTION_SEED_ROSTER`:

```ts
export interface SectorSeedRow {
  institutionName: string;
  name: string;
}

// Every sector name referenced by ZELO_DEMO_SCENARIOS/SAO_LUCAS_DEMO_SCENARIOS above MUST
// have a matching entry here — seed.ts resolves each Signal seed row's sectorName to a real
// Sector id via this roster, and throws if one is missing (see seed.ts's sectorId() helper).
export const SECTOR_SEED_ROSTER: SectorSeedRow[] = [
  { institutionName: "Zelo Demo", name: "Pronto-socorro" },
  { institutionName: "Zelo Demo", name: "Plantão noturno" },
  { institutionName: "Zelo Demo", name: "UTI" },
  { institutionName: "Zelo Demo", name: "Ambulatório" },
  { institutionName: "Hospital São Lucas (Demo)", name: "UTI" },
];
```

Update `ManagerSeedRow` to add `role` and optional `sectorNames`, and add a `SECTOR_MANAGER` demo entry to `MANAGER_SEED_ROSTER` (this is the design's own "Paulo/UTI" persona example, made real in the seed data so the new permission model is visibly demoable, not just testable):

```ts
import type { ManagerRole } from "../src/modules/manager/application/ports/manager-repository.port.ts";

export interface ManagerSeedRow {
  name: string;
  password: string;
  passwordEnvVar: string;
  institutionName: string;
  role: ManagerRole;
  sectorNames?: string[]; // required in practice when role is SECTOR_MANAGER; ignored for HOSPITAL_ADMIN
}

export const MANAGER_SEED_ROSTER: ManagerSeedRow[] = [
  { name: "Ana Konder", password: "zelo-ana-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_ANA", institutionName: "Zelo Demo", role: "HOSPITAL_ADMIN" },
  { name: "Carlos Mendes", password: "zelo-carlos-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_CARLOS", institutionName: "Zelo Demo", role: "HOSPITAL_ADMIN" },
  { name: "Paulo Reis", password: "zelo-paulo-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_PAULO", institutionName: "Zelo Demo", role: "SECTOR_MANAGER", sectorNames: ["UTI"] },
  { name: "Beatriz Lima", password: "zelo-beatriz-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_BEATRIZ", institutionName: "Hospital São Lucas (Demo)", role: "HOSPITAL_ADMIN" },
];
```

Add, at the end of the file:

```ts
export interface SuperAdminSeedRow {
  name: string;
  password: string;
  passwordEnvVar: string;
}

// Bootstraps the one seed-created platform super-admin account. Like MANAGER_SEED_ROSTER,
// passwordEnvVar overrides the committed plaintext password when set — see seed.ts.
export const SUPER_ADMIN_SEED_ROSTER: SuperAdminSeedRow[] = [
  { name: "Zelo Ops", password: "zelo-ops-2026", passwordEnvVar: "SUPER_ADMIN_SEED_PASSWORD" },
];
```

- [ ] **Step 2: Check for and update `seed-data.test.ts`**

Run: `ls apps/api/prisma/seed-data.test.ts 2>/dev/null || echo "no such file"` — if it exists, update any assertion that reads `.department` off a `buildSeedRows(...)` result to read `.sectorName` instead (same values, field renamed); if it doesn't exist, skip this step.

- [ ] **Step 3: Update `seed.ts`**

Replace `apps/api/prisma/seed.ts` in full:

```ts
import { PrismaService } from "../src/shared/prisma/prisma.service.ts";
import { ManagerPasswordService } from "../src/modules/manager/application/services/manager-password.service.ts";
import { AdminPasswordService } from "../src/modules/admin/application/services/admin-password.service.ts";
import {
  buildFollowUpSeedRows,
  buildSeedRows,
  INSTITUTION_SEED_ROSTER,
  MANAGER_SEED_ROSTER,
  SECTOR_SEED_ROSTER,
  SUPER_ADMIN_SEED_ROSTER,
  SAO_LUCAS_DEMO_SCENARIOS,
  ZELO_DEMO_SCENARIOS,
} from "./seed-data.ts";

async function main() {
  const prisma = new PrismaService();
  const managerPasswordService = new ManagerPasswordService();
  const adminPasswordService = new AdminPasswordService();
  const followUpRows = buildFollowUpSeedRows(new Date());

  const institutionsByName = new Map<string, { id: string; name: string }>();
  for (const institution of INSTITUTION_SEED_ROSTER) {
    const row = await prisma.institution.upsert({
      where: { name: institution.name },
      update: {},
      create: { name: institution.name, inviteCode: institution.inviteCode },
    });
    institutionsByName.set(row.name, row);
  }

  const zeloDemo = institutionsByName.get("Zelo Demo")!;
  const saoLucasDemo = institutionsByName.get("Hospital São Lucas (Demo)")!;

  const sectorsByInstitutionAndName = new Map<string, { id: string; name: string }>();
  for (const sector of SECTOR_SEED_ROSTER) {
    const institution = institutionsByName.get(sector.institutionName);
    if (!institution) {
      throw new Error(`SECTOR_SEED_ROSTER entry "${sector.name}" references unknown institution "${sector.institutionName}"`);
    }
    const row = await prisma.sector.upsert({
      where: { institutionId_name: { institutionId: institution.id, name: sector.name } },
      update: {},
      create: { institutionId: institution.id, name: sector.name },
    });
    sectorsByInstitutionAndName.set(`${institution.id}:${sector.name}`, { id: row.id, name: row.name });
  }

  function sectorId(institutionId: string, sectorName: string): string {
    const sector = sectorsByInstitutionAndName.get(`${institutionId}:${sectorName}`);
    if (!sector) {
      throw new Error(
        `Signal seed row references sector "${sectorName}" not present in SECTOR_SEED_ROSTER for institution ${institutionId}`,
      );
    }
    return sector.id;
  }

  await prisma.signal.deleteMany({ where: { institutionId: zeloDemo.id } });
  await prisma.signal.createMany({
    data: buildSeedRows(new Date(), ZELO_DEMO_SCENARIOS).map((row) => ({
      institutionId: zeloDemo.id,
      sectorId: sectorId(zeloDemo.id, row.sectorName),
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    })),
  });

  await prisma.signal.deleteMany({ where: { institutionId: saoLucasDemo.id } });
  await prisma.signal.createMany({
    data: buildSeedRows(new Date(), SAO_LUCAS_DEMO_SCENARIOS).map((row) => ({
      institutionId: saoLucasDemo.id,
      sectorId: sectorId(saoLucasDemo.id, row.sectorName),
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    })),
  });

  await prisma.simulatedFollowUp.deleteMany();
  await prisma.simulatedFollowUp.createMany({ data: followUpRows });

  const managersByName = new Map<string, { id: string; name: string }>();
  for (const manager of MANAGER_SEED_ROSTER) {
    const institution = institutionsByName.get(manager.institutionName);
    if (!institution) {
      throw new Error(`MANAGER_SEED_ROSTER entry "${manager.name}" references unknown institution "${manager.institutionName}"`);
    }
    const password = process.env[manager.passwordEnvVar] ?? manager.password;
    const passwordHash = await managerPasswordService.hash(password);
    const row = await prisma.manager.upsert({
      where: { name: manager.name },
      update: {},
      create: { name: manager.name, passwordHash, institutionId: institution.id, role: manager.role },
    });
    managersByName.set(row.name, { id: row.id, name: row.name });
  }

  for (const manager of MANAGER_SEED_ROSTER) {
    if (manager.role !== "SECTOR_MANAGER" || !manager.sectorNames) continue;
    const institution = institutionsByName.get(manager.institutionName)!;
    const managerRow = managersByName.get(manager.name)!;
    for (const sectorName of manager.sectorNames) {
      await prisma.sector.update({
        where: { id: sectorId(institution.id, sectorName) },
        data: { managerId: managerRow.id },
      });
    }
  }

  for (const admin of SUPER_ADMIN_SEED_ROSTER) {
    const password = process.env[admin.passwordEnvVar] ?? admin.password;
    const passwordHash = await adminPasswordService.hash(password);
    await prisma.superAdmin.upsert({
      where: { name: admin.name },
      update: {},
      create: { name: admin.name, passwordHash },
    });
  }

  console.log(
    `Seeded ${INSTITUTION_SEED_ROSTER.length} Institution rows, ${SECTOR_SEED_ROSTER.length} Sector rows, Signal rows for each institution, ${followUpRows.length} SimulatedFollowUp rows, ${MANAGER_SEED_ROSTER.length} Manager accounts, and ${SUPER_ADMIN_SEED_ROSTER.length} SuperAdmin account(s).`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Run `tsc` to verify the last expected gap is closed**

Run: `pnpm --filter @zelo/api exec tsc --noEmit`
Expected: no errors — this closes the gap Task 1 Step 6 opened and every task since has chipped away at.

- [ ] **Step 5: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS (every test in the module).

- [ ] **Step 6: Seed the local database and spot-check**

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm --filter @zelo/api exec tsx prisma/seed.ts
```

Then:

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "SELECT name, role FROM managers ORDER BY name;"
docker exec zelo-postgres psql -U zelo -d zelo -c "SELECT s.name, m.name AS manager FROM sectors s LEFT JOIN managers m ON m.id = s.\"managerId\" ORDER BY s.name;"
docker exec zelo-postgres psql -U zelo -d zelo -c "SELECT name FROM super_admins;"
```

Expected: `managers` shows Ana Konder/Carlos Mendes/Beatriz Lima as `HOSPITAL_ADMIN` and Paulo Reis as `SECTOR_MANAGER`; `sectors` shows `UTI` (Zelo Demo) assigned to Paulo Reis and every other sector unassigned; `super_admins` shows `Zelo Ops`.

- [ ] **Step 7: Update `apps/api/prisma/README.md`**

Add a new section after "## Seeding two institutions" and before "## Seeding simulated manager-dashboard data":

```markdown
## Seeding sectors

The same `prisma:seed` run upserts `SECTOR_SEED_ROSTER` (in `seed-data.ts`) — one `Sector`
row per entry, keyed by the unique `(institutionId, name)` pair. Every sector name referenced
by `ZELO_DEMO_SCENARIOS`/`SAO_LUCAS_DEMO_SCENARIOS` (below) must have a matching roster entry
here, or `seed.ts`'s `sectorId()` helper throws — the `Signal` rows those scenarios produce
now carry a `sectorId` foreign key, not a free-text department string, so a seed scenario
referencing an unregistered sector name is a seed-data bug, not a silently-accepted string.
```

Update the "**Seed scenario for ...**" tables' `Department` column header to `Sector` in both places (values unchanged — same names, just no longer free text under the hood).

Update the "## Seeding manager accounts" section's table to add the new row and a `Role` column:

```markdown
| Name | Institution | Role | Password | Override env var |
|---|---|---|---|---|
| Ana Konder | Zelo Demo | Gestora do hospital | zelo-ana-2026 | `MANAGER_SEED_PASSWORD_ANA` |
| Carlos Mendes | Zelo Demo | Gestor do hospital | zelo-carlos-2026 | `MANAGER_SEED_PASSWORD_CARLOS` |
| Paulo Reis | Zelo Demo | Gestor de setor (UTI) | zelo-paulo-2026 | `MANAGER_SEED_PASSWORD_PAULO` |
| Beatriz Lima | Hospital São Lucas (Demo) | Gestora do hospital | zelo-beatriz-2026 | `MANAGER_SEED_PASSWORD_BEATRIZ` |
```

Add a new section at the end, before "## Re-seeding before a live demo":

```markdown
## Seeding the platform super-admin account

The same `prisma:seed` run also upserts `SUPER_ADMIN_SEED_ROSTER` (in `seed-data.ts`) into
the `super_admins` table — the one platform-level account that can log in at `/admin/login`
and create new institutions (`POST /admin/institutions`). There is no self-service super-admin
signup anywhere in the app; new super-admin accounts are added the same way new managers are:
add an entry to `SUPER_ADMIN_SEED_ROSTER` and re-run the seed.

| Name | Password | Override env var |
|---|---|---|
| Zelo Ops | zelo-ops-2026 | `SUPER_ADMIN_SEED_PASSWORD` |

Same plaintext-is-intentional caveat as the manager roster above: set `SUPER_ADMIN_SEED_PASSWORD`
to a real secret before seeding a real deployment.
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/seed-data.ts apps/api/prisma/seed.ts apps/api/prisma/README.md
git commit -m "feat(api): seed Sector rows, a SECTOR_MANAGER demo manager, and the platform super-admin account"
```

---

## Plan complete

At this point: a platform super-admin can log in and create new institutions with their first hospital-admin manager; a hospital admin can register sectors and create/deactivate other managers, scoping each to specific sectors; the manager dashboard filters by sector, resolved server-side by role; and a médico linking their device picks from their hospital's registered sectors instead of typing free text. Every piece is covered by its own task's tests, and Task 12 closes the one compile gap intentionally left open since Task 1.

Follow-up spec (not in this plan): anonymous peer-doctor chat, which builds on the hospital-admin role this plan introduces to register peer-partner doctors.
