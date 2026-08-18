# Institution Linking and Real Signal Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a médico optionally link their device to their hospital via an invite code, and make every completed self-assessment fire an anonymous, deduplicated, aggregable signal toward that hospital's real `Signal` counters — replacing the fully-synthetic seed data with the first real data path into the manager dashboard.

**Architecture:** This is Plan 2 of 2 implementing `docs/superpowers/specs/2026-08-02-multi-institution-data-partitioning-design.md`. Plan 1 (already merged) built the `Institution`/`Manager.institutionId`/`Signal` data model and manager-side scoping. This plan adds: (1) a public backend endpoint to resolve an invite code to an institution, (2) a public backend endpoint that records an anonymous, deduplicated check-in against `Signal`, (3) a frontend device-local store (no login, no server-side identity) holding the linked institution/department/device id, (4) a linking UI reachable from **Você** and a **Home** banner, and (5) wiring the existing assessment-submission flow to fire the new check-in in parallel with — and fully decoupled from — the existing encrypted-assessment submission.

**Tech Stack:** NestJS + Prisma (backend), Vitest + supertest, Node `crypto` (SHA-256 dedup hashing), React + react-router + TanStack Query + Zustand `persist` (frontend), Testing Library.

## Global Constraints

- **Linking is optional and never gates core functionality.** Self-assessment and chat work exactly as they do today whether or not a device is linked. A device with no link simply never fires the new check-in endpoint.
- **No per-person row is ever persisted for the check-in pipeline.** The backend only ever increments `Signal` counters (institution+department+week) and inserts a one-way dedup hash (`SignalDedupKey`) — never a row that identifies who submitted.
- **The check-in payload and the encrypted-assessment payload are two fully decoupled writes.** No `userId`, no `scaleType`, no link whatsoever between a `POST /signals/checkin` call and the `Assessment.ciphertext` row from the same submission. `SubmitAssessmentUseCase` (the existing encrypted-submission path) is not modified by this plan — the new check-in is orchestrated entirely from the calling hook, alongside it, never inside it.
- **"Concerning" is a symptom-severity signal, not the crisis-risk signal.** It is `totalScore > 9` (matches both PHQ-9 and GAD-7's "Leve" band ceiling in `apps/web/src/presentation/lib/band-for.ts`, and the "Moderado or worse" rule already documented for the demo data in `apps/api/prisma/README.md`). This is a different computation from `riskSignal` (PHQ-9 item 9 only, used for crisis escalation) — the two must never be conflated.
- **The device-local link data (`institutionId`, `department`, `deviceSignalId`) lives only in the browser** (`localStorage`, via Zustand `persist` — this codebase's established device-local pattern, see `apps/web/src/stores/consent.store.ts`/`followup.store.ts`), never transmitted as an identity, never associated server-side with anything else about the device.
- **The dedup key is a one-way hash**: `sha256(deviceSignalId + institutionId + department + weekStart)`. Because `weekStart` is part of the hash input, the same device can never be correlated across two different weeks from `SignalDedupKey` alone.
- **This Bash tool runs non-interactively.** `prisma migrate dev` (interactive) hard-errors here — use `prisma migrate dev --create-only --name <name>` to generate the migration file, then `prisma migrate deploy` to apply it (established in Plan 1's Task 1). Local Docker Postgres: `postgresql://zelo:devpassword@localhost:5432/zelo?schema=public` for both `DATABASE_URL` and `DIRECT_DATABASE_URL`; start it with `docker compose -f docker/docker-compose.yml up -d postgres` if not already running.
- **No frontend changes touch `SubmitAssessmentUseCase`, `ScoreAssessmentUseCase`, or any assessment page** (`Phq9AssessmentPage.tsx`, `Gad7AssessmentPage.tsx`, `AssessmentResultPage.tsx`) — all new orchestration lives in `useSubmitAssessment.ts` and a new, independently-testable use-case.
- Every new file follows the exact conventions already established in this codebase: backend kebab-case files with role suffixes (`*.use-case.ts`, `*.port.ts`, `*.repository.ts`, `*.controller.ts`), DI tokens as `Symbol("SCREAMING_SNAKE_NAME")` exported alongside the port interface, explicit `.ts` import extensions (ESM); frontend kebab-case files (`*.usecase.ts` — no hyphen before "case", `*.port.ts`, `http-*.adapter.ts`, `*.store.ts`), PascalCase classes/components, `@/` path alias, no import extensions.
- Thin Prisma-passthrough repositories are not unit-tested individually (existing convention) — but `PrismaSignalCheckinRepository` has real branching logic (dedup-conflict handling, FK-violation mapping) and is verified manually against real Postgres in Task 3, not skipped.

---

### Task 1: `SignalDedupKey` schema and migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_signal_dedup_keys/migration.sql`

**Interfaces:**

- Produces (used by Task 3): Prisma model `SignalDedupKey { dedupKey (id), createdAt }`, mapped to table `signal_dedup_keys`.

- [ ] **Step 1: Add the model**

Append to `apps/api/prisma/schema.prisma`:

```prisma
model SignalDedupKey {
  dedupKey  String   @id
  createdAt DateTime @default(now())

  @@map("signal_dedup_keys")
}
```

- [ ] **Step 2: Generate and apply the migration**

Ensure local Postgres is running:

```bash
docker compose -f docker/docker-compose.yml up -d postgres
```

From `apps/api/`:

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate dev --create-only --name add_signal_dedup_keys
```

Expected: a new `apps/api/prisma/migrations/<timestamp>_add_signal_dedup_keys/migration.sql`, auto-generated correctly this time (this is a pure additive `CREATE TABLE`, no backfill needed, so — unlike Plan 1's Task 1 — the auto-generated SQL should already be correct). Open it and confirm it contains exactly:

```sql
-- CreateTable
CREATE TABLE "signal_dedup_keys" (
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_dedup_keys_pkey" PRIMARY KEY ("dedupKey")
);
```

If Prisma generated something functionally equivalent but textually different (e.g. different constraint name casing), leave it as generated — don't hand-edit a correct auto-generated migration.

Apply it:

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate deploy
```

- [ ] **Step 3: Verify and regenerate the client**

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "\dt"
```

Expected: `signal_dedup_keys` now appears alongside the existing tables.

```bash
pnpm --filter @zelo/api exec prisma generate
pnpm --filter @zelo/api exec tsc --noEmit
```

Expected: clean (this is a brand-new, unreferenced table — nothing in existing code touches it yet, so no errors anywhere).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add SignalDedupKey model and migration"
```

---

### Task 2: Institution lookup module (backend)

**Files:**

- Create: `apps/api/src/modules/institution/application/ports/institution-repository.port.ts`
- Create: `apps/api/src/modules/institution/application/use-cases/get-institution-by-invite-code.use-case.ts`
- Test: `apps/api/src/modules/institution/application/use-cases/get-institution-by-invite-code.use-case.test.ts`
- Create: `apps/api/src/modules/institution/infrastructure/persistence/prisma-institution.repository.ts`
- Create: `apps/api/src/modules/institution/infrastructure/institution.controller.ts`
- Test: `apps/api/src/modules/institution/infrastructure/institution.controller.test.ts`
- Create: `apps/api/src/modules/institution/institution.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: `Institution` Prisma model (already exists from Plan 1 — `id`, `name` unique, `inviteCode` unique).
- Produces: `GET /institutions/by-code/:code` → `200 { id, name }` on match, `404` on no match, no authentication.

- [ ] **Step 1: Write the failing use-case test**

Create `apps/api/src/modules/institution/application/use-cases/get-institution-by-invite-code.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GetInstitutionByInviteCodeUseCase } from "./get-institution-by-invite-code.use-case.ts";
import type { InstitutionRepository, InstitutionRow } from "../ports/institution-repository.port.ts";

class FakeInstitutionRepository implements InstitutionRepository {
  constructor(private readonly rows: InstitutionRow[]) {}
  async findByInviteCode(inviteCode: string): Promise<InstitutionRow | null> {
    return this.rows.find((row) => row.inviteCode === inviteCode) ?? null;
  }
}

describe("GetInstitutionByInviteCodeUseCase", () => {
  it("returns the matching institution", async () => {
    const repository = new FakeInstitutionRepository([
      { id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026" },
    ]);
    const useCase = new GetInstitutionByInviteCodeUseCase(repository);

    const result = await useCase.execute("sao-lucas-2026");

    expect(result).toEqual({ id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026" });
  });

  it("returns null for an unknown code", async () => {
    const repository = new FakeInstitutionRepository([]);
    const useCase = new GetInstitutionByInviteCodeUseCase(repository);

    const result = await useCase.execute("unknown-code");

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api test get-institution-by-invite-code -- --run`
Expected: FAIL — the port and use-case files don't exist yet.

- [ ] **Step 3: Write the port and use-case**

Create `apps/api/src/modules/institution/application/ports/institution-repository.port.ts`:

```ts
export interface InstitutionRow {
  id: string;
  name: string;
  inviteCode: string;
}

export interface InstitutionRepository {
  findByInviteCode(inviteCode: string): Promise<InstitutionRow | null>;
}

export const INSTITUTION_REPOSITORY = Symbol("INSTITUTION_REPOSITORY");
```

Create `apps/api/src/modules/institution/application/use-cases/get-institution-by-invite-code.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import {
  INSTITUTION_REPOSITORY,
  type InstitutionRepository,
  type InstitutionRow,
} from "../ports/institution-repository.port.ts";

@Injectable()
export class GetInstitutionByInviteCodeUseCase {
  constructor(@Inject(INSTITUTION_REPOSITORY) private readonly repository: InstitutionRepository) {}

  async execute(inviteCode: string): Promise<InstitutionRow | null> {
    return this.repository.findByInviteCode(inviteCode);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/api test get-institution-by-invite-code -- --run`
Expected: PASS (2/2).

- [ ] **Step 5: Write the failing controller test**

Create `apps/api/src/modules/institution/infrastructure/institution.controller.test.ts`:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { InstitutionController } from "./institution.controller.ts";
import { GetInstitutionByInviteCodeUseCase } from "../application/use-cases/get-institution-by-invite-code.use-case.ts";
import { INSTITUTION_REPOSITORY } from "../application/ports/institution-repository.port.ts";
import type { InstitutionRepository, InstitutionRow } from "../application/ports/institution-repository.port.ts";

class FakeInstitutionRepository implements InstitutionRepository {
  public rows: InstitutionRow[] = [];
  async findByInviteCode(inviteCode: string): Promise<InstitutionRow | null> {
    return this.rows.find((row) => row.inviteCode === inviteCode) ?? null;
  }
}

describe("institution controller", () => {
  let app: INestApplication;
  let repository: FakeInstitutionRepository;

  beforeAll(async () => {
    repository = new FakeInstitutionRepository();
    repository.rows = [{ id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026" }];
    const moduleRef = await Test.createTestingModule({
      controllers: [InstitutionController],
      providers: [
        GetInstitutionByInviteCodeUseCase,
        { provide: INSTITUTION_REPOSITORY, useValue: repository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /institutions/by-code/:code returns the institution for a known code", async () => {
    const response = await request(app.getHttpServer()).get("/institutions/by-code/sao-lucas-2026");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "inst-1", name: "Hospital São Lucas" });
  });

  it("GET /institutions/by-code/:code returns 404 for an unknown code", async () => {
    const response = await request(app.getHttpServer()).get("/institutions/by-code/unknown-code");

    expect(response.status).toBe(404);
  });

  it("GET /institutions/by-code/:code requires no authentication", async () => {
    const response = await request(app.getHttpServer()).get("/institutions/by-code/sao-lucas-2026");

    expect(response.status).not.toBe(401);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @zelo/api test institution.controller -- --run`
Expected: FAIL — `institution.controller.ts` doesn't exist yet.

- [ ] **Step 7: Write the controller, repository, and module**

Create `apps/api/src/modules/institution/infrastructure/persistence/prisma-institution.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { InstitutionRepository, InstitutionRow } from "../../application/ports/institution-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaInstitutionRepository implements InstitutionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByInviteCode(inviteCode: string): Promise<InstitutionRow | null> {
    const row = await this.prisma.institution.findUnique({ where: { inviteCode } });
    if (!row) return null;
    return { id: row.id, name: row.name, inviteCode: row.inviteCode };
  }
}
```

Create `apps/api/src/modules/institution/infrastructure/institution.controller.ts`:

```ts
import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { GetInstitutionByInviteCodeUseCase } from "../application/use-cases/get-institution-by-invite-code.use-case.ts";

@Controller("institutions")
export class InstitutionController {
  constructor(
    @Inject(GetInstitutionByInviteCodeUseCase)
    private readonly getInstitutionByInviteCode: GetInstitutionByInviteCodeUseCase,
  ) {}

  @Get("by-code/:code")
  async byCode(@Param("code") code: string): Promise<{ id: string; name: string }> {
    const institution = await this.getInstitutionByInviteCode.execute(code);
    if (!institution) {
      throw new NotFoundException();
    }
    return { id: institution.id, name: institution.name };
  }
}
```

Create `apps/api/src/modules/institution/institution.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { InstitutionController } from "./infrastructure/institution.controller.ts";
import { GetInstitutionByInviteCodeUseCase } from "./application/use-cases/get-institution-by-invite-code.use-case.ts";
import { PrismaInstitutionRepository } from "./infrastructure/persistence/prisma-institution.repository.ts";
import { INSTITUTION_REPOSITORY } from "./application/ports/institution-repository.port.ts";

@Module({
  controllers: [InstitutionController],
  providers: [
    GetInstitutionByInviteCodeUseCase,
    { provide: INSTITUTION_REPOSITORY, useClass: PrismaInstitutionRepository },
  ],
})
export class InstitutionModule {}
```

Register it in `apps/api/src/app.module.ts` — add the import and add `InstitutionModule` to the `imports` array (alongside `AssessmentModule`, `ManagerModule`):

```ts
import { InstitutionModule } from "./modules/institution/institution.module.ts";
```

```ts
    AssessmentModule,
    ManagerModule,
    InstitutionModule,
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @zelo/api test institution -- --run`
Expected: PASS (5/5 across both test files).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/institution apps/api/src/app.module.ts
git commit -m "feat(api): add public institution lookup-by-invite-code endpoint"
```

---

### Task 3: Real signal check-in module (backend)

**Files:**

- Create: `apps/api/src/shared/date/start-of-iso-week.ts`
- Test: `apps/api/src/shared/date/start-of-iso-week.test.ts`
- Create: `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`
- Create: `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts`
- Test: `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.test.ts`
- Create: `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts`
- Create: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts`
- Test: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`
- Create: `apps/api/src/modules/signal-checkin/signal-checkin.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: `Signal` and `SignalDedupKey` Prisma models (Plan 1 and Task 1 respectively).
- Produces: `POST /signals/checkin` → `204` on success (deduped or not — indistinguishable to the caller), `400` on a malformed body or an unknown `institutionId`, no authentication.

- [ ] **Step 1: Write the failing test for the ISO-week helper**

Create `apps/api/src/shared/date/start-of-iso-week.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { startOfIsoWeek } from "./start-of-iso-week.ts";

describe("startOfIsoWeek", () => {
  it("resolves a Wednesday back to that week's Monday", () => {
    const wednesday = new Date("2026-07-08T15:00:00.000Z");
    expect(startOfIsoWeek(wednesday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("resolves a Sunday back to that same week's Monday, not forward", () => {
    const sunday = new Date("2026-07-12T15:00:00.000Z");
    expect(startOfIsoWeek(sunday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("resolves a Monday to itself, at midnight UTC", () => {
    const monday = new Date("2026-07-06T09:30:00.000Z");
    expect(startOfIsoWeek(monday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api test start-of-iso-week -- --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `apps/api/src/shared/date/start-of-iso-week.ts`:

```ts
/** Monday 00:00 UTC of the ISO week containing `date`. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday(0) -> 7, so Monday(1) is always the start
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/api test start-of-iso-week -- --run`
Expected: PASS (3/3).

- [ ] **Step 5: Write the failing use-case test**

Create `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordSignalCheckinUseCase } from "./record-signal-checkin.use-case.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../ports/signal-checkin-repository.port.ts";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public lastParams: RecordCheckinParams | null = null;
  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    this.lastParams = params;
  }
}

const MONDAY = new Date("2026-07-06T00:00:00.000Z");
const WEDNESDAY_SAME_WEEK = new Date("2026-07-08T15:00:00.000Z");
const NEXT_MONDAY = new Date("2026-07-13T00:00:00.000Z");

describe("RecordSignalCheckinUseCase", () => {
  it("computes weekStart as the Monday of the given date and forwards institutionId/department/concerning", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);

    await useCase.execute(
      { institutionId: "inst-1", department: "UTI", concerning: true, deviceSignalId: "device-1" },
      WEDNESDAY_SAME_WEEK,
    );

    expect(repository.lastParams).toMatchObject({
      institutionId: "inst-1",
      department: "UTI",
      concerning: true,
      weekStart: MONDAY,
    });
  });

  it("produces a deterministic dedupKey for the same inputs", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);
    const input = { institutionId: "inst-1", department: "UTI", concerning: false, deviceSignalId: "device-1" };

    await useCase.execute(input, WEDNESDAY_SAME_WEEK);
    const firstKey = repository.lastParams!.dedupKey;

    await useCase.execute(input, WEDNESDAY_SAME_WEEK);
    const secondKey = repository.lastParams!.dedupKey;

    const expectedKey = createHash("sha256")
      .update(`device-1:inst-1:UTI:${MONDAY.toISOString()}`)
      .digest("hex");
    expect(firstKey).toBe(expectedKey);
    expect(secondKey).toBe(expectedKey);
  });

  it("produces a different dedupKey for a different week, same device/institution/department", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);
    const input = { institutionId: "inst-1", department: "UTI", concerning: false, deviceSignalId: "device-1" };

    await useCase.execute(input, WEDNESDAY_SAME_WEEK);
    const weekOneKey = repository.lastParams!.dedupKey;

    await useCase.execute(input, NEXT_MONDAY);
    const weekTwoKey = repository.lastParams!.dedupKey;

    expect(weekOneKey).not.toBe(weekTwoKey);
  });

  it("produces a different dedupKey for a different deviceSignalId, same everything else", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);

    await useCase.execute(
      { institutionId: "inst-1", department: "UTI", concerning: false, deviceSignalId: "device-1" },
      WEDNESDAY_SAME_WEEK,
    );
    const deviceOneKey = repository.lastParams!.dedupKey;

    await useCase.execute(
      { institutionId: "inst-1", department: "UTI", concerning: false, deviceSignalId: "device-2" },
      WEDNESDAY_SAME_WEEK,
    );
    const deviceTwoKey = repository.lastParams!.dedupKey;

    expect(deviceOneKey).not.toBe(deviceTwoKey);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @zelo/api test record-signal-checkin -- --run`
Expected: FAIL — the port and use-case files don't exist yet.

- [ ] **Step 7: Write the port and use-case**

Create `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`:

```ts
export interface RecordCheckinParams {
  institutionId: string;
  department: string;
  weekStart: Date;
  concerning: boolean;
  dedupKey: string;
}

export interface SignalCheckinRepository {
  recordCheckin(params: RecordCheckinParams): Promise<void>;
}

export const SIGNAL_CHECKIN_REPOSITORY = Symbol("SIGNAL_CHECKIN_REPOSITORY");

// Thrown by the repository when institutionId doesn't match any real Institution
// (a foreign-key violation on the Signal insert/update) — mapped to a 400 by the controller.
export class UnknownInstitutionError extends Error {}
```

Create `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts`:

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
  department: string;
  concerning: boolean;
  deviceSignalId: string;
}

@Injectable()
export class RecordSignalCheckinUseCase {
  constructor(@Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository) {}

  async execute(input: RecordSignalCheckinInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(`${input.deviceSignalId}:${input.institutionId}:${input.department}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordCheckin({
      institutionId: input.institutionId,
      department: input.department,
      weekStart,
      concerning: input.concerning,
      dedupKey,
    });
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @zelo/api test record-signal-checkin -- --run`
Expected: PASS (4/4).

- [ ] **Step 9: Write the failing controller test**

Create `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SignalCheckinController } from "./signal-checkin.controller.ts";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  UnknownInstitutionError,
} from "../application/ports/signal-checkin-repository.port.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../application/ports/signal-checkin-repository.port.ts";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordCheckinParams[] = [];
  public shouldThrowUnknownInstitution = false;
  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    if (this.shouldThrowUnknownInstitution) {
      throw new UnknownInstitutionError();
    }
    this.calls.push(params);
  }
}

describe("signal-checkin controller", () => {
  let app: INestApplication;
  let repository: FakeSignalCheckinRepository;

  beforeAll(async () => {
    repository = new FakeSignalCheckinRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [SignalCheckinController],
      providers: [
        RecordSignalCheckinUseCase,
        { provide: SIGNAL_CHECKIN_REPOSITORY, useValue: repository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /signals/checkin returns 204 for a valid body and forwards it to the repository", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "inst-1",
      department: "UTI",
      concerning: true,
      deviceSignalId: "device-1",
    });

    expect(response.status).toBe(204);
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]).toMatchObject({ institutionId: "inst-1", department: "UTI", concerning: true });
  });

  it("POST /signals/checkin returns 400 for a malformed body", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({ institutionId: "inst-1" });

    expect(response.status).toBe(400);
  });

  it("POST /signals/checkin returns 400 when the institution is unknown", async () => {
    repository.shouldThrowUnknownInstitution = true;
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "does-not-exist",
      department: "UTI",
      concerning: false,
      deviceSignalId: "device-1",
    });

    expect(response.status).toBe(400);
    repository.shouldThrowUnknownInstitution = false;
  });

  it("POST /signals/checkin requires no authentication", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "inst-1",
      department: "UTI",
      concerning: false,
      deviceSignalId: "device-2",
    });

    expect(response.status).not.toBe(401);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm --filter @zelo/api test signal-checkin.controller -- --run`
Expected: FAIL — the controller doesn't exist yet.

- [ ] **Step 11: Write the repository, controller, and module**

Create `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../../application/ports/signal-checkin-repository.port.ts";
import { UnknownInstitutionError } from "../../application/ports/signal-checkin-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const FOREIGN_KEY_VIOLATION = "P2003";

@Injectable()
export class PrismaSignalCheckinRepository implements SignalCheckinRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    try {
      await this.prisma.signalDedupKey.create({ data: { dedupKey: params.dedupKey } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        // Already counted this device/institution/department/week — no-op, still a
        // success to the caller (the client can't distinguish a fresh count from a
        // deduped one, by design).
        return;
      }
      throw error;
    }

    try {
      await this.prisma.signal.upsert({
        where: {
          institutionId_department_weekStart: {
            institutionId: params.institutionId,
            department: params.department,
            weekStart: params.weekStart,
          },
        },
        update: { checkIns: { increment: 1 }, concerning: { increment: params.concerning ? 1 : 0 } },
        create: {
          institutionId: params.institutionId,
          department: params.department,
          weekStart: params.weekStart,
          checkIns: 1,
          concerning: params.concerning ? 1 : 0,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION) {
        throw new UnknownInstitutionError();
      }
      throw error;
    }
  }
}
```

Create `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts`:

```ts
import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import { UnknownInstitutionError } from "../application/ports/signal-checkin-repository.port.ts";

const SignalCheckinSchema = z.object({
  institutionId: z.string().min(1),
  department: z.string().min(1).max(200),
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
      if (error instanceof UnknownInstitutionError) {
        throw new BadRequestException("Unknown institutionId");
      }
      throw error;
    }
  }
}
```

Create `apps/api/src/modules/signal-checkin/signal-checkin.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { SignalCheckinController } from "./infrastructure/signal-checkin.controller.ts";
import { RecordSignalCheckinUseCase } from "./application/use-cases/record-signal-checkin.use-case.ts";
import { PrismaSignalCheckinRepository } from "./infrastructure/persistence/prisma-signal-checkin.repository.ts";
import { SIGNAL_CHECKIN_REPOSITORY } from "./application/ports/signal-checkin-repository.port.ts";

@Module({
  controllers: [SignalCheckinController],
  providers: [
    RecordSignalCheckinUseCase,
    { provide: SIGNAL_CHECKIN_REPOSITORY, useClass: PrismaSignalCheckinRepository },
  ],
})
export class SignalCheckinModule {}
```

Register it in `apps/api/src/app.module.ts` (import + add to the `imports` array, alongside `InstitutionModule`):

```ts
import { SignalCheckinModule } from "./modules/signal-checkin/signal-checkin.module.ts";
```

```ts
    InstitutionModule,
    SignalCheckinModule,
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @zelo/api test signal-checkin -- --run`
Expected: PASS (4/4).

- [ ] **Step 13: Manually verify the dedup mechanism against real Postgres**

This step exists because `PrismaSignalCheckinRepository` has real branching logic (a live unique-constraint conflict, a live foreign-key violation) that a fake repository in the tests above cannot prove — only a real database enforces those constraints. This verification is self-contained — it does not depend on Plan 1's seed script having already run in this environment.

With local Postgres running, insert a throwaway institution to check in against:

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "INSERT INTO institutions (id, name, \"inviteCode\", \"createdAt\") VALUES ('manual-test-institution', 'Manual Test Institution', 'manual-test-2026', now());"
```

With the API running locally (`pnpm --filter @zelo/api dev` or equivalent), fire the same check-in twice:

```bash
curl -s -X POST http://localhost:3000/signals/checkin -H "Content-Type: application/json" \
  -d "{\"institutionId\":\"manual-test-institution\",\"department\":\"Manual Test Dept\",\"concerning\":true,\"deviceSignalId\":\"manual-test-device\"}"
curl -s -X POST http://localhost:3000/signals/checkin -H "Content-Type: application/json" \
  -d "{\"institutionId\":\"manual-test-institution\",\"department\":\"Manual Test Dept\",\"concerning\":true,\"deviceSignalId\":\"manual-test-device\"}"
```

Both requests should return `204`. Then confirm only ONE was actually counted:

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "SELECT \"checkIns\", concerning FROM signals WHERE department = 'Manual Test Dept';"
```

Expected: `checkIns = 1`, `concerning = 1` (not 2) — the second identical request was deduped.

Then confirm an unknown institution is rejected:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/signals/checkin -H "Content-Type: application/json" \
  -d '{"institutionId":"does-not-exist","department":"UTI","concerning":false,"deviceSignalId":"manual-test-device-2"}'
```

Expected: `400`.

Clean up everything this verification created:

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "DELETE FROM signals WHERE \"institutionId\" = 'manual-test-institution';"
docker exec zelo-postgres psql -U zelo -d zelo -c "DELETE FROM signal_dedup_keys;"
docker exec zelo-postgres psql -U zelo -d zelo -c "DELETE FROM institutions WHERE id = 'manual-test-institution';"
```

(Deleting all `signal_dedup_keys` rows is safe here — the table has no foreign keys pointing to it and no other data depends on it existing across this verification step. Delete `signals` and the throwaway `institutions` row before deleting the dedup keys isn't order-sensitive either way, but doing it in this order means `institutions`' delete never hits a foreign-key conflict from a leftover `signals` row.)

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/shared/date apps/api/src/modules/signal-checkin apps/api/src/app.module.ts
git commit -m "feat(api): add real signal check-in endpoint with device-scoped dedup"
```

---

### Task 4: Institution-link store and the "concerning" score helper (frontend)

**Files:**

- Create: `apps/web/src/stores/institution-link.store.ts`
- Test: `apps/web/src/stores/institution-link.store.test.ts`
- Create: `apps/web/src/domain/is-concerning-score.ts`
- Test: `apps/web/src/domain/is-concerning-score.test.ts`

**Interfaces:**

- Produces (used by Tasks 5, 6, 7, 8): `useInstitutionLinkStore` — state `{ institutionId, institutionName, department, deviceSignalId }` (all `string | null`), actions `link({ institutionId, institutionName, department }): void` and `unlink(): void`.
- Produces (used by Task 8): `isConcerningScore(totalScore: number): boolean`.

- [ ] **Step 1: Write the failing store test**

Create `apps/web/src/stores/institution-link.store.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useInstitutionLinkStore } from "./institution-link.store";

describe("useInstitutionLinkStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
    });
  });

  it("starts unlinked", () => {
    const state = useInstitutionLinkStore.getState();
    expect(state.institutionId).toBeNull();
    expect(state.institutionName).toBeNull();
    expect(state.department).toBeNull();
    expect(state.deviceSignalId).toBeNull();
  });

  it("link() sets institutionId, institutionName, department, and generates a deviceSignalId", () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", department: "UTI" });

    const state = useInstitutionLinkStore.getState();
    expect(state.institutionId).toBe("inst-1");
    expect(state.institutionName).toBe("Hospital São Lucas");
    expect(state.department).toBe("UTI");
    expect(state.deviceSignalId).not.toBeNull();
  });

  it("link() persists to localStorage under the zelo.institution-link key", () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", department: "UTI" });

    const persisted = JSON.parse(localStorage.getItem("zelo.institution-link")!);
    expect(persisted.state.institutionId).toBe("inst-1");
  });

  it("unlink() clears every field, including deviceSignalId", () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", department: "UTI" });

    useInstitutionLinkStore.getState().unlink();

    const state = useInstitutionLinkStore.getState();
    expect(state.institutionId).toBeNull();
    expect(state.institutionName).toBeNull();
    expect(state.department).toBeNull();
    expect(state.deviceSignalId).toBeNull();
  });

  it("linking twice generates a fresh deviceSignalId each time (only relinking after an explicit unlink matters in practice)", () => {
    const generateSpy = vi.spyOn(globalThis.crypto, "randomUUID");
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "A", department: "UTI" });
    const firstId = useInstitutionLinkStore.getState().deviceSignalId;

    useInstitutionLinkStore.getState().link({ institutionId: "inst-2", institutionName: "B", department: "Pronto-socorro" });
    const secondId = useInstitutionLinkStore.getState().deviceSignalId;

    expect(firstId).not.toBe(secondId);
    expect(generateSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web test institution-link.store -- --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the store**

Create `apps/web/src/stores/institution-link.store.ts`:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface InstitutionLinkState {
  institutionId: string | null;
  institutionName: string | null;
  department: string | null;
  deviceSignalId: string | null;
  link: (params: { institutionId: string; institutionName: string; department: string }) => void;
  unlink: () => void;
}

export const useInstitutionLinkStore = create<InstitutionLinkState>()(
  persist(
    (set) => ({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
      link: ({ institutionId, institutionName, department }) =>
        set({ institutionId, institutionName, department, deviceSignalId: crypto.randomUUID() }),
      unlink: () => set({ institutionId: null, institutionName: null, department: null, deviceSignalId: null }),
    }),
    { name: "zelo.institution-link", storage: createJSONStorage(() => localStorage) },
  ),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/web test institution-link.store -- --run`
Expected: PASS (5/5).

- [ ] **Step 5: Write the failing test for the concerning-score helper**

Create `apps/web/src/domain/is-concerning-score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isConcerningScore } from "./is-concerning-score";

describe("isConcerningScore", () => {
  it("is false at the Leve/Moderado boundary (score 9)", () => {
    expect(isConcerningScore(9)).toBe(false);
  });

  it("is true just above the boundary (score 10, Moderado)", () => {
    expect(isConcerningScore(10)).toBe(true);
  });

  it("is false for a low score", () => {
    expect(isConcerningScore(2)).toBe(false);
  });

  it("is true for a high score", () => {
    expect(isConcerningScore(24)).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @zelo/web test is-concerning-score -- --run`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the helper**

Create `apps/web/src/domain/is-concerning-score.ts`:

```ts
// Matches both PHQ-9 and GAD-7's "Leve" band ceiling (apps/web/src/presentation/lib/band-for.ts)
// and the "Moderado or worse" rule already documented for the manager dashboard's demo
// data in apps/api/prisma/README.md — a score above this counts toward the anonymous,
// aggregable institution signal. This is deliberately NOT the same thing as
// ScoreAssessmentUseCase's riskSignal (PHQ-9 item 9 only, used for crisis escalation) —
// see docs/superpowers/specs/identity-and-aggregation.md §4.
export const CONCERNING_SCORE_THRESHOLD = 9;

export function isConcerningScore(totalScore: number): boolean {
  return totalScore > CONCERNING_SCORE_THRESHOLD;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @zelo/web test is-concerning-score -- --run`
Expected: PASS (4/4).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/stores/institution-link.store.ts apps/web/src/stores/institution-link.store.test.ts \
        apps/web/src/domain/is-concerning-score.ts apps/web/src/domain/is-concerning-score.test.ts
git commit -m "feat(web): add institution-link store and the concerning-score helper"
```

---

### Task 5: Institution lookup port/adapter/use-case, `LinkInstitutionPage`, and its route

**Files:**

- Create: `apps/web/src/ports/institution-link.port.ts`
- Create: `apps/web/src/infrastructure/http/http-institution-link.adapter.ts`
- Create: `apps/web/src/use-cases/lookup-institution.usecase.ts`
- Test: `apps/web/src/use-cases/lookup-institution.usecase.test.ts`
- Create: `apps/web/src/presentation/hooks/useLookupInstitution.ts`
- Create: `apps/web/src/presentation/pages/LinkInstitutionPage.tsx`
- Test: `apps/web/src/presentation/pages/LinkInstitutionPage.test.tsx`
- Modify: `apps/web/src/app/container.ts`
- Modify: `apps/web/src/presentation/lib/routes.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/router.test.tsx`

**Interfaces:**

- Consumes: `GET /institutions/by-code/:code` (Task 2), `useInstitutionLinkStore` (Task 4).
- Produces (used by Task 6): route `routes.linkInstitution` (`/you/link`) reachable from **Você**.

- [ ] **Step 1: Write the failing use-case test**

Create `apps/web/src/use-cases/lookup-institution.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LookupInstitutionUseCase } from "./lookup-institution.usecase";
import type { InstitutionLinkPort, InstitutionLookupResult } from "@/ports/institution-link.port";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

class FakeInstitutionLinkPort implements InstitutionLinkPort {
  public lastCode: string | null = null;
  constructor(private readonly result: InstitutionLookupResult | Error) {}
  async lookupByCode(code: string): Promise<InstitutionLookupResult> {
    this.lastCode = code;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("LookupInstitutionUseCase", () => {
  it("returns the institution on success, forwarding the code", async () => {
    const port = new FakeInstitutionLinkPort({ id: "inst-1", name: "Hospital São Lucas" });
    const useCase = new LookupInstitutionUseCase(port);

    const result = await useCase.execute("sao-lucas-2026");

    expect(result).toEqual({ id: "inst-1", name: "Hospital São Lucas" });
    expect(port.lastCode).toBe("sao-lucas-2026");
  });

  it("propagates InstitutionNotFoundError for an unknown code", async () => {
    const useCase = new LookupInstitutionUseCase(new FakeInstitutionLinkPort(new InstitutionNotFoundError()));

    await expect(useCase.execute("unknown")).rejects.toBeInstanceOf(InstitutionNotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web test lookup-institution -- --run`
Expected: FAIL — the port and use-case files don't exist yet.

- [ ] **Step 3: Write the port, adapter, and use-case**

Create `apps/web/src/ports/institution-link.port.ts`:

```ts
import { z } from "zod";

export const InstitutionLookupResultSchema = z.object({ id: z.string(), name: z.string() });
export type InstitutionLookupResult = z.infer<typeof InstitutionLookupResultSchema>;

export class InstitutionNotFoundError extends Error {}

export interface InstitutionLinkPort {
  lookupByCode(code: string): Promise<InstitutionLookupResult>;
}
```

Create `apps/web/src/infrastructure/http/http-institution-link.adapter.ts`:

```ts
import type { InstitutionLinkPort, InstitutionLookupResult } from "@/ports/institution-link.port";
import { InstitutionLookupResultSchema, InstitutionNotFoundError } from "@/ports/institution-link.port";

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
}
```

Create `apps/web/src/use-cases/lookup-institution.usecase.ts`:

```ts
import type { InstitutionLinkPort, InstitutionLookupResult } from "@/ports/institution-link.port";

export class LookupInstitutionUseCase {
  constructor(private readonly institutionLinkPort: InstitutionLinkPort) {}

  async execute(code: string): Promise<InstitutionLookupResult> {
    return this.institutionLinkPort.lookupByCode(code);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/web test lookup-institution -- --run`
Expected: PASS (2/2).

- [ ] **Step 5: Wire the use-case into the container**

In `apps/web/src/app/container.ts`, add:

```ts
import { LookupInstitutionUseCase } from "@/use-cases/lookup-institution.usecase";
import { HttpInstitutionLinkAdapter } from "@/infrastructure/http/http-institution-link.adapter";
```

```ts
export const lookupInstitutionUseCase = new LookupInstitutionUseCase(new HttpInstitutionLinkAdapter());
```

- [ ] **Step 6: Add the route constant**

In `apps/web/src/presentation/lib/routes.ts`, add one line to the `routes` object:

```ts
  linkInstitution: "/you/link",
```

- [ ] **Step 7: Write the hook**

Create `apps/web/src/presentation/hooks/useLookupInstitution.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { lookupInstitutionUseCase } from "@/app/container";

export function useLookupInstitution() {
  return useMutation({
    mutationFn: (code: string) => lookupInstitutionUseCase.execute(code),
  });
}
```

- [ ] **Step 8: Write the failing page test**

Create `apps/web/src/presentation/pages/LinkInstitutionPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkInstitutionPage } from "./LinkInstitutionPage";
import * as container from "@/app/container";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/you/link"]}>
        <Routes>
          <Route path="/you/link" element={<LinkInstitutionPage />} />
          <Route path="/you" element={<div>You screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LinkInstitutionPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
    });
  });

  it("resolves a valid code, asks for department, links, and navigates to /you", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      id: "inst-1",
      name: "Hospital São Lucas",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "sao-lucas-2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByLabelText("Setor");
    await user.type(screen.getByLabelText("Setor"), "UTI");
    await user.click(screen.getByRole("button", { name: "Concluir" }));

    expect(await screen.findByText("You screen")).toBeInTheDocument();
    expect(useInstitutionLinkStore.getState().institutionId).toBe("inst-1");
    expect(useInstitutionLinkStore.getState().institutionName).toBe("Hospital São Lucas");
    expect(useInstitutionLinkStore.getState().department).toBe("UTI");
    expect(useInstitutionLinkStore.getState().deviceSignalId).not.toBeNull();
  });

  it("shows an inline error for an unknown code, without advancing to the department step", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockRejectedValue(new InstitutionNotFoundError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "unknown-code");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Código não encontrado.");
    });
    expect(screen.queryByLabelText("Setor")).not.toBeInTheDocument();
  });

  it("disables Continuar until a code is entered", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("disables Concluir until a department is entered", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      id: "inst-1",
      name: "Hospital São Lucas",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "sao-lucas-2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByLabelText("Setor");
    expect(screen.getByRole("button", { name: "Concluir" })).toBeDisabled();
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `pnpm --filter @zelo/web test LinkInstitutionPage -- --run`
Expected: FAIL — `LinkInstitutionPage.tsx` doesn't exist yet.

- [ ] **Step 10: Write the page**

Create `apps/web/src/presentation/pages/LinkInstitutionPage.tsx`:

```tsx
import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useLookupInstitution } from "@/presentation/hooks/useLookupInstitution";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

export function LinkInstitutionPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"code" | "department">("code");
  const [code, setCode] = useState("");
  const [department, setDepartment] = useState("");
  const [institution, setInstitution] = useState<{ id: string; name: string } | null>(null);
  const lookup = useLookupInstitution();
  const link = useInstitutionLinkStore((state) => state.link);

  const handleCodeSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    lookup.mutate(code, {
      onSuccess: (result) => {
        setInstitution(result);
        setStep("department");
      },
    });
  };

  const handleDepartmentSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!institution) return;
    link({ institutionId: institution.id, institutionName: institution.name, department });
    navigate(routes.you);
  };

  const errorMessage = lookup.isError
    ? lookup.error instanceof InstitutionNotFoundError
      ? "Código não encontrado."
      : "Não foi possível verificar agora. Tente novamente."
    : null;

  if (step === "department" && institution) {
    return (
      <PhoneShell centered>
        <div className="pt-[30px]">
          <BackButton label="Voltar" onClick={() => setStep("code")} />
          <h1 className="mb-[6px] mt-4 text-h1 text-ink">Qual seu setor?</h1>
          <p className="text-caption text-muted">Vinculando a {institution.name}.</p>

          <form onSubmit={handleDepartmentSubmit}>
            <Card className="mt-5">
              <label htmlFor="department" className="text-label font-semibold text-ink-2">
                Setor
              </label>
              <input
                id="department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="Ex: UTI, Pronto-socorro"
                className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </Card>

            <div className="mt-[24px]">
              <Button type="submit" variant="primary" disabled={department.trim().length === 0}>
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

- [ ] **Step 11: Run test to verify it passes**

Run: `pnpm --filter @zelo/web test LinkInstitutionPage -- --run`
Expected: PASS (4/4).

- [ ] **Step 12: Register the route**

In `apps/web/src/app/router.tsx`, add the import:

```tsx
import { LinkInstitutionPage } from "@/presentation/pages/LinkInstitutionPage";
```

Add a new entry to `routeChildren`, right after the `you` route:

```tsx
  {
    path: "you/link",
    Component: LinkInstitutionPage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
```

- [ ] **Step 13: Add one router-flow test**

In `apps/web/src/app/router.test.tsx`, add this test immediately after the existing "an unconsented user hitting /you directly is redirected to Privacy via the loader" test (same file, uses the file's own `buildTestRouter` helper — do not construct a router inline):

```tsx
  it("an unconsented user hitting /you/link directly is redirected to Privacy via the loader", async () => {
    buildTestRouter("/you/link");
    expect(await screen.findByText("Como o Zelo protege você")).toBeInTheDocument();
  });
```

- [ ] **Step 14: Run the full router test file and the page test again**

Run: `pnpm --filter @zelo/web test router.test -- --run` and `pnpm --filter @zelo/web test LinkInstitutionPage -- --run`
Expected: both PASS.

- [ ] **Step 15: Commit**

```bash
git add apps/web/src/ports/institution-link.port.ts apps/web/src/infrastructure/http/http-institution-link.adapter.ts \
        apps/web/src/use-cases/lookup-institution.usecase.ts apps/web/src/use-cases/lookup-institution.usecase.test.ts \
        apps/web/src/presentation/hooks/useLookupInstitution.ts \
        apps/web/src/presentation/pages/LinkInstitutionPage.tsx apps/web/src/presentation/pages/LinkInstitutionPage.test.tsx \
        apps/web/src/app/container.ts apps/web/src/presentation/lib/routes.ts apps/web/src/app/router.tsx apps/web/src/app/router.test.tsx
git commit -m "feat(web): add institution invite-code linking flow and its route"
```

---

### Task 6: **Você** page integration — linked status, entry point, and unlink

**Files:**

- Modify: `apps/web/src/presentation/pages/YouPage.tsx`
- Modify: `apps/web/src/presentation/pages/YouPage.test.tsx`

**Interfaces:**

- Consumes: `useInstitutionLinkStore` (Task 4), `routes.linkInstitution` (Task 5).

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/presentation/pages/YouPage.test.tsx`, add the import and reset:

```tsx
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
```

Add to the existing `beforeEach`:

```tsx
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
    });
```

Add a route for the link page to `renderYou`'s `<Routes>` (it needs to exist for the navigation test below):

```tsx
        <Route path="/you/link" element={<div>Link institution screen</div>} />
```

Add these tests:

```tsx
  it("shows a 'link to a hospital' entry point when not linked", () => {
    renderYou();
    expect(screen.getByRole("button", { name: "Vincular a um hospital" })).toBeInTheDocument();
  });

  it("tapping the link entry point navigates to /you/link", async () => {
    renderYou();
    await userEvent.click(screen.getByRole("button", { name: "Vincular a um hospital" }));
    expect(screen.getByText("Link institution screen")).toBeInTheDocument();
  });

  it("shows the linked institution and department when linked, instead of the entry point", () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", department: "UTI" });
    renderYou();
    expect(screen.getByText("Vinculado a Hospital São Lucas")).toBeInTheDocument();
    expect(screen.getByText("UTI")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vincular a um hospital" })).not.toBeInTheDocument();
  });

  it("Desvincular clears the institution link immediately, without a confirm step", async () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", department: "UTI" });
    renderYou();

    await userEvent.click(screen.getByRole("button", { name: "Desvincular" }));

    expect(useInstitutionLinkStore.getState().institutionId).toBeNull();
    expect(screen.getByRole("button", { name: "Vincular a um hospital" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/web test YouPage -- --run`
Expected: FAIL — the new UI doesn't exist yet (old tests should still pass unchanged).

- [ ] **Step 3: Update the page**

In `apps/web/src/presentation/pages/YouPage.tsx`, add the import:

```tsx
import { Building2 } from "lucide-react";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
```

Add these two lines inside the component, alongside the existing `useConsentStore` reads:

```tsx
  const institutionName = useInstitutionLinkStore((state) => state.institutionName);
  const department = useInstitutionLinkStore((state) => state.department);
  const unlink = useInstitutionLinkStore((state) => state.unlink);
```

Insert a new `Card` right after the existing consent-status `Card` (before the "Revogar não apaga..." card), rendering one of two states:

```tsx
        <Card size="md" className="mt-[14px]">
          {institutionName ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <IconBadge icon={Building2} tone="neutral" />
                <div>
                  <p className="text-body font-extrabold text-ink">Vinculado a {institutionName}</p>
                  <p className="text-caption text-muted">{department}</p>
                </div>
              </div>
              <Button variant="outline" full={false} onClick={unlink}>
                Desvincular
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-body text-ink-2">Ainda não vinculado a nenhum hospital.</p>
              <Button variant="outline" full={false} onClick={() => navigate(routes.linkInstitution)}>
                Vincular a um hospital
              </Button>
            </div>
          )}
        </Card>
```

No confirm step for unlink (unlike consent revoke) — there's nothing to lose: relinking is instant, and nothing server-side is affected either way (per the design spec: "there is nothing to undo server-side, because nothing identifiable was ever sent").

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web test YouPage -- --run`
Expected: PASS (all, old and new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/YouPage.tsx apps/web/src/presentation/pages/YouPage.test.tsx
git commit -m "feat(web): show institution-link status and entry point on Você"
```

---

### Task 7: Home discoverability banner

**Files:**

- Modify: `apps/web/src/presentation/pages/HomePage.tsx`
- Modify: `apps/web/src/presentation/pages/HomePage.test.tsx`

**Interfaces:**

- Consumes: `useInstitutionLinkStore` (Task 4), `routes.linkInstitution` (Task 5).

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/presentation/pages/HomePage.test.tsx`, add the import:

```tsx
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
```

Add to the existing `beforeEach`:

```tsx
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
    });
```

Add a route for the link page:

```tsx
          <Route path="/you/link" element={<div>Link institution screen</div>} />
```

Add these tests:

```tsx
  it("shows the institution-link banner when no institution is linked", () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    expect(screen.getByText("Ainda não vinculado a um hospital")).toBeInTheDocument();
  });

  it("hides the institution-link banner once an institution is linked", () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", department: "UTI" });
    renderHome();
    expect(screen.queryByText("Ainda não vinculado a um hospital")).not.toBeInTheDocument();
  });

  it("tapping the banner's CTA navigates to /you/link", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    await userEvent.click(screen.getByRole("button", { name: "Vincular agora" }));
    expect(screen.getByText("Link institution screen")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/web test HomePage -- --run`
Expected: FAIL — the banner doesn't exist yet (old tests should still pass unchanged).

- [ ] **Step 3: Update the page**

In `apps/web/src/presentation/pages/HomePage.tsx`, add the import:

```tsx
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
```

Add inside the component, alongside the existing follow-up store reads:

```tsx
  const institutionId = useInstitutionLinkStore((state) => state.institutionId);
```

Insert a new conditional banner, right after the existing follow-up-prompt block (so both can independently show/hide without interfering):

```tsx
        {institutionId === null && (
          <div className="mt-4">
            <Card>
              <p className="text-body font-extrabold text-ink">Ainda não vinculado a um hospital</p>
              <p className="mt-1 text-caption text-muted">
                Vincule para aparecer nos números do seu time, de forma anônima.
              </p>
              <div className="mt-3">
                <Button variant="outline" full={false} onClick={() => navigate(routes.linkInstitution)}>
                  Vincular agora
                </Button>
              </div>
            </Card>
          </div>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web test HomePage -- --run`
Expected: PASS (all, old and new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/HomePage.tsx apps/web/src/presentation/pages/HomePage.test.tsx
git commit -m "feat(web): add Home banner nudging toward institution linking when unlinked"
```

---

### Task 8: Wire the real check-in into assessment submission

**Files:**

- Create: `apps/web/src/ports/signal-checkin.port.ts`
- Create: `apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts`
- Create: `apps/web/src/use-cases/record-signal-checkin.usecase.ts`
- Test: `apps/web/src/use-cases/record-signal-checkin.usecase.test.ts`
- Modify: `apps/web/src/app/container.ts`
- Modify: `apps/web/src/presentation/hooks/useSubmitAssessment.ts`

**Interfaces:**

- Consumes: `POST /signals/checkin` (Task 3), `isConcerningScore` (Task 4), `useInstitutionLinkStore` (Task 4), `SubmitAssessmentUseCase.execute()`'s existing return shape `{ totalScore, riskSignal, submissionSucceeded }` (unchanged, from `apps/web/src/use-cases/submit-assessment.usecase.ts` — not modified by this task).
- Produces: nothing further in this plan depends on this task — it's the last one.

- [ ] **Step 1: Write the failing use-case test**

Create `apps/web/src/use-cases/record-signal-checkin.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RecordSignalCheckinUseCase } from "./record-signal-checkin.usecase";
import type { SignalCheckinParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

class FakeSignalCheckinPort implements SignalCheckinPort {
  public calls: SignalCheckinParams[] = [];
  async checkin(params: SignalCheckinParams): Promise<void> {
    this.calls.push(params);
  }
}

describe("RecordSignalCheckinUseCase", () => {
  it("does nothing when there is no institution link", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordSignalCheckinUseCase(port);

    await useCase.execute({ link: null, concerning: true });

    expect(port.calls).toHaveLength(0);
  });

  it("calls the port with the link's fields plus concerning, when a link exists", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordSignalCheckinUseCase(port);

    await useCase.execute({
      link: { institutionId: "inst-1", department: "UTI", deviceSignalId: "device-1" },
      concerning: true,
    });

    expect(port.calls).toEqual([
      { institutionId: "inst-1", department: "UTI", deviceSignalId: "device-1", concerning: true },
    ]);
  });

  it("propagates a port failure (the caller decides whether to swallow it)", async () => {
    class ThrowingPort implements SignalCheckinPort {
      async checkin(): Promise<void> {
        throw new Error("network down");
      }
    }
    const useCase = new RecordSignalCheckinUseCase(new ThrowingPort());

    await expect(
      useCase.execute({ link: { institutionId: "inst-1", department: "UTI", deviceSignalId: "device-1" }, concerning: false }),
    ).rejects.toThrow("network down");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web test record-signal-checkin -- --run`
Expected: FAIL — the port and use-case files don't exist yet.

- [ ] **Step 3: Write the port, adapter, and use-case**

Create `apps/web/src/ports/signal-checkin.port.ts`:

```ts
export interface SignalCheckinParams {
  institutionId: string;
  department: string;
  deviceSignalId: string;
  concerning: boolean;
}

export interface SignalCheckinPort {
  checkin(params: SignalCheckinParams): Promise<void>;
}
```

Create `apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts`:

```ts
import type { SignalCheckinParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpSignalCheckinAdapter implements SignalCheckinPort {
  async checkin(params: SignalCheckinParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/signals/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`signal checkin failed with status ${response.status}`);
    }
  }
}
```

Create `apps/web/src/use-cases/record-signal-checkin.usecase.ts`:

```ts
import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  department: string;
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
      department: link.department,
      deviceSignalId: link.deviceSignalId,
      concerning,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/web test record-signal-checkin -- --run`
Expected: PASS (3/3).

- [ ] **Step 5: Wire the use-case into the container**

In `apps/web/src/app/container.ts`, add:

```ts
import { RecordSignalCheckinUseCase } from "@/use-cases/record-signal-checkin.usecase";
import { HttpSignalCheckinAdapter } from "@/infrastructure/http/http-signal-checkin.adapter";
```

```ts
export const recordSignalCheckinUseCase = new RecordSignalCheckinUseCase(new HttpSignalCheckinAdapter());
```

- [ ] **Step 6: Wire it into the submit-assessment hook**

Replace `apps/web/src/presentation/hooks/useSubmitAssessment.ts` in full:

```ts
import { useMutation } from "@tanstack/react-query";
import { submitAssessmentUseCase, recordSignalCheckinUseCase } from "@/app/container";
import type { SubmitAssessmentParams, SubmitAssessmentResult } from "@/use-cases/submit-assessment.usecase";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { isConcerningScore } from "@/domain/is-concerning-score";

export function useSubmitAssessment() {
  return useMutation({
    mutationFn: async (params: SubmitAssessmentParams): Promise<SubmitAssessmentResult> => {
      const result = await submitAssessmentUseCase.execute(params);

      // Fully decoupled from the assessment submission above: fire-and-forget,
      // and a failure here must never surface as a failed assessment submission
      // (linking is optional and never gates core functionality).
      const { institutionId, department, deviceSignalId } = useInstitutionLinkStore.getState();
      const link =
        institutionId !== null && department !== null && deviceSignalId !== null
          ? { institutionId, department, deviceSignalId }
          : null;
      void recordSignalCheckinUseCase
        .execute({ link, concerning: isConcerningScore(result.totalScore) })
        .catch(() => {});

      return result;
    },
  });
}
```

- [ ] **Step 7: Run the full frontend test suite**

Run: `pnpm --filter @zelo/web test -- --run`
Expected: PASS across the whole app — this confirms nothing in Tasks 4-8 broke any existing page (in particular, the assessment pages that call `useSubmitAssessment` should be entirely unaffected, since the hook's public contract — what it resolves to — is unchanged).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/ports/signal-checkin.port.ts apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts \
        apps/web/src/use-cases/record-signal-checkin.usecase.ts apps/web/src/use-cases/record-signal-checkin.usecase.test.ts \
        apps/web/src/app/container.ts apps/web/src/presentation/hooks/useSubmitAssessment.ts
git commit -m "feat(web): fire a real signal check-in alongside assessment submission when linked"
```

---

## Self-review notes

- **Spec coverage:** design spec §4 (device linking flow) → Tasks 4-6. §5 (real aggregation pipeline) → Tasks 1, 3, 8. §7's backend testing list (invite-code lookup, dedup no-op/increment/week-rollover) → Tasks 2-3 automated tests + Task 3's manual real-Postgres verification (the dedup-conflict and FK-violation behaviors specifically need a real database, which is why that step exists rather than being purely unit-tested). §7's frontend testing list (linking flow, Home banner, unlink) → Tasks 5-7.
- **Explicitly out of scope, confirmed absent from every task:** no `PeersPage`/doctor-login changes, no self-service institution admin panel, no department picklist (free text throughout), no `SignalDedupKey` retention/cleanup job.
- **Type consistency verified:** frontend `SignalCheckinParams` (Task 8: `{ institutionId, department, deviceSignalId, concerning }`) matches the backend zod schema field-for-field (Task 3: `SignalCheckinSchema`). `InstitutionLookupResult` (Task 5: `{ id, name }`) matches the backend controller's response shape (Task 2: `{ id, name }`, `inviteCode` deliberately dropped before it reaches the client). `RecordSignalCheckinInput`'s `link` shape in the frontend use-case (Task 8) matches exactly what `useSubmitAssessment` (Task 8, same task) reads from `useInstitutionLinkStore`.
- **No placeholders:** every step has runnable code or an exact shell/curl command; the one deliberately manual step (Task 3, Step 13) is manual because it verifies a real-database constraint that a fake repository cannot prove, not because the behavior was left unspecified.
