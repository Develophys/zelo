# Institution Model and Manager Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `Institution` model, give `Manager` and `ManagerInsight` an `institutionId`, rename `SimulatedSignal` to `Signal` with an `institutionId`, and scope every manager-facing query by the authenticated manager's institution — so a manager from one hospital can never see another hospital's signals or insight history.

**Architecture:** `Institution` becomes the tenant boundary. `Manager` gains a required `institutionId` FK; the login flow embeds it in the signed session token (`ManagerTokenService`) alongside the existing `managerId`/`managerName`; `ManagerAuthGuard` decodes it onto `request.manager`; `ManagerController` forwards it into every use case. `GetManagerSignalsUseCase` and `GetManagerInsightHistoryUseCase` receive `institutionId` and the repositories filter by it in the database query — the k-anonymity threshold (`K_ANONYMITY_THRESHOLD`) keeps working unmodified because the use case only ever sees rows already scoped to one institution. `SimulatedSignal` is renamed `Signal` (port/adapter/DI token renamed to match) because "simulated" stops being universally true once a second, real institution exists — this plan does not yet make it non-simulated (that's a follow-up plan), it just gives the model and its supporting code an honest name ahead of that work. This plan is backend-only and touches no frontend code — the manager dashboard's HTTP response shapes are unchanged, only which rows populate them.

**Tech Stack:** NestJS + Prisma (backend), Vitest + supertest, Node `crypto` (existing HMAC token signing, unchanged).

## Global Constraints

- Every manager belongs to exactly one institution — no multi-institution managers, no role/permission distinction between managers within an institution (unchanged from `2026-08-01-manager-individual-accounts-design.md`).
- `institutionId` is carried inside the signed session token payload (JSON, HMAC-signed) — never trust a client-supplied `institutionId` from a request body or query param anywhere in this plan.
- The `Signal` table (renamed from `SimulatedSignal`) holds only aggregate counters, never a per-person row — this plan does not change that property, it only adds `institutionId` to the existing counter shape.
- `Manager.institutionId` and `ManagerInsight.institutionId` are backfilled onto **existing production rows** during the migration itself (not left nullable, not deferred to the seed script) — the seed script runs after `prisma migrate deploy` in production and cannot be relied on to run before other code touches those rows. `Signal` (renamed from `SimulatedSignal`) does not need backfill — its data is demo-only and disposable, so the migration drops and recreates that table instead.
- The migration backfills existing `managers`/`manager_insights` rows onto a hardcoded "Zelo Demo" institution (`id = 'demo-institution'`, `name = 'Zelo Demo'`, `inviteCode = 'zelo-demo-2026'`). The seed script's institution upsert must key on that same `name` so re-seeding never creates a duplicate institution.
- No frontend changes in this plan. `ManagerSignalsResponse` and the manager-insights-history response shape are unchanged; institution scoping happens entirely server-side based on the authenticated manager's own token.
- Every new/renamed file follows the exact conventions already in this module: kebab-case files with role suffixes (`*.use-case.ts`, `*.port.ts`, `*.repository.ts`, `*.service.ts`, `*.guard.ts`, `*.controller.ts`), PascalCase classes, DI tokens as `Symbol("SCREAMING_SNAKE_NAME")` exported alongside the port interface, tests co-located as `*.test.ts`, explicit `.ts` import extensions (ESM).
- Thin Prisma-passthrough repositories are not unit-tested individually (existing convention) — they're exercised indirectly through the controller's integration tests.

---

### Task 1: Prisma schema — `Institution`, `Manager.institutionId`, `ManagerInsight.institutionId`, `Signal` (renamed from `SimulatedSignal`)

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_institution_scoping/migration.sql` (hand-edited after `--create-only` — see Step 2, this is the one migration in this codebase so far that needs hand-written backfill SQL, because it's the first to add a required column to tables that already hold real production rows)

**Interfaces:**

- Produces (used by every later task): Prisma models `Institution { id, name (unique), inviteCode (unique), createdAt }`; `Manager.institutionId` (required, FK to `Institution`); `ManagerInsight.institutionId` (required, FK to `Institution`); `Signal { id, institutionId (FK), department, weekStart, checkIns, concerning, createdAt }` with `@@unique([institutionId, department, weekStart])`, replacing `SimulatedSignal`.

- [ ] **Step 1: Update the schema**

In `apps/api/prisma/schema.prisma`, replace the `SimulatedSignal` and `Manager` models and add to `ManagerInsight`:

```prisma
model Institution {
  id         String   @id @default(cuid())
  name       String   @unique
  inviteCode String   @unique
  createdAt  DateTime @default(now())

  managers        Manager[]
  managerInsights ManagerInsight[]
  signals         Signal[]

  @@map("institutions")
}

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

Change `ManagerInsight` to add the same relation:

```prisma
model ManagerInsight {
  id                   String      @id @default(cuid())
  interpretation       String
  suggestedActions     String[]
  summary              String
  generatedAt          DateTime    @default(now())
  createdByManagerName String?
  institutionId        String
  institution          Institution @relation(fields: [institutionId], references: [id])

  @@map("manager_insights")
}
```

Delete the old `SimulatedSignal` model block entirely (replaced by `Signal` above).

- [ ] **Step 2: Generate a migration skeleton without applying it**

Local Postgres must be running:

```bash
docker compose -f docker/docker-compose.yml up -d postgres
```

From `apps/api/`:

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate dev --create-only --name add_institution_scoping
```

This creates `apps/api/prisma/migrations/<timestamp>_add_institution_scoping/migration.sql` with Prisma's auto-generated diff, but does not apply it yet — expected, because the auto-generated SQL doesn't know how to backfill existing rows and will drop/recreate tables where it can't infer a rename. The next step replaces its content entirely.

- [ ] **Step 3: Replace the migration file's content by hand**

Open the generated `migration.sql` and replace its entire content with:

```sql
-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "institutions_name_key" ON "institutions"("name");
CREATE UNIQUE INDEX "institutions_inviteCode_key" ON "institutions"("inviteCode");

-- Seed a default institution so existing managers/manager_insights rows have
-- something to backfill onto. seed.ts's institution upsert (keyed on `name`)
-- finds this same row on every future run — it never duplicates it.
INSERT INTO "institutions" ("id", "name", "inviteCode", "createdAt")
VALUES ('demo-institution', 'Zelo Demo', 'zelo-demo-2026', CURRENT_TIMESTAMP);

-- AlterTable managers: add nullable, backfill existing rows, then enforce NOT NULL
ALTER TABLE "managers" ADD COLUMN "institutionId" TEXT;
UPDATE "managers" SET "institutionId" = 'demo-institution' WHERE "institutionId" IS NULL;
ALTER TABLE "managers" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "managers" ADD CONSTRAINT "managers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable manager_insights: same pattern
ALTER TABLE "manager_insights" ADD COLUMN "institutionId" TEXT;
UPDATE "manager_insights" SET "institutionId" = 'demo-institution' WHERE "institutionId" IS NULL;
ALTER TABLE "manager_insights" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "manager_insights" ADD CONSTRAINT "manager_insights_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable simulated_signals (demo-only, disposable data — re-seeded after this migration)
DROP TABLE "simulated_signals";

-- CreateTable signals (replaces simulated_signals, adds institutionId)
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "checkIns" INTEGER NOT NULL DEFAULT 0,
    "concerning" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "signals_institutionId_department_weekStart_key" ON "signals"("institutionId", "department", "weekStart");
ALTER TABLE "signals" ADD CONSTRAINT "signals_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate dev
```

Expected: Prisma detects the already-written migration file, applies it, and regenerates the client (`apps/api/generated/prisma`) — no new migration is created.

- [ ] **Step 5: Verify the backfill against local data**

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "SELECT name, \"institutionId\" FROM managers;"
```

Expected: every existing manager row (e.g. `Ana Konder`, `Carlos Mendes`, if this database was previously seeded) shows `institutionId = demo-institution`. If the local database has never been seeded, this returns zero rows, which is also fine.

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "\dt"
```

Expected output includes `institutions` and `signals`, and no longer includes `simulated_signals`.

- [ ] **Step 6: Verify the client compiles against every existing usage**

```bash
pnpm --filter @zelo/api exec tsc --noEmit
```

Expected: FAILS at this point, in several places — this is expected, and Tasks 2–7 fix every one of them:
- `prisma.simulatedSignal` no longer exists (`simulated-signal-repository.port.ts`, `prisma-simulated-signal.repository.ts`, `get-manager-signals.use-case.ts` and its test) — fixed by Task 2.
- `prisma.manager.upsert`'s `create` payload is now missing the required `institutionId` (`seed.ts`) — fixed by Task 7.
- `prisma.managerInsight.create`'s `data: entry` no longer satisfies the generated input type because `entry` is missing `institutionId` (`prisma-manager-insight.repository.ts`) — fixed by Task 5.
- `manager.controller.test.ts` and `manager.module.ts` reference the old `SIMULATED_SIGNAL_REPOSITORY` token — fixed by Task 6.

Skim the full error list once and confirm every error's file is one of the five above (or a test file for one of them) — if `tsc` reports an error in a file none of Tasks 2–7 touch, stop and investigate before continuing.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add Institution model, institutionId on Manager/ManagerInsight, rename SimulatedSignal to Signal"
```

---

### Task 2: Rename the signal repository port/adapter and scope it by institution

**Files:**

- Create: `apps/api/src/modules/manager/application/ports/signal-repository.port.ts` (replaces `simulated-signal-repository.port.ts`)
- Delete: `apps/api/src/modules/manager/application/ports/simulated-signal-repository.port.ts`
- Create: `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts` (replaces `prisma-simulated-signal.repository.ts`)
- Delete: `apps/api/src/modules/manager/infrastructure/persistence/prisma-simulated-signal.repository.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`

**Interfaces:**

- Consumes: `Signal` Prisma model (Task 1).
- Produces (used by Task 6, 7): `SignalRepository` port (`findAll(institutionId: string): Promise<SignalRow[]>`), `SIGNAL_REPOSITORY` DI token, `PrismaSignalRepository` class, `GetManagerSignalsUseCase.execute(institutionId: string)`.

- [ ] **Step 1: Write the failing test (update the existing file)**

Replace `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts` in full — every `execute()` call gains an `institutionId` argument, `SimulatedSignalRepository`/`SimulatedSignalRow` are renamed to `SignalRepository`/`SignalRow`, and one new test asserts the repository is called with the institution id the use case was given:

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

  it("computes segments from the most recent week only, excluding departments under k=5", async () => {
    const repository = new FakeSignalRepository([
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { department: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
      { department: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
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

  it("computes overallConcerningRate from only the visible departments' most recent week", async () => {
    const repository = new FakeSignalRepository([
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.overallConcerningRate).toBe(0.5); // (6+4)/(10+10), C excluded
  });

  it("computes weeklyTrend and checkInsLast4Weeks as org-wide sums including the suppressed department", async () => {
    const repository = new FakeSignalRepository([
      { department: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.weeklyTrend).toEqual([
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.375 }, // (3+4+2)/(10+10+4)
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5 }, // (6+4+2)/(10+10+4)
    ]);
    expect(result.checkInsLast4Weeks).toBe(48); // both weeks, all 3 departments: 24+24
  });

  it("sums only the trailing 4 weeks for checkInsLast4Weeks when more than 4 weeks exist", async () => {
    const weeks = [
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-08T00:00:00.000Z"),
      new Date("2026-06-15T00:00:00.000Z"),
      new Date("2026-06-22T00:00:00.000Z"),
      new Date("2026-06-29T00:00:00.000Z"),
    ];
    const repository = new FakeSignalRepository(
      weeks.map((weekStart) => ({ department: "A", weekStart, checkIns: 10, concerning: 5 })),
    );
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.checkInsLast4Weeks).toBe(40); // trailing 4 of 5 weeks, not all 5 (which would be 50)
    expect(result.weeklyTrend).toHaveLength(5); // but the trend still returns every week
  });

  it("returns 0 for overallConcerningRate (not NaN) when every department is suppressed", async () => {
    const repository = new FakeSignalRepository([
      { department: "Tiny", weekStart: WEEK_2, checkIns: 2, concerning: 1 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.segments).toEqual([]);
    expect(result.overallConcerningRate).toBe(0);
    expect(result.checkInsLast4Weeks).toBe(2); // org-wide sum still includes the suppressed dept
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

    expect(result.followUpResponseRate).toBe(0.75); // WEEK_2 (most recent): 15/20
  });

  it("returns 0, not NaN, when the most recent week's sent is 0", async () => {
    const repository = new FakeSignalRepository([]);
    const followUpRepository = new FakeSimulatedFollowUpRepository([{ weekStart: WEEK_2, sent: 0, responded: 0 }]);
    const useCase = new GetManagerSignalsUseCase(repository, followUpRepository);

    const result = await useCase.execute("institution-1");

    expect(result.followUpResponseRate).toBe(0);
  });

  it("returns 0 when there is no follow-up data at all", async () => {
    const repository = new FakeSignalRepository([]);
    const followUpRepository = new FakeSimulatedFollowUpRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository, followUpRepository);

    const result = await useCase.execute("institution-1");

    expect(result.followUpResponseRate).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test get-manager-signals -- --run`
Expected: FAIL — `../ports/signal-repository.port.ts` does not exist yet, and `execute()` doesn't accept an argument yet.

- [ ] **Step 3: Create the renamed port**

Create `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`:

```ts
export interface SignalRow {
  department: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

export interface SignalRepository {
  findAll(institutionId: string): Promise<SignalRow[]>;
}

export const SIGNAL_REPOSITORY = Symbol("SIGNAL_REPOSITORY");
```

Delete `apps/api/src/modules/manager/application/ports/simulated-signal-repository.port.ts`.

- [ ] **Step 4: Create the renamed Prisma adapter**

Create `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { SignalRepository, SignalRow } from "../../application/ports/signal-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaSignalRepository implements SignalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(institutionId: string): Promise<SignalRow[]> {
    const rows = await this.prisma.signal.findMany({ where: { institutionId } });
    return rows.map((row) => ({
      department: row.department,
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    }));
  }
}
```

Delete `apps/api/src/modules/manager/infrastructure/persistence/prisma-simulated-signal.repository.ts`.

- [ ] **Step 5: Update `GetManagerSignalsUseCase`**

In `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`, change the imports and the `execute` signature only — the grouping/threshold logic in the method body is unchanged, since the repository now returns rows already scoped to one institution:

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

    const byDepartment = new Map<string, SignalRow[]>();
    for (const row of rows) {
      const list = byDepartment.get(row.department) ?? [];
      list.push(row);
      byDepartment.set(row.department, list);
    }

    const segments: { label: string; value: number; n: number }[] = [];
    let visibleConcerning = 0;
    let visibleCheckIns = 0;

    for (const [department, deptRows] of byDepartment) {
      const currentWeekRow = deptRows.find((r) => r.weekStart.getTime() === mostRecentWeek);
      if (!currentWeekRow || currentWeekRow.checkIns < K_ANONYMITY_THRESHOLD) continue;

      segments.push({
        label: department,
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

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager/application/ports/signal-repository.port.ts \
        apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts \
        apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts \
        apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts
git rm apps/api/src/modules/manager/application/ports/simulated-signal-repository.port.ts \
       apps/api/src/modules/manager/infrastructure/persistence/prisma-simulated-signal.repository.ts
git commit -m "refactor(api): rename SimulatedSignalRepository to SignalRepository, scope GetManagerSignalsUseCase by institutionId"
```

---

### Task 3: Carry `institutionId` through login — repository, token, use case

**Files:**

- Modify: `apps/api/src/modules/manager/application/ports/manager-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts`
- Modify: `apps/api/src/modules/manager/application/services/manager-token.service.ts`
- Modify: `apps/api/src/modules/manager/application/services/manager-token.service.test.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts`

**Interfaces:**

- Consumes: `Manager.institutionId` (Task 1).
- Produces (used by Task 4, 6): `ManagerRow.institutionId`; `ManagerTokenService.issue(managerId, managerName, institutionId)`; `DecodedManagerToken { managerId, managerName, institutionId }`.

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
  it("issues a token that verify() decodes back to the same manager id/name/institutionId", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token, expiresAt } = service.issue("manager-1", "Ana Konder", "institution-1");

    expect(service.verify(token)).toEqual({
      managerId: "manager-1",
      managerName: "Ana Konder",
      institutionId: "institution-1",
    });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("round-trips a manager name containing a period without breaking parsing", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("manager-1", "Dr. Ana Konder", "institution-1");

    expect(service.verify(token)).toEqual({
      managerId: "manager-1",
      managerName: "Dr. Ana Konder",
      institutionId: "institution-1",
    });
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new ManagerTokenService(fakeConfig("secret-a"));
    const verifier = new ManagerTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue("manager-1", "Ana Konder", "institution-1");

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
    const { token } = service.issue("manager-1", "Ana Konder", "institution-1");

    vi.advanceTimersByTime(9 * 60 * 60 * 1000); // 9h, past the 8h expiry
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
  constructor(private readonly rows: ManagerRow[]) {}
  async findByName(name: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginManagerUseCase", () => {
  it("issues a token carrying the manager's institutionId when the name and password match", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository([
      { id: "manager-1", name: "Ana Konder", passwordHash, institutionId: "institution-1" },
    ]);
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("Ana Konder", "correct-password");

    expect(result.token).toEqual(expect.any(String));
    expect(result.expiresAt).toEqual(expect.any(String));
    expect(tokenService.verify(result.token)).toEqual({
      managerId: "manager-1",
      managerName: "Ana Konder",
      institutionId: "institution-1",
    });
  });

  it("throws InvalidManagerCredentialsError when the name is unknown", async () => {
    const passwordService = new ManagerPasswordService();
    const repository = new FakeManagerRepository([]);
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown Person", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError when the password is wrong", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository([
      { id: "manager-1", name: "Ana Konder", passwordHash, institutionId: "institution-1" },
    ]);
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Ana Konder", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("pays the same password-verification cost for an unknown name as for a known one (no timing side channel to enumerate manager names)", async () => {
    const passwordService = new ManagerPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository([
      { id: "manager-1", name: "Ana Konder", passwordHash, institutionId: "institution-1" },
    ]);
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
Expected: FAIL — `issue()` doesn't accept a third argument yet, `ManagerRow` has no `institutionId`.

- [ ] **Step 3: Update the manager repository port and adapter**

In `apps/api/src/modules/manager/application/ports/manager-repository.port.ts`:

```ts
export interface ManagerRow {
  id: string;
  name: string;
  passwordHash: string;
  institutionId: string;
}

export interface ManagerRepository {
  findByName(name: string): Promise<ManagerRow | null>;
}

export const MANAGER_REPOSITORY = Symbol("MANAGER_REPOSITORY");
```

In `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { ManagerRepository, ManagerRow } from "../../application/ports/manager-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaManagerRepository implements ManagerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByName(name: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { name } });
    if (!row) return null;
    return { id: row.id, name: row.name, passwordHash: row.passwordHash, institutionId: row.institutionId };
  }
}
```

- [ ] **Step 4: Update `ManagerTokenService`**

Replace `apps/api/src/modules/manager/application/services/manager-token.service.ts` in full:

```ts
import { createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeStringEqual } from "./timing-safe-equal.ts";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface IssuedManagerToken {
  token: string;
  expiresAt: string;
}

export interface DecodedManagerToken {
  managerId: string;
  managerName: string;
  institutionId: string;
}

interface TokenPayload {
  sessionId: string;
  managerId: string;
  managerName: string;
  institutionId: string;
  expiresAtEpoch: number;
}

@Injectable()
export class ManagerTokenService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  issue(managerId: string, managerName: string, institutionId: string): IssuedManagerToken {
    const sessionId = randomUUID();
    const expiresAtEpoch = Date.now() + SESSION_DURATION_MS;
    const payload: TokenPayload = { sessionId, managerId, managerName, institutionId, expiresAtEpoch };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(payloadB64);

    return { token: `${payloadB64}.${signature}`, expiresAt: new Date(expiresAtEpoch).toISOString() };
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
      !Number.isFinite(payload.expiresAtEpoch)
    ) {
      return null;
    }

    if (Date.now() >= payload.expiresAtEpoch) return null;

    return { managerId: payload.managerId, managerName: payload.managerName, institutionId: payload.institutionId };
  }

  private sign(payloadB64: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("MANAGER_TOKEN_SECRET"))
      .update(payloadB64)
      .digest("base64url");
  }
}
```

- [ ] **Step 5: Update `LoginManagerUseCase`**

In `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts`, change only the final line of `execute`:

```ts
    return this.tokenService.issue(manager.id, manager.name, manager.institutionId);
```

(`manager` is already known non-null at that point — the preceding `if (!manager || !isValid)` guard is unchanged.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @zelo/api test manager-token.service login-manager.use-case -- --run`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager/application/ports/manager-repository.port.ts \
        apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts \
        apps/api/src/modules/manager/application/services/manager-token.service.ts \
        apps/api/src/modules/manager/application/services/manager-token.service.test.ts \
        apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts \
        apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts
git commit -m "feat(api): carry institutionId through manager login and session tokens"
```

---

### Task 4: Attach `institutionId` in the auth guard

**Files:**

- Modify: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts`

**Interfaces:**

- Consumes: `ManagerTokenService.verify()` returning `institutionId` (Task 3).
- Produces (used by Task 6): `request.manager` now includes `institutionId`.

- [ ] **Step 1: Write the failing test**

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

  it("allows a request with a valid Bearer token and attaches the decoded manager, including institutionId, to the request", () => {
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.manager).toEqual({ id: "manager-1", name: "Ana Konder", institutionId: "institution-1" });
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

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test manager-auth.guard -- --run`
Expected: FAIL — `request.manager` has no `institutionId` yet.

- [ ] **Step 3: Update the guard**

Replace `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts` in full:

```ts
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";

declare global {
  namespace Express {
    interface Request {
      manager?: { id: string; name: string; institutionId: string };
    }
  }
}

// Verifies a Bearer token, not an HttpOnly cookie — deliberate,
// see docs/superpowers/specs/technical-debt.md#td-001.
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

    request.manager = { id: decoded.managerId, name: decoded.managerName, institutionId: decoded.institutionId };
    return true;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager-auth.guard -- --run`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts \
        apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts
git commit -m "feat(api): attach institutionId to request.manager in ManagerAuthGuard"
```

---

### Task 5: Scope insight generation and history by institution

**Files:**

- Modify: `apps/api/src/modules/manager/application/ports/manager-insight-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager-insight.repository.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-insight-history.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-insight-history.use-case.test.ts`

**Interfaces:**

- Consumes: `ManagerInsight.institutionId` (Task 1), `GetManagerSignalsUseCase.execute(institutionId)` (Task 2).
- Produces (used by Task 6): `GenerateManagerInsightUseCase.execute(managerName, institutionId)`; `GetManagerInsightHistoryUseCase.execute(institutionId)`; `StoredManagerInsight.institutionId`.

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/modules/manager/application/use-cases/get-manager-insight-history.use-case.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { GetManagerInsightHistoryUseCase } from "./get-manager-insight-history.use-case.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../ports/manager-insight-repository.port.ts";

class FakeManagerInsightRepository implements ManagerInsightRepository {
  public lastInstitutionId: string | null = null;
  constructor(private readonly rows: StoredManagerInsight[]) {}
  async save(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findAll(institutionId: string): Promise<StoredManagerInsight[]> {
    this.lastInstitutionId = institutionId;
    return this.rows;
  }
}

describe("GetManagerInsightHistoryUseCase", () => {
  it("passes the given institutionId through to the repository", async () => {
    const repository = new FakeManagerInsightRepository([]);
    const useCase = new GetManagerInsightHistoryUseCase(repository);

    await useCase.execute("institution-1");

    expect(repository.lastInstitutionId).toBe("institution-1");
  });

  it("returns whatever the repository's findAll() returns, unchanged, regardless of which manager generated each entry", async () => {
    const rows: StoredManagerInsight[] = [
      {
        id: "1",
        interpretation: "texto 1",
        suggestedActions: ["ação"],
        summary: "resumo 1",
        generatedAt: new Date("2026-07-01T00:00:00.000Z"),
        createdByManagerName: "Ana Konder",
        institutionId: "institution-1",
      },
      {
        id: "2",
        interpretation: "texto 2",
        suggestedActions: [],
        summary: "resumo 2",
        generatedAt: new Date("2026-06-01T00:00:00.000Z"),
        createdByManagerName: "Carlos Mendes",
        institutionId: "institution-1",
      },
      {
        id: "3",
        interpretation: "texto 3",
        suggestedActions: [],
        summary: "resumo 3",
        generatedAt: new Date("2026-05-01T00:00:00.000Z"),
        createdByManagerName: null,
        institutionId: "institution-1",
      },
    ];
    const repository = new FakeManagerInsightRepository(rows);
    const useCase = new GetManagerInsightHistoryUseCase(repository);

    const result = await useCase.execute("institution-1");

    expect(result).toEqual(rows);
  });
});
```

Replace `apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { GenerateManagerInsightUseCase } from "./generate-manager-insight.use-case.ts";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SignalRepository, SignalRow } from "../ports/signal-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../ports/simulated-follow-up-repository.port.ts";
import type { AiInsightPort, ManagerInsightResponse } from "../ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_SYSTEM_PROMPT } from "../prompts/manager-insight-system-prompt.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../ports/manager-insight-repository.port.ts";

class FakeSignalRepository implements SignalRepository {
  constructor(private readonly rows: SignalRow[]) {}
  async findAll(): Promise<SignalRow[]> {
    return this.rows;
  }
}

class FakeSimulatedFollowUpRepository implements SimulatedFollowUpRepository {
  constructor(private readonly rows: SimulatedFollowUpRow[] = []) {}
  async findAll(): Promise<SimulatedFollowUpRow[]> {
    return this.rows;
  }
}

class FakeAiInsightPort implements AiInsightPort {
  public lastParams: { summary: string; systemPrompt: string } | null = null;
  constructor(private readonly result: ManagerInsightResponse) {}
  async generateInsight(params: { summary: string; systemPrompt: string }): Promise<ManagerInsightResponse> {
    this.lastParams = params;
    return this.result;
  }
}

class FakeManagerInsightRepository implements ManagerInsightRepository {
  public savedEntries: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }[] = [];
  public shouldFailSave = false;
  async save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error("save failed");
    }
    this.savedEntries.push(entry);
  }
  async findAll(): Promise<StoredManagerInsight[]> {
    return [];
  }
}

const WEEK_1 = new Date("2026-06-15T00:00:00.000Z");
const WEEK_2 = new Date("2026-06-22T00:00:00.000Z");

describe("GenerateManagerInsightUseCase", () => {
  it("formats the current ManagerSignalsResponse into a PT-BR summary and forwards it with the system prompt", async () => {
    const signalsRepository = new FakeSignalRepository([
      { department: "UTI", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { department: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository);

    const result = await useCase.execute("Ana Konder", "institution-1");

    expect(result).toEqual({ interpretation: "texto", suggestedActions: ["ação 1"] });
    expect(aiInsight.lastParams?.systemPrompt).toBe(MANAGER_INSIGHT_SYSTEM_PROMPT);
    expect(aiInsight.lastParams?.summary).toContain("Taxa geral de sinais preocupantes: 60%");
    expect(aiInsight.lastParams?.summary).toContain("UTI: 60% (n=10)");
    expect(aiInsight.lastParams?.summary).toContain(
      "Tendência semanal (taxa de sinais preocupantes por semana, 2 semanas): 30%, 60%",
    );
  });

  it("propagates whatever the AiInsightPort throws (e.g. InsightGenerationFailedError from the adapter)", async () => {
    const signalsRepository = new FakeSignalRepository([
      { department: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    class ThrowingAiInsightPort implements AiInsightPort {
      async generateInsight(): Promise<ManagerInsightResponse> {
        throw new Error("boom");
      }
    }
    const insightRepository = new FakeManagerInsightRepository();
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, new ThrowingAiInsightPort(), insightRepository);

    await expect(useCase.execute("Ana Konder", "institution-1")).rejects.toThrow("boom");
    expect(insightRepository.savedEntries).toEqual([]);
  });

  it("saves the generated insight to the repository, attributed to the manager and institution", async () => {
    const signalsRepository = new FakeSignalRepository([
      { department: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository);

    await useCase.execute("Ana Konder", "institution-1");

    expect(insightRepository.savedEntries).toEqual([
      {
        interpretation: "texto",
        suggestedActions: ["ação 1"],
        summary: aiInsight.lastParams?.summary,
        createdByManagerName: "Ana Konder",
        institutionId: "institution-1",
      },
    ]);
  });

  it("still returns the generated insight even if saving to the repository fails", async () => {
    const signalsRepository = new FakeSignalRepository([
      { department: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    insightRepository.shouldFailSave = true;
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository);

    const result = await useCase.execute("Ana Konder", "institution-1");

    expect(result).toEqual({ interpretation: "texto", suggestedActions: ["ação 1"] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/api test generate-manager-insight get-manager-insight-history -- --run`
Expected: FAIL — signatures don't match yet.

- [ ] **Step 3: Update the manager insight port and adapter**

Replace `apps/api/src/modules/manager/application/ports/manager-insight-repository.port.ts` in full:

```ts
export interface StoredManagerInsight {
  id: string;
  interpretation: string;
  suggestedActions: string[];
  summary: string;
  generatedAt: Date;
  createdByManagerName: string | null;
  institutionId: string;
}

export interface ManagerInsightRepository {
  save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void>;
  findAll(institutionId: string): Promise<StoredManagerInsight[]>;
}

export const MANAGER_INSIGHT_REPOSITORY = Symbol("MANAGER_INSIGHT_REPOSITORY");
```

Replace `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager-insight.repository.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { ManagerInsightRepository, StoredManagerInsight } from "../../application/ports/manager-insight-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaManagerInsightRepository implements ManagerInsightRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void> {
    await this.prisma.managerInsight.create({ data: entry });
  }

  async findAll(institutionId: string): Promise<StoredManagerInsight[]> {
    const rows = await this.prisma.managerInsight.findMany({
      where: { institutionId },
      orderBy: { generatedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      interpretation: row.interpretation,
      suggestedActions: row.suggestedActions,
      summary: row.summary,
      generatedAt: row.generatedAt,
      createdByManagerName: row.createdByManagerName,
      institutionId: row.institutionId,
    }));
  }
}
```

- [ ] **Step 4: Update the use cases**

In `apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.ts`, change the `execute` method's signature and body (the `formatSummary` private method and constructor are unchanged):

```ts
  async execute(managerName: string, institutionId: string): Promise<ManagerInsightResponse> {
    const signals = await this.getManagerSignals.execute(institutionId);
    const summary = this.formatSummary(signals);
    const result = await this.aiInsight.generateInsight({ summary, systemPrompt: MANAGER_INSIGHT_SYSTEM_PROMPT });

    try {
      await this.insightRepository.save({
        interpretation: result.interpretation,
        suggestedActions: result.suggestedActions,
        summary,
        createdByManagerName: managerName,
        institutionId,
      });
    } catch (error) {
      this.logger.error(
        "Failed to save generated manager insight to history",
        error instanceof Error ? error.stack : String(error),
      );
    }

    return result;
  }
```

Replace `apps/api/src/modules/manager/application/use-cases/get-manager-insight-history.use-case.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_INSIGHT_REPOSITORY, type ManagerInsightRepository, type StoredManagerInsight } from "../ports/manager-insight-repository.port.ts";

@Injectable()
export class GetManagerInsightHistoryUseCase {
  constructor(@Inject(MANAGER_INSIGHT_REPOSITORY) private readonly repository: ManagerInsightRepository) {}

  async execute(institutionId: string): Promise<StoredManagerInsight[]> {
    return this.repository.findAll(institutionId);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zelo/api test generate-manager-insight get-manager-insight-history -- --run`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/manager/application/ports/manager-insight-repository.port.ts \
        apps/api/src/modules/manager/infrastructure/persistence/prisma-manager-insight.repository.ts \
        apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.ts \
        apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.test.ts \
        apps/api/src/modules/manager/application/use-cases/get-manager-insight-history.use-case.ts \
        apps/api/src/modules/manager/application/use-cases/get-manager-insight-history.use-case.test.ts
git commit -m "feat(api): scope insight generation and insight history by institutionId"
```

---

### Task 6: Wire `institutionId` through the controller and module, prove cross-institution isolation end to end

**Files:**

- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`

**Interfaces:**

- Consumes: everything produced by Tasks 2–5.
- Produces: fully working `ManagerController` — no further tasks in this plan depend on it.

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts` in full — the fakes gain `institutionId`, and a new test asserts institution isolation for both signals and insight history:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { ManagerController } from "./manager.controller.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { LoginManagerUseCase } from "../application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase } from "../application/use-cases/get-manager-signals.use-case.ts";
import { GenerateManagerInsightUseCase } from "../application/use-cases/generate-manager-insight.use-case.ts";
import { GetManagerInsightHistoryUseCase } from "../application/use-cases/get-manager-insight-history.use-case.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { ManagerPasswordService } from "../application/services/manager-password.service.ts";
import { MANAGER_REPOSITORY } from "../application/ports/manager-repository.port.ts";
import type { ManagerRepository, ManagerRow } from "../application/ports/manager-repository.port.ts";
import { SIGNAL_REPOSITORY } from "../application/ports/signal-repository.port.ts";
import type { SignalRepository, SignalRow } from "../application/ports/signal-repository.port.ts";
import { SIMULATED_FOLLOW_UP_REPOSITORY } from "../application/ports/simulated-follow-up-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../application/ports/simulated-follow-up-repository.port.ts";
import { AI_INSIGHT_PORT, InsightGenerationFailedError } from "../application/ports/ai-insight.port.ts";
import type { AiInsightPort, ManagerInsightResponse } from "../application/ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_REPOSITORY } from "../application/ports/manager-insight-repository.port.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../application/ports/manager-insight-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  async findByName(name: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
}

class FakeSignalRepository implements SignalRepository {
  public rows: SignalRow[] = [];
  private byInstitution: Record<string, SignalRow[]> = {};
  setRowsForInstitution(institutionId: string, rows: SignalRow[]): void {
    this.byInstitution[institutionId] = rows;
  }
  async findAll(institutionId: string): Promise<SignalRow[]> {
    return this.byInstitution[institutionId] ?? [];
  }
}

class FakeSimulatedFollowUpRepository implements SimulatedFollowUpRepository {
  public rows: SimulatedFollowUpRow[] = [];
  async findAll(): Promise<SimulatedFollowUpRow[]> {
    return this.rows;
  }
}

class FakeAiInsightPort implements AiInsightPort {
  public shouldFail = false;
  async generateInsight(): Promise<ManagerInsightResponse> {
    if (this.shouldFail) {
      throw new InsightGenerationFailedError("simulated failure");
    }
    return { interpretation: "análise de teste", suggestedActions: ["ação de teste"] };
  }
}

class FakeManagerInsightRepository implements ManagerInsightRepository {
  public rows: StoredManagerInsight[] = [];
  async save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void> {
    this.rows.unshift({ id: `id-${this.rows.length + 1}`, generatedAt: new Date(), ...entry });
  }
  async findAll(institutionId: string): Promise<StoredManagerInsight[]> {
    return this.rows.filter((row) => row.institutionId === institutionId);
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { MANAGER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("manager controller", () => {
  let app: INestApplication;
  let managerRepository: FakeManagerRepository;
  let signalRepository: FakeSignalRepository;
  let followUpRepository: FakeSimulatedFollowUpRepository;
  let aiInsightPort: FakeAiInsightPort;
  let insightRepository: FakeManagerInsightRepository;

  beforeAll(async () => {
    const passwordService = new ManagerPasswordService();
    managerRepository = new FakeManagerRepository();
    managerRepository.rows = [
      {
        id: "manager-1",
        name: "Ana Konder",
        passwordHash: await passwordService.hash("test-password"),
        institutionId: "institution-a",
      },
      {
        id: "manager-2",
        name: "Beatriz Lima",
        passwordHash: await passwordService.hash("test-password-2"),
        institutionId: "institution-b",
      },
    ];
    signalRepository = new FakeSignalRepository();
    followUpRepository = new FakeSimulatedFollowUpRepository();
    aiInsightPort = new FakeAiInsightPort();
    insightRepository = new FakeManagerInsightRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [ManagerController],
      providers: [
        LoginManagerUseCase,
        GetManagerSignalsUseCase,
        GenerateManagerInsightUseCase,
        GetManagerInsightHistoryUseCase,
        ManagerTokenService,
        ManagerPasswordService,
        ManagerAuthGuard,
        { provide: MANAGER_REPOSITORY, useValue: managerRepository },
        { provide: SIGNAL_REPOSITORY, useValue: signalRepository },
        { provide: SIMULATED_FOLLOW_UP_REPOSITORY, useValue: followUpRepository },
        { provide: AI_INSIGHT_PORT, useValue: aiInsightPort },
        { provide: MANAGER_INSIGHT_REPOSITORY, useValue: insightRepository },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function getToken(name: string, password: string): Promise<string> {
    const login = await request(app.getHttpServer()).post("/manager/login").send({ name, password });
    return login.body.token;
  }

  it("POST /manager/login returns a token for the correct name and password", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ name: "Ana Konder", password: "test-password" });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.expiresAt).toEqual(expect.any(String));
  });

  it("POST /manager/login rejects an unknown name with 401", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ name: "Unknown Person", password: "test-password" });

    expect(response.status).toBe(401);
  });

  it("POST /manager/login rejects the wrong password with 401", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ name: "Ana Konder", password: "wrong-password" });

    expect(response.status).toBe(401);
  });

  it("POST /manager/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/manager/login").send({});

    expect(response.status).toBe(400);
  });

  it("GET /manager/signals rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).get("/manager/signals");

    expect(response.status).toBe(401);
  });

  it("GET /manager/signals returns only the authenticated manager's own institution's data, suppressing n<5 departments", async () => {
    signalRepository.setRowsForInstitution("institution-a", [
      { department: "A", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 10, concerning: 6 },
      { department: "Tiny", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 3, concerning: 1 },
    ]);
    signalRepository.setRowsForInstitution("institution-b", [
      { department: "A", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 20, concerning: 2 },
    ]);

    const tokenA = await getToken("Ana Konder", "test-password");
    const responseA = await request(app.getHttpServer()).get("/manager/signals").set("Authorization", `Bearer ${tokenA}`);
    expect(responseA.status).toBe(200);
    expect(responseA.body.segments).toEqual([{ label: "A", value: 60, n: 10 }]);

    const tokenB = await getToken("Beatriz Lima", "test-password-2");
    const responseB = await request(app.getHttpServer()).get("/manager/signals").set("Authorization", `Bearer ${tokenB}`);
    expect(responseB.status).toBe(200);
    expect(responseB.body.segments).toEqual([{ label: "A", value: 10, n: 20 }]);
  });

  it("POST /manager/insights rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).post("/manager/insights");

    expect(response.status).toBe(401);
  });

  it("POST /manager/insights returns the structured insight for a valid token", async () => {
    aiInsightPort.shouldFail = false;
    const token = await getToken("Ana Konder", "test-password");

    const response = await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ interpretation: "análise de teste", suggestedActions: ["ação de teste"] });
  });

  it("POST /manager/insights returns 502 when insight generation fails", async () => {
    aiInsightPort.shouldFail = true;
    const token = await getToken("Ana Konder", "test-password");

    const response = await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(502);
    aiInsightPort.shouldFail = false;
  });

  it("GET /manager/insights/history rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).get("/manager/insights/history");

    expect(response.status).toBe(401);
  });

  it("POST /manager/insights auto-saves to history with the authenticated manager's name and institution, visible only to managers at that same institution", async () => {
    insightRepository.rows = [];
    aiInsightPort.shouldFail = false;

    const tokenA = await getToken("Ana Konder", "test-password");
    await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${tokenA}`);

    const historyForA = await request(app.getHttpServer())
      .get("/manager/insights/history")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(historyForA.status).toBe(200);
    expect(historyForA.body).toEqual([
      expect.objectContaining({
        interpretation: "análise de teste",
        suggestedActions: ["ação de teste"],
        createdByManagerName: "Ana Konder",
      }),
    ]);

    const tokenB = await getToken("Beatriz Lima", "test-password-2");
    const historyForB = await request(app.getHttpServer())
      .get("/manager/insights/history")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(historyForB.status).toBe(200);
    expect(historyForB.body).toEqual([]); // institution-a's insight never leaks to institution-b
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test manager.controller -- --run`
Expected: FAIL — controller handlers don't read `request.manager.institutionId` yet, and `manager.module.ts` still wires the old `SIMULATED_SIGNAL_REPOSITORY` token.

- [ ] **Step 3: Update the controller**

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

  @Get("signals")
  @UseGuards(ManagerAuthGuard)
  async signals(@Req() request: Request): Promise<ManagerSignalsResponse> {
    return this.getManagerSignals.execute(request.manager!.institutionId);
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

- [ ] **Step 4: Update the module wiring**

Replace `apps/api/src/modules/manager/manager.module.ts` in full:

```ts
import { Module } from "@nestjs/common";
import { ManagerController } from "./infrastructure/manager.controller.ts";
import { ManagerAuthGuard } from "./infrastructure/manager-auth.guard.ts";
import { PrismaSignalRepository } from "./infrastructure/persistence/prisma-signal.repository.ts";
import { PrismaSimulatedFollowUpRepository } from "./infrastructure/persistence/prisma-simulated-follow-up.repository.ts";
import { PrismaManagerInsightRepository } from "./infrastructure/persistence/prisma-manager-insight.repository.ts";
import { PrismaManagerRepository } from "./infrastructure/persistence/prisma-manager.repository.ts";
import { GroqInsightAdapter } from "./infrastructure/ai-providers/groq-insight.adapter.ts";
import { FakeInsightAdapter } from "./infrastructure/ai-providers/fake-insight.adapter.ts";
import { LoginManagerUseCase } from "./application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase } from "./application/use-cases/get-manager-signals.use-case.ts";
import { GenerateManagerInsightUseCase } from "./application/use-cases/generate-manager-insight.use-case.ts";
import { GetManagerInsightHistoryUseCase } from "./application/use-cases/get-manager-insight-history.use-case.ts";
import { ManagerTokenService } from "./application/services/manager-token.service.ts";
import { ManagerPasswordService } from "./application/services/manager-password.service.ts";
import { SIGNAL_REPOSITORY } from "./application/ports/signal-repository.port.ts";
import { SIMULATED_FOLLOW_UP_REPOSITORY } from "./application/ports/simulated-follow-up-repository.port.ts";
import { AI_INSIGHT_PORT } from "./application/ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_REPOSITORY } from "./application/ports/manager-insight-repository.port.ts";
import { MANAGER_REPOSITORY } from "./application/ports/manager-repository.port.ts";

// Read directly from process.env (not ConfigService) so that only the
// selected adapter is ever instantiated — AI_PROVIDER=mock must not require
// a GROQ_API_KEY, but GroqInsightAdapter's constructor calls config.getOrThrow for it.
const aiInsightPortProvider =
  process.env.AI_PROVIDER === "mock"
    ? { provide: AI_INSIGHT_PORT, useClass: FakeInsightAdapter }
    : { provide: AI_INSIGHT_PORT, useClass: GroqInsightAdapter };

@Module({
  controllers: [ManagerController],
  providers: [
    LoginManagerUseCase,
    GetManagerSignalsUseCase,
    GenerateManagerInsightUseCase,
    GetManagerInsightHistoryUseCase,
    ManagerTokenService,
    ManagerPasswordService,
    ManagerAuthGuard,
    { provide: SIGNAL_REPOSITORY, useClass: PrismaSignalRepository },
    { provide: SIMULATED_FOLLOW_UP_REPOSITORY, useClass: PrismaSimulatedFollowUpRepository },
    aiInsightPortProvider,
    { provide: MANAGER_INSIGHT_REPOSITORY, useClass: PrismaManagerInsightRepository },
    { provide: MANAGER_REPOSITORY, useClass: PrismaManagerRepository },
  ],
})
export class ManagerModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager.controller -- --run`
Expected: PASS (all tests, including the new cross-institution isolation assertions).

- [ ] **Step 6: Run the full API test suite and typecheck**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS across the whole module — this confirms Tasks 2–6 left nothing broken.

Run: `pnpm --filter @zelo/api exec tsc --noEmit`
Expected: no errors (the failures noted in Task 1 Step 6 are now all resolved).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager/infrastructure/manager.controller.ts \
        apps/api/src/modules/manager/infrastructure/manager.controller.test.ts \
        apps/api/src/modules/manager/manager.module.ts
git commit -m "feat(api): scope manager controller endpoints by the authenticated manager's institutionId"
```

---

### Task 7: Seed data — two institutions, so cross-tenant isolation is visible in the running app

**Files:**

- Modify: `apps/api/prisma/seed-data.ts`
- Modify: `apps/api/prisma/seed-data.test.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/prisma/README.md`

**Interfaces:**

- Consumes: `Institution`, `Manager.institutionId`, `Signal.institutionId` (Task 1).
- Produces: nothing further in this plan depends on this task — it's the last one.

- [ ] **Step 1: Write the failing test**

In `apps/api/prisma/seed-data.test.ts`, update the import line to add the new exports, and add a new `describe` block:

```ts
import {
  buildFollowUpSeedRows,
  buildSeedRows,
  startOfIsoWeek,
  MANAGER_SEED_ROSTER,
  INSTITUTION_SEED_ROSTER,
} from "./seed-data.ts";
```

```ts
describe("INSTITUTION_SEED_ROSTER", () => {
  it("has at least two institutions with unique names and unique invite codes", () => {
    expect(INSTITUTION_SEED_ROSTER.length).toBeGreaterThanOrEqual(2);
    const names = INSTITUTION_SEED_ROSTER.map((institution) => institution.name);
    const inviteCodes = INSTITUTION_SEED_ROSTER.map((institution) => institution.inviteCode);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(inviteCodes).size).toBe(inviteCodes.length);
  });

  it("includes 'Zelo Demo' matching the institution the add_institution_scoping migration backfilled existing rows onto", () => {
    const demo = INSTITUTION_SEED_ROSTER.find((institution) => institution.name === "Zelo Demo");
    expect(demo).toBeDefined();
    expect(demo?.inviteCode).toBe("zelo-demo-2026");
  });

  it("every MANAGER_SEED_ROSTER entry references a name present in INSTITUTION_SEED_ROSTER", () => {
    const institutionNames = new Set(INSTITUTION_SEED_ROSTER.map((institution) => institution.name));
    for (const manager of MANAGER_SEED_ROSTER) {
      expect(institutionNames.has(manager.institutionName)).toBe(true);
    }
  });
});
```

Also update the existing `buildSeedRows` describe block's calls — `buildSeedRows` now takes a scenario table as a second argument (see Step 3), so replace the `"produces 6 weeks x 4 departments = 24 rows"` and related tests' calls from `buildSeedRows(reference)` to `buildSeedRows(reference, ZELO_DEMO_SCENARIOS)`, and add that import:

```ts
import {
  buildFollowUpSeedRows,
  buildSeedRows,
  startOfIsoWeek,
  MANAGER_SEED_ROSTER,
  INSTITUTION_SEED_ROSTER,
  ZELO_DEMO_SCENARIOS,
} from "./seed-data.ts";
```

(Every other call site of `buildSeedRows(reference)` in the existing `describe("buildSeedRows", ...)` block becomes `buildSeedRows(reference, ZELO_DEMO_SCENARIOS)` — same test bodies and assertions otherwise, since `ZELO_DEMO_SCENARIOS` is exactly the existing `SCENARIOS` table renamed.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test seed-data -- --run`
Expected: FAIL — `INSTITUTION_SEED_ROSTER` and `ZELO_DEMO_SCENARIOS` are not exported yet, and `buildSeedRows` doesn't accept a second argument yet.

- [ ] **Step 3: Update `seed-data.ts`**

In `apps/api/prisma/seed-data.ts`:

1. Rename the existing `SCENARIOS` constant to `ZELO_DEMO_SCENARIOS` and export it.
2. Add a second, smaller scenario table for the second demo institution.
3. Change `buildSeedRows` to accept the scenario table as a parameter instead of reading the module-level constant.
4. Add `InstitutionSeedRow`/`INSTITUTION_SEED_ROSTER`.
5. Add `institutionName` to `ManagerSeedRow`/`MANAGER_SEED_ROSTER`.

```ts
export interface SimulatedSignalSeedRow {
  department: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

const WEEKS_TO_SEED = 6;

/** Monday 00:00 UTC of the ISO week containing `date` — same convention as apps/web's GetAssessmentHistoryUseCase. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday(0) -> 7, so Monday(1) is always the start
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface SignalScenario {
  department: string;
  checkIns: number;
  concerning: number[];
}

// Per-department, per-week checkIns and concerning counts, oldest week first (index 0 = 5
// weeks ago, index 5 = current week). See
// docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md §3 for what
// "concerning" means and why these specific numbers were chosen. Edit ONLY this table (and
// the mirrored numbers in prisma/README.md) to change the Zelo Demo scenario.
export const ZELO_DEMO_SCENARIOS: SignalScenario[] = [
  { department: "Pronto-socorro", checkIns: 24, concerning: [9, 9, 9, 9, 9, 9] },
  { department: "Plantão noturno", checkIns: 18, concerning: [9, 9, 9, 9, 9, 9] },
  { department: "UTI", checkIns: 10, concerning: [3, 4, 4, 5, 6, 6] },
  { department: "Ambulatório", checkIns: 3, concerning: [1, 1, 1, 1, 1, 1] },
];

// A second, deliberately different scenario for a second seeded institution — exists so
// running the app locally with two manager accounts visibly proves cross-institution
// isolation (same department name "UTI", very different numbers, never mixed).
export const SAO_LUCAS_DEMO_SCENARIOS: SignalScenario[] = [
  { department: "UTI", checkIns: 8, concerning: [1, 1, 1, 1, 2, 2] },
];

export function buildSeedRows(referenceDate: Date, scenarios: SignalScenario[]): SimulatedSignalSeedRow[] {
  const currentWeekStart = startOfIsoWeek(referenceDate);
  const rows: SimulatedSignalSeedRow[] = [];

  for (const scenario of scenarios) {
    for (let i = 0; i < WEEKS_TO_SEED; i++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - (WEEKS_TO_SEED - 1 - i) * 7);
      rows.push({
        department: scenario.department,
        weekStart,
        checkIns: scenario.checkIns,
        concerning: scenario.concerning[i]!,
      });
    }
  }

  return rows;
}

export interface SimulatedFollowUpSeedRow {
  weekStart: Date;
  sent: number;
  responded: number;
}

const FOLLOW_UP_WEEKS_TO_SEED = 6;
// oldest week first; last entry is the current week. Chosen to read as a believable,
// improving-but-imperfect response rate for the demo (see seed-data.test.ts).
const FOLLOW_UP_SCENARIO: { sent: number; responded: number }[] = [
  { sent: 20, responded: 9 },
  { sent: 22, responded: 11 },
  { sent: 25, responded: 13 },
  { sent: 26, responded: 15 },
  { sent: 28, responded: 17 },
  { sent: 30, responded: 21 },
];

export function buildFollowUpSeedRows(referenceDate: Date): SimulatedFollowUpSeedRow[] {
  const currentWeekStart = startOfIsoWeek(referenceDate);
  const rows: SimulatedFollowUpSeedRow[] = [];

  for (let i = 0; i < FOLLOW_UP_WEEKS_TO_SEED; i++) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - (FOLLOW_UP_WEEKS_TO_SEED - 1 - i) * 7);
    rows.push({ weekStart, sent: FOLLOW_UP_SCENARIO[i]!.sent, responded: FOLLOW_UP_SCENARIO[i]!.responded });
  }

  return rows;
}

export interface InstitutionSeedRow {
  name: string;
  inviteCode: string;
}

// "Zelo Demo" MUST keep this exact name and inviteCode — the add_institution_scoping
// migration inserts a row with these same values (id 'demo-institution') to backfill
// existing managers/manager_insights. seed.ts upserts by `name`, so this entry finds
// that same row rather than creating a duplicate.
export const INSTITUTION_SEED_ROSTER: InstitutionSeedRow[] = [
  { name: "Zelo Demo", inviteCode: "zelo-demo-2026" },
  { name: "Hospital São Lucas (Demo)", inviteCode: "sao-lucas-2026" },
];

export interface ManagerSeedRow {
  name: string;
  password: string;
  passwordEnvVar: string;
  institutionName: string;
}

// Demo roster — plaintext passwords here are intentional (local/demo data,
// same transparency MANAGER_ACCESS_CODE=zelo-demo-2026 had in .env.example
// before this migration). Hashed at seed time by ManagerPasswordService,
// never stored in plaintext in the database. `passwordEnvVar` names an
// environment variable that, if set, overrides `password` at seed time —
// use it anywhere a real, non-committed password is needed (e.g.
// production), so the committed plaintext values here are never the actual
// live credential. `institutionName` must match a `name` in
// INSTITUTION_SEED_ROSTER. See seed.ts and prisma/README.md.
export const MANAGER_SEED_ROSTER: ManagerSeedRow[] = [
  { name: "Ana Konder", password: "zelo-ana-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_ANA", institutionName: "Zelo Demo" },
  { name: "Carlos Mendes", password: "zelo-carlos-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_CARLOS", institutionName: "Zelo Demo" },
  { name: "Beatriz Lima", password: "zelo-beatriz-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_BEATRIZ", institutionName: "Hospital São Lucas (Demo)" },
];
```

- [ ] **Step 4: Update `seed.ts`**

Replace `apps/api/prisma/seed.ts` in full:

```ts
import { PrismaService } from "../src/shared/prisma/prisma.service.ts";
import { ManagerPasswordService } from "../src/modules/manager/application/services/manager-password.service.ts";
import {
  buildFollowUpSeedRows,
  buildSeedRows,
  INSTITUTION_SEED_ROSTER,
  MANAGER_SEED_ROSTER,
  SAO_LUCAS_DEMO_SCENARIOS,
  ZELO_DEMO_SCENARIOS,
} from "./seed-data.ts";

async function main() {
  const prisma = new PrismaService();
  const passwordService = new ManagerPasswordService();
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

  await prisma.signal.deleteMany({ where: { institutionId: zeloDemo.id } });
  await prisma.signal.createMany({
    data: buildSeedRows(new Date(), ZELO_DEMO_SCENARIOS).map((row) => ({ ...row, institutionId: zeloDemo.id })),
  });

  await prisma.signal.deleteMany({ where: { institutionId: saoLucasDemo.id } });
  await prisma.signal.createMany({
    data: buildSeedRows(new Date(), SAO_LUCAS_DEMO_SCENARIOS).map((row) => ({ ...row, institutionId: saoLucasDemo.id })),
  });

  await prisma.simulatedFollowUp.deleteMany();
  await prisma.simulatedFollowUp.createMany({ data: followUpRows });

  for (const manager of MANAGER_SEED_ROSTER) {
    const institution = institutionsByName.get(manager.institutionName);
    if (!institution) {
      throw new Error(`MANAGER_SEED_ROSTER entry "${manager.name}" references unknown institution "${manager.institutionName}"`);
    }
    const password = process.env[manager.passwordEnvVar] ?? manager.password;
    const passwordHash = await passwordService.hash(password);
    await prisma.manager.upsert({
      where: { name: manager.name },
      update: {},
      create: { name: manager.name, passwordHash, institutionId: institution.id },
    });
  }

  console.log(
    `Seeded ${INSTITUTION_SEED_ROSTER.length} Institution rows, Signal rows for each, ${followUpRows.length} SimulatedFollowUp rows, and ${MANAGER_SEED_ROSTER.length} Manager accounts.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test seed-data -- --run`
Expected: PASS (all tests, including the new `INSTITUTION_SEED_ROSTER` block).

- [ ] **Step 6: Run the seed script against local Postgres and verify manually**

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm --filter @zelo/api exec tsx prisma/seed.ts
```

Expected output: `Seeded 2 Institution rows, Signal rows for each, 6 SimulatedFollowUp rows, and 3 Manager accounts.`

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "SELECT m.name, i.name AS institution FROM managers m JOIN institutions i ON i.id = m.\"institutionId\" ORDER BY m.name;"
```

Expected: `Ana Konder` and `Carlos Mendes` under `Zelo Demo`, `Beatriz Lima` under `Hospital São Lucas (Demo)`.

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "SELECT i.name AS institution, s.department, s.\"checkIns\" FROM signals s JOIN institutions i ON i.id = s.\"institutionId\" WHERE s.department = 'UTI' ORDER BY i.name;"
```

Expected: two `UTI` rows with different `checkIns` values (one per institution), proving the two institutions' data never merged.

- [ ] **Step 7: Manually verify cross-institution isolation via the running API**

With the API running locally (`pnpm --filter @zelo/api dev` or equivalent), confirm the isolation end to end:

```bash
curl -s -X POST http://localhost:3000/manager/login -H "Content-Type: application/json" \
  -d '{"name":"Ana Konder","password":"zelo-ana-2026"}' | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))"
```

Use the printed token to call `GET /manager/signals` with an `Authorization: Bearer <token>` header and confirm the `UTI` segment matches `ZELO_DEMO_SCENARIOS`'s numbers, not `SAO_LUCAS_DEMO_SCENARIOS`'s. Repeat with `Beatriz Lima` / `zelo-beatriz-2026` and confirm the opposite.

- [ ] **Step 8: Update `prisma/README.md`**

In `apps/api/prisma/README.md`, update the "Seeding simulated manager-dashboard data" and "Seeding manager accounts" sections to describe the new multi-institution shape: mention that `prisma:seed` now upserts `INSTITUTION_SEED_ROSTER` first (two institutions: "Zelo Demo", matching the id the `add_institution_scoping` migration backfilled existing rows onto, and "Hospital São Lucas (Demo)" for local cross-tenant testing), that `Signal` rows are now scoped per institution via `ZELO_DEMO_SCENARIOS`/`SAO_LUCAS_DEMO_SCENARIOS`, and update the manager roster table to add the `Beatriz Lima` / `Hospital São Lucas (Demo)` row alongside its `MANAGER_SEED_PASSWORD_BEATRIZ` override env var.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/seed-data.ts apps/api/prisma/seed-data.test.ts apps/api/prisma/seed.ts apps/api/prisma/README.md
git commit -m "feat(api): seed two institutions with isolated manager accounts and signal data"
```

---

## Self-review notes

- **Spec coverage:** §3 (data model) → Task 1. §5 aggregation pipeline's "Zelo Demo institution keeps seeded rows" note → Task 7. §6 (manager scoping) → Tasks 3–6. The design spec's §4 (device linking flow) and its `SignalDedupKey`/`POST /signals/checkin` pieces are deliberately **not** in this plan — they belong to the follow-up "real aggregation pipeline" plan, per the two-plan split agreed with the user.
- **Type consistency verified:** `ManagerRow.institutionId` (Task 3) flows into `ManagerTokenService.issue`'s third parameter (Task 3) → `DecodedManagerToken.institutionId` (Task 3) → `request.manager.institutionId` (Task 4) → `GetManagerSignalsUseCase.execute(institutionId)` / `GenerateManagerInsightUseCase.execute(managerName, institutionId)` / `GetManagerInsightHistoryUseCase.execute(institutionId)` (Task 6 controller call sites match Task 2/5 signatures exactly).
- **No placeholders:** every step has runnable code or an exact shell command; no "add error handling" or "similar to Task N" shortcuts.
