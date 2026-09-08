# QR code setorizado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each `Sector` its own invite code (mirroring `Institution.inviteCode`), let a QR
generated from that code resolve straight to the sector, and skip the manual sector-picker step in
the médico/aluno link flow when that happens — so a scanned sector QR can't be mismatched by hand.

**Architecture:** Backend: a new nullable, globally-unique `Sector.inviteCode` column; the existing
public `GET /institutions/by-code/:code` endpoint gains a fallback that also resolves sector codes,
returning a discriminated `{ institution, sector? }` shape; a new authenticated
`GET /admin/institutions/:id/sectors` endpoint lets the system Admin see full sector rows
(including `inviteCode`) for a chosen institution — distinct from the existing public,
active-only, code-less `GET /institutions/:id/sectors` used by the médico link flow. Frontend: a
generic `QrCodeModal` (extracted from `InstitutionQrCodeModal`) reused by a new
`SectorQrCodeModal`; a new `"confirm"` step in `useLinkInstitutionFlow`; a "Gerar QR" row action in
`ManagerAdminSectorsPage`; a new expand/collapse capability in the shared `DataTable` component,
used by `AdminInstitutionsPage` to show each institution's sectors inline.

**Tech Stack:** NestJS + Prisma (Postgres) on the API; React + TanStack Query + Zustand on the web
app; Zod for validation on both sides; Vitest for tests throughout.

**Spec:** `docs/superpowers/specs/2026-09-08-sector-scoped-qr-design.md`

## Global Constraints

- `Sector.inviteCode` is `String? @unique` (globally unique, nullable) — manually typed by the
  gestor, never auto-generated.
- Once set, `inviteCode` is immutable — enforced server-side in `updateSector`, not just by
  disabling the input client-side.
- An inactive sector (or a sector whose institution is inactive) behind a scanned code resolves to
  "not found" (404) — same treatment as an inactive institution today. No fallback to the manual
  sector list.
- The QR payload stays a bare code string — no URL, no JSON, no prefix — identical to how
  institution QR codes work today.
- Migration command for this repo: `pnpm --filter @zelo/api exec prisma migrate dev --name
  add_sector_invite_code` (run from the repo root; do not hand-write the SQL, let the CLI generate
  it).

---

### Task 1: `Sector.inviteCode` schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Test: none (schema-only; correctness is verified by every later task's repository tests)

**Interfaces:**
- Produces: `Sector.inviteCode: String | null` column, globally unique.

- [ ] **Step 1: Add the field to the schema**

Edit `apps/api/prisma/schema.prisma`. In the `Sector` model, add `inviteCode` right after
`manager`, before `createdAt`:

```prisma
model Sector {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  name          String
  isActive      Boolean     @default(true)
  managerId     String?
  manager       Manager?    @relation(fields: [managerId], references: [id])
  inviteCode    String?     @unique
  createdAt     DateTime    @default(now())

  signals       Signal[]
  notifications Notification[]

  @@unique([institutionId, name])
  @@map("sectors")
}
```

- [ ] **Step 2: Generate and run the migration**

Run (from repo root): `pnpm --filter @zelo/api exec prisma migrate dev --name
add_sector_invite_code`

Expected: Prisma generates a new folder under `apps/api/prisma/migrations/` with a
`migration.sql` containing an `ALTER TABLE "sectors" ADD COLUMN "inviteCode" TEXT;` and a
`CREATE UNIQUE INDEX "sectors_inviteCode_key" ON "sectors"("inviteCode");`, applies it to the dev
database, and regenerates the Prisma client. No prompts about data loss (the column is nullable).

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add Sector.inviteCode column"
```

---

### Task 2: `SectorRepository` — invite-code lookup and conflict handling

**Files:**
- Modify: `apps/api/src/modules/sector/application/ports/sector-repository.port.ts`
- Modify: `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`
- Test: `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.test.ts`
  (create if it does not already exist — check first; if it exists, add to it instead of
  replacing it)

**Interfaces:**
- Consumes: none beyond what the port/repository already had.
- Produces: `SectorRepository.findByInviteCode(inviteCode): Promise<SectorWithInstitution | null>`;
  `SectorRepository.create(institutionId, name, inviteCode？)` (third param added);
  `SectorInviteCodeConflictError`; `AdminSectorRow.inviteCode: string | null`;
  `UpdateSectorParams.inviteCode?: string`. Task 3 consumes `findByInviteCode` and
  `SectorWithInstitution`. Task 5 consumes the updated `create`/`update` signatures and the new
  error class.

- [ ] **Step 1: Write the failing tests**

First, check whether `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.test.ts`
already exists (`ls apps/api/src/modules/sector/infrastructure/persistence/`). If it exists, read
it fully first and add the block below inside its existing `describe`, adjusting the setup to
match whatever test-database helper it already uses. If it does not exist, this test file talks to
the real test database the same way every other `*.repository.test.ts` in this codebase does —
copy the top-of-file setup (imports, `beforeEach`/`afterEach` cleanup) from a sibling repository
test in `apps/api/src/modules/manager/infrastructure/persistence/` before writing the block below,
since the exact helper names were not confirmed for this file.

```ts
describe("findByInviteCode", () => {
  it("resolves an active sector in an active institution", async () => {
    const institution = await createTestInstitution({ isActive: true });
    const created = await repository.create(institution.id, "UTI", "uti-2026");

    const result = await repository.findByInviteCode("uti-2026");

    expect(result).toEqual({
      id: created.id,
      name: "UTI",
      isActive: true,
      institution: { id: institution.id, name: institution.name, isActive: true },
    });
  });

  it("returns null for an unknown code", async () => {
    const result = await repository.findByInviteCode("does-not-exist");
    expect(result).toBeNull();
  });

  it("still returns the row when the sector itself is inactive (caller decides what to do)", async () => {
    const institution = await createTestInstitution({ isActive: true });
    const created = await repository.create(institution.id, "UTI", "uti-inactive-2026");
    await repository.update(created.id, { isActive: false });

    const result = await repository.findByInviteCode("uti-inactive-2026");

    expect(result?.isActive).toBe(false);
  });
});

describe("create with an invite code", () => {
  it("stores the invite code", async () => {
    const institution = await createTestInstitution({ isActive: true });

    await repository.create(institution.id, "PS", "ps-2026");

    const found = await repository.findByInviteCode("ps-2026");
    expect(found?.name).toBe("PS");
  });

  it("throws SectorInviteCodeConflictError when the code is already used by another sector", async () => {
    const institution = await createTestInstitution({ isActive: true });
    await repository.create(institution.id, "UTI", "shared-code");

    await expect(repository.create(institution.id, "PS", "shared-code")).rejects.toThrow(
      SectorInviteCodeConflictError,
    );
  });
});

describe("update with an invite code", () => {
  it("throws SectorInviteCodeConflictError when the new code collides with another sector", async () => {
    const institution = await createTestInstitution({ isActive: true });
    await repository.create(institution.id, "UTI", "taken-code");
    const other = await repository.create(institution.id, "PS", null as unknown as string);

    await expect(repository.update(other.id, { inviteCode: "taken-code" })).rejects.toThrow(
      SectorInviteCodeConflictError,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/api`): `npx vitest run src/modules/sector/infrastructure/persistence/prisma-sector.repository.test.ts`
Expected: FAIL — `findByInviteCode` does not exist yet, `create` doesn't accept a third argument.

- [ ] **Step 3: Add the port interface members**

Edit `apps/api/src/modules/sector/application/ports/sector-repository.port.ts`. Add, right after
the existing `UpdateSectorParams` interface:

```ts
export interface SectorWithInstitution {
  id: string;
  name: string;
  isActive: boolean;
  institution: { id: string; name: string; isActive: boolean };
}
```

Change `UpdateSectorParams` to:

```ts
export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
  inviteCode?: string;
}
```

Change `AdminSectorRow` to:

```ts
export interface AdminSectorRow {
  id: string;
  name: string;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
  inviteCode: string | null;
}
```

Change the `create` signature and add `findByInviteCode` in the `SectorRepository` interface:

```ts
export interface SectorRepository {
  create(institutionId: string, name: string, inviteCode?: string): Promise<{ id: string; name: string }>;
  findAllForAdmin(institutionId: string): Promise<AdminSectorRow[]>;
  findById(
    id: string,
  ): Promise<{ id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean } | null>;
  update(id: string, patch: UpdateSectorParams): Promise<void>;
  findActiveByInstitution(institutionId: string): Promise<{ id: string; name: string }[]>;
  findActiveByIds(institutionId: string, sectorIds: string[]): Promise<{ id: string; name: string }[]>;
  findAssignedSectorIds(managerId: string): Promise<string[]>;
  reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]): Promise<void>;
  findByIdsInInstitution(institutionId: string, sectorIds: string[]): Promise<{ id: string }[]>;
  findByInviteCode(inviteCode: string): Promise<SectorWithInstitution | null>;
  delete(id: string): Promise<void>;
}
```

Add, next to `SectorNameConflictError`:

```ts
export class SectorInviteCodeConflictError extends Error {}
```

- [ ] **Step 4: Implement in `PrismaSectorRepository`**

Edit `apps/api/src/modules/sector/infrastructure/persistence/prisma-sector.repository.ts`.

Update the import line to also bring in the new error:

```ts
import { SectorNameConflictError, SectorInviteCodeConflictError } from "@/modules/sector/application/ports/sector-repository.port.js";
```

Replace the `create` method with:

```ts
  async create(institutionId: string, name: string, inviteCode?: string): Promise<{ id: string; name: string }> {
    try {
      const row = await this.prisma.sector.create({
        data: { institutionId, name, inviteCode: inviteCode ?? null },
      });
      return { id: row.id, name: row.name };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
        if (target.includes("inviteCode")) {
          throw new SectorInviteCodeConflictError();
        }
        throw new SectorNameConflictError();
      }
      throw error;
    }
  }
```

Replace the `findAllForAdmin` method's return mapping to include `inviteCode`:

```ts
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
      inviteCode: row.inviteCode,
    }));
  }
```

Replace the `update` method to catch the unique-constraint violation:

```ts
  async update(id: string, patch: UpdateSectorParams): Promise<void> {
    try {
      await this.prisma.sector.update({ where: { id }, data: patch });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new SectorInviteCodeConflictError();
      }
      throw error;
    }
  }
```

Add the new method (anywhere after `findByIdsInInstitution`, before `delete`):

```ts
  async findByInviteCode(inviteCode: string): Promise<SectorWithInstitution | null> {
    const row = await this.prisma.sector.findUnique({
      where: { inviteCode },
      include: { institution: { select: { id: true, name: true, isActive: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      institution: { id: row.institution.id, name: row.institution.name, isActive: row.institution.isActive },
    };
  }
```

Add `SectorWithInstitution` to the type-only import at the top of the file (alongside
`AdminSectorRow`, `SectorRepository`, `UpdateSectorParams`).

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/api`): `npx vitest run src/modules/sector/infrastructure/persistence/prisma-sector.repository.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/sector
git commit -m "feat(api): resolve sectors by invite code, distinguish invite-code conflicts"
```

---

### Task 3: `GetSectorByInviteCodeUseCase`

**Files:**
- Create: `apps/api/src/modules/sector/application/use-cases/get-sector-by-invite-code.use-case.ts`
- Create: `apps/api/src/modules/sector/application/use-cases/get-sector-by-invite-code.use-case.test.ts`
- Modify: `apps/api/src/modules/sector/sector.module.ts`

**Interfaces:**
- Consumes: `SECTOR_REPOSITORY`, `SectorRepository.findByInviteCode` (Task 2).
- Produces: `GetSectorByInviteCodeUseCase.execute(inviteCode): Promise<SectorWithInstitution | null>`,
  exported from `SectorModule` for Task 4 to inject into `InstitutionController`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { GetSectorByInviteCodeUseCase } from "./get-sector-by-invite-code.use-case.ts";
import type { SectorRepository, SectorWithInstitution } from "../ports/sector-repository.port.ts";

function repositoryStub(row: SectorWithInstitution | null): SectorRepository {
  return {
    findByInviteCode: vi.fn().mockResolvedValue(row),
  } as unknown as SectorRepository;
}

describe("GetSectorByInviteCodeUseCase", () => {
  it("returns the sector when it and its institution are active", async () => {
    const row: SectorWithInstitution = {
      id: "sector-1",
      name: "UTI",
      isActive: true,
      institution: { id: "inst-1", name: "Hospital São Lucas", isActive: true },
    };
    const useCase = new GetSectorByInviteCodeUseCase(repositoryStub(row));

    expect(await useCase.execute("uti-2026")).toEqual(row);
  });

  it("returns null when the code does not match any sector", async () => {
    const useCase = new GetSectorByInviteCodeUseCase(repositoryStub(null));
    expect(await useCase.execute("unknown")).toBeNull();
  });

  it("returns null when the sector itself is inactive", async () => {
    const row: SectorWithInstitution = {
      id: "sector-1",
      name: "UTI",
      isActive: false,
      institution: { id: "inst-1", name: "Hospital São Lucas", isActive: true },
    };
    const useCase = new GetSectorByInviteCodeUseCase(repositoryStub(row));

    expect(await useCase.execute("uti-2026")).toBeNull();
  });

  it("returns null when the sector's institution is inactive", async () => {
    const row: SectorWithInstitution = {
      id: "sector-1",
      name: "UTI",
      isActive: true,
      institution: { id: "inst-1", name: "Hospital Encerrado", isActive: false },
    };
    const useCase = new GetSectorByInviteCodeUseCase(repositoryStub(row));

    expect(await useCase.execute("uti-2026")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/api`): `npx vitest run src/modules/sector/application/use-cases/get-sector-by-invite-code.use-case.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { Inject, Injectable } from "@nestjs/common";
import {
  SECTOR_REPOSITORY,
  type SectorRepository,
  type SectorWithInstitution,
} from "../ports/sector-repository.port.ts";

@Injectable()
export class GetSectorByInviteCodeUseCase {
  constructor(@Inject(SECTOR_REPOSITORY) private readonly repository: SectorRepository) {}

  async execute(inviteCode: string): Promise<SectorWithInstitution | null> {
    const sector = await this.repository.findByInviteCode(inviteCode);
    if (!sector || !sector.isActive || !sector.institution.isActive) return null;
    return sector;
  }
}
```

- [ ] **Step 4: Wire it into `SectorModule`**

Replace the full contents of `apps/api/src/modules/sector/sector.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaSectorRepository } from "./infrastructure/persistence/prisma-sector.repository.ts";
import { SECTOR_REPOSITORY } from "./application/ports/sector-repository.port.ts";
import { GetSectorByInviteCodeUseCase } from "./application/use-cases/get-sector-by-invite-code.use-case.ts";

@Module({
  providers: [
    { provide: SECTOR_REPOSITORY, useClass: PrismaSectorRepository },
    GetSectorByInviteCodeUseCase,
  ],
  exports: [SECTOR_REPOSITORY, GetSectorByInviteCodeUseCase],
})
export class SectorModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `apps/api`): `npx vitest run src/modules/sector/application/use-cases/get-sector-by-invite-code.use-case.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/sector
git commit -m "feat(api): add GetSectorByInviteCodeUseCase"
```

---

### Task 4: `GET /institutions/by-code/:code` resolves sector codes too

**Files:**
- Modify: `apps/api/src/modules/institution/infrastructure/institution.controller.ts`
- Modify: `apps/api/src/modules/institution/infrastructure/institution.controller.test.ts`

**Interfaces:**
- Consumes: `GetSectorByInviteCodeUseCase` (Task 3), `GetInstitutionByInviteCodeUseCase`
  (existing).
- Produces: `LinkCodeResult = { institution: { id: string; name: string }; sector?: { id: string;
  name: string } }`, the exact response shape Task 7 (frontend) parses.

- [ ] **Step 1: Update the failing test**

Read `apps/api/src/modules/institution/infrastructure/institution.controller.test.ts` fully first
(it already exists, 133 lines). Replace its `FakeSectorRepository` class with one that also
implements `findByInviteCode`, and add a `byInviteCode` fixture field:

```ts
class FakeSectorRepository implements SectorRepository {
  public activeByInstitution: Record<string, { id: string; name: string }[]> = {};
  public byInviteCode: Record<string, SectorWithInstitution> = {};

  async create(): Promise<{ id: string; name: string }> {
    throw new Error("not used in this test");
  }
  async findAllForAdmin(): Promise<AdminSectorRow[]> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<{ id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean } | null> {
    throw new Error("not used in this test");
  }
  async update(_id: string, _patch: UpdateSectorParams): Promise<void> {
    throw new Error("not used in this test");
  }
  async findActiveByInstitution(institutionId: string): Promise<{ id: string; name: string }[]> {
    return this.activeByInstitution[institutionId] ?? [];
  }
  async findActiveByIds(): Promise<{ id: string; name: string }[]> {
    throw new Error("not used in this test");
  }
  async findAssignedSectorIds(): Promise<string[]> {
    throw new Error("not used in this test");
  }
  async reassignManagerSectors(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findByIdsInInstitution(): Promise<{ id: string }[]> {
    throw new Error("not used in this test");
  }
  async findByInviteCode(inviteCode: string): Promise<SectorWithInstitution | null> {
    return this.byInviteCode[inviteCode] ?? null;
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}
```

Update the top-of-file import to bring in the new type and `GetSectorByInviteCodeUseCase`:

```ts
import { GetSectorByInviteCodeUseCase } from "@/modules/sector/application/use-cases/get-sector-by-invite-code.use-case.js";
import { SECTOR_REPOSITORY } from "@/modules/sector/application/ports/sector-repository.port.js";
import type {
  AdminSectorRow,
  SectorRepository,
  SectorWithInstitution,
  UpdateSectorParams,
} from "@/modules/sector/application/ports/sector-repository.port.js";
```

In `beforeAll`, add `GetSectorByInviteCodeUseCase` to the testing module's providers:

```ts
    const moduleRef = await Test.createTestingModule({
      controllers: [InstitutionController],
      providers: [
        GetInstitutionByInviteCodeUseCase,
        GetSectorByInviteCodeUseCase,
        { provide: INSTITUTION_REPOSITORY, useValue: repository },
        { provide: SECTOR_REPOSITORY, useValue: sectorRepository },
      ],
    }).compile();
```

Update the first test's assertion (institution-only code now nests under `institution`):

```ts
  it("GET /institutions/by-code/:code returns the institution for a known code", async () => {
    const response = await request(app.getHttpServer()).get("/institutions/by-code/sao-lucas-2026");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ institution: { id: "inst-1", name: "Hospital São Lucas" } });
  });
```

Append these new tests at the end of the `describe` block:

```ts
  it("GET /institutions/by-code/:code resolves a sector code, nesting both institution and sector", async () => {
    sectorRepository.byInviteCode = {
      "uti-2026": {
        id: "sector-1",
        name: "UTI",
        isActive: true,
        institution: { id: "inst-1", name: "Hospital São Lucas", isActive: true },
      },
    };

    const response = await request(app.getHttpServer()).get("/institutions/by-code/uti-2026");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });
  });

  it("GET /institutions/by-code/:code returns 404 for an inactive sector's code", async () => {
    sectorRepository.byInviteCode = {
      "uti-pausada": {
        id: "sector-2",
        name: "UTI",
        isActive: false,
        institution: { id: "inst-1", name: "Hospital São Lucas", isActive: true },
      },
    };

    const response = await request(app.getHttpServer()).get("/institutions/by-code/uti-pausada");

    expect(response.status).toBe(404);
  });

  it("GET /institutions/by-code/:code returns 404 for a sector whose institution is inactive", async () => {
    sectorRepository.byInviteCode = {
      "uti-encerrado": {
        id: "sector-3",
        name: "UTI",
        isActive: true,
        institution: { id: "inst-2", name: "Hospital Encerrado", isActive: false },
      },
    };

    const response = await request(app.getHttpServer()).get("/institutions/by-code/uti-encerrado");

    expect(response.status).toBe(404);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/api`): `npx vitest run src/modules/institution/infrastructure/institution.controller.test.ts`
Expected: FAIL — response shape mismatch, `findByInviteCode` missing from the fake, new tests
failing.

- [ ] **Step 3: Write the minimal implementation**

Replace the full contents of `apps/api/src/modules/institution/infrastructure/institution.controller.ts`:

```ts
import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { GetInstitutionByInviteCodeUseCase } from "../application/use-cases/get-institution-by-invite-code.use-case.ts";
import { GetSectorByInviteCodeUseCase } from "@/modules/sector/application/use-cases/get-sector-by-invite-code.use-case.js";
import { SECTOR_REPOSITORY, type SectorRepository } from "@/modules/sector/application/ports/sector-repository.port.js";

export interface LinkCodeResult {
  institution: { id: string; name: string };
  sector?: { id: string; name: string };
}

@Controller("institutions")
export class InstitutionController {
  constructor(
    @Inject(GetInstitutionByInviteCodeUseCase)
    private readonly getInstitutionByInviteCode: GetInstitutionByInviteCodeUseCase,
    @Inject(GetSectorByInviteCodeUseCase)
    private readonly getSectorByInviteCode: GetSectorByInviteCodeUseCase,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  @Get("by-code/:code")
  async byCode(@Param("code") code: string): Promise<LinkCodeResult> {
    const institution = await this.getInstitutionByInviteCode.execute(code);
    if (institution) {
      return { institution: { id: institution.id, name: institution.name } };
    }

    const sector = await this.getSectorByInviteCode.execute(code);
    if (!sector) {
      throw new NotFoundException();
    }
    return {
      institution: { id: sector.institution.id, name: sector.institution.name },
      sector: { id: sector.id, name: sector.name },
    };
  }

  @Get(":id/sectors")
  async sectors(@Param("id") id: string): Promise<{ id: string; name: string }[]> {
    return this.sectorRepository.findActiveByInstitution(id);
  }
}
```

`InstitutionModule` needs no changes: it already imports `SectorModule`, which now exports
`GetSectorByInviteCodeUseCase` (Task 3), so Nest resolves the new constructor param automatically.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/api`): `npx vitest run src/modules/institution/infrastructure/institution.controller.test.ts`
Expected: PASS — all 8 tests (4 existing + 4 new/updated).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/institution
git commit -m "feat(api): resolve sector invite codes from GET /institutions/by-code/:code"
```

---

### Task 5: Manager admin sector create/update — invite code

**Files:**
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`

**Interfaces:**
- Consumes: `SectorRepository.create`/`.update` (Task 2), `SectorInviteCodeConflictError`.
- Produces: `POST /manager/admin/sectors` and `PATCH /manager/admin/sectors/:id` both accept an
  `inviteCode` field; Task 11 (frontend) targets this exact request/response contract.

- [ ] **Step 1: Read the existing test file first**

Read `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts` in full before
editing anything — this plan does not reproduce it here because it is large and covers many
routes beyond sectors; find its existing `describe("POST /manager/admin/sectors"` and
`describe("PATCH /manager/admin/sectors/:id"` blocks (or equivalent) and follow their existing
`FakeSectorRepository`-equivalent test-double pattern exactly for the new cases below, rather than
introducing a different mocking style.

- [ ] **Step 2: Write the failing tests**

Add these cases inside the existing sectors `describe` block(s), adapting fixture/setup calls
(institution id, auth token, guard bypass) to match whatever the surrounding tests in that file
already use:

```ts
  it("POST /manager/admin/sectors accepts an optional inviteCode", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ name: "UTI", inviteCode: "uti-2026" });

    expect(response.status).toBe(201);
  });

  it("POST /manager/admin/sectors returns 409 with { conflict: \"inviteCode\" } when the code is taken", async () => {
    await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ name: "UTI", inviteCode: "shared-code" });

    const response = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ name: "PS", inviteCode: "shared-code" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ conflict: "inviteCode" });
  });

  it("POST /manager/admin/sectors still returns 409 with { conflict: \"name\" } for a duplicate name", async () => {
    await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ name: "Duplicada" });

    const response = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ name: "Duplicada" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ conflict: "name" });
  });

  it("PATCH /manager/admin/sectors/:id sets the inviteCode when the sector doesn't have one yet", async () => {
    const created = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ name: "Sem código" });

    const response = await request(app.getHttpServer())
      .patch(`/manager/admin/sectors/${created.body.id}`)
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ inviteCode: "novo-codigo" });

    expect(response.status).toBe(204);
  });

  it("PATCH /manager/admin/sectors/:id rejects changing an inviteCode that is already set", async () => {
    const created = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ name: "Com código", inviteCode: "original-2026" });

    const response = await request(app.getHttpServer())
      .patch(`/manager/admin/sectors/${created.body.id}`)
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ inviteCode: "tentativa-de-troca" });

    expect(response.status).toBe(400);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `apps/api`): `npx vitest run src/modules/manager/infrastructure/manager-admin.controller.test.ts`
Expected: FAIL — `inviteCode` is currently stripped by the Zod schema, no 400/409-body handling
exists yet.

- [ ] **Step 4: Write the minimal implementation**

In `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`, replace the two
schema constants:

```ts
const CreateSectorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  inviteCode: z.string().trim().min(1).max(100).optional(),
});
const UpdateSectorSchema = z.object({
  isActive: z.boolean().optional(),
  managerId: z.string().nullable().optional(),
  inviteCode: z.string().trim().min(1).max(100).optional(),
});
```

Replace the `createSector` handler's body:

```ts
  @Post("sectors")
  @HttpCode(201)
  async createSector(@Req() request: Request, @Body() body: unknown): Promise<{ id: string; name: string }> {
    const parsed = CreateSectorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.sectorRepository.create(
        request.manager!.institutionId,
        parsed.data.name,
        parsed.data.inviteCode,
      );
    } catch (error) {
      if (error instanceof SectorNameConflictError) {
        throw new ConflictException({ conflict: "name" });
      }
      if (error instanceof SectorInviteCodeConflictError) {
        throw new ConflictException({ conflict: "inviteCode" });
      }
      throw error;
    }
  }
```

Replace the `updateSector` handler's body — note the new immutability check right after the
existing not-found check, and the try/catch around `update` that did not exist before:

```ts
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

    if (parsed.data.inviteCode !== undefined && sector.inviteCode !== null) {
      throw new BadRequestException("inviteCode is immutable once set");
    }

    // The DB foreign key only proves the manager exists, not that they belong
    // here — without this check an admin could assign another institution's
    // manager to one of their own sectors.
    if (parsed.data.managerId) {
      const assignee = await this.managerRepository.findById(parsed.data.managerId);
      if (!assignee || assignee.institutionId !== request.manager!.institutionId) {
        throw new BadRequestException("managerId does not belong to this institution");
      }
    }

    try {
      await this.sectorRepository.update(id, parsed.data);
    } catch (error) {
      if (error instanceof SectorInviteCodeConflictError) {
        throw new ConflictException({ conflict: "inviteCode" });
      }
      throw error;
    }
  }
```

`sector.inviteCode` requires `findById`'s return type to include it — update the port's `findById`
signature (in `sector-repository.port.ts`, same file touched in Task 2) to:

```ts
  findById(
    id: string,
  ): Promise<
    { id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean; inviteCode: string | null } | null
  >;
```

And in `PrismaSectorRepository.findById` (Task 2's file), add `inviteCode: true` to the `select`
block and `inviteCode: row.inviteCode` is already returned automatically by Prisma's typed
result — just confirm the return statement destructures/passes through every selected field (it
currently returns `this.prisma.sector.findUnique(...)` directly, which already includes every
selected column, so no further change is needed there beyond the `select` addition):

```ts
  async findById(
    id: string,
  ): Promise<
    { id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean; inviteCode: string | null } | null
  > {
    return this.prisma.sector.findUnique({
      where: { id },
      select: { id: true, institutionId: true, name: true, managerId: true, isActive: true, inviteCode: true },
    });
  }
```

Finally, add the new import to `manager-admin.controller.ts`:

```ts
import { SectorInviteCodeConflictError } from "@/modules/sector/application/ports/sector-repository.port.js";
```

(alongside wherever `SectorNameConflictError` is already imported in that file).

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/api`): `npx vitest run src/modules/manager/infrastructure/manager-admin.controller.test.ts`
Run (from `apps/api`): `npx vitest run src/modules/sector/infrastructure/persistence/prisma-sector.repository.test.ts`
Expected: PASS on both — the `findById` signature change must not break any pre-existing test in
either file; if one does, update its expected object to include `inviteCode`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/manager apps/api/src/modules/sector
git commit -m "feat(api): let gestores set an invite code when creating or editing a sector"
```

---

### Task 6: Admin-authenticated per-institution sector list (with invite codes)

**Files:**
- Modify: `apps/api/src/modules/admin/infrastructure/admin.controller.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`
- Test: `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts` (read it first; add
  to its existing structure)

**Interfaces:**
- Consumes: `SectorRepository.findAllForAdmin` (existing, now includes `inviteCode` per Task 2).
- Produces: `GET /admin/institutions/:id/sectors` (authenticated via `AdminAuthGuard`), returning
  `AdminSectorRow[]` including `inviteCode` — this is deliberately a *different* endpoint from the
  public, code-less `GET /institutions/:id/sectors` used by the médico link flow (Task 4/7), since
  that one must never leak invite codes to an unauthenticated caller. Task 12 (frontend) consumes
  this route.

- [ ] **Step 1: Read the existing admin controller test file first**

Read `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts` fully to find its
existing auth/fixture setup (how a valid admin token is obtained in tests, how
`ADMIN_INSTITUTION_REPOSITORY` is stubbed) before writing the block below, and mirror that setup
exactly rather than inventing a new one.

- [ ] **Step 2: Write the failing tests**

```ts
  it("GET /admin/institutions/:id/sectors returns sectors with invite codes when authenticated", async () => {
    sectorRepository.forAdmin = {
      "inst-1": [
        { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
      ],
    };

    const response = await request(app.getHttpServer())
      .get("/admin/institutions/inst-1/sectors")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
    ]);
  });

  it("GET /admin/institutions/:id/sectors returns 401 without a token", async () => {
    const response = await request(app.getHttpServer()).get("/admin/institutions/inst-1/sectors");
    expect(response.status).toBe(401);
  });
```

Add a `forAdmin: Record<string, AdminSectorRow[]> = {}` field and a `findAllForAdmin(institutionId)`
implementation to whatever fake/stub `SectorRepository` this test file already defines (or, if it
does not define one yet, add a minimal one following the exact `FakeSectorRepository` shape from
`institution.controller.test.ts`, Task 4, throwing "not used in this test" for every method except
`findAllForAdmin`). Register `SECTOR_REPOSITORY` with that stub in the testing module's providers.

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `apps/api`): `npx vitest run src/modules/admin/infrastructure/admin.controller.test.ts`
Expected: FAIL — route does not exist (404), or DI error if the provider isn't wired yet.

- [ ] **Step 4: Write the minimal implementation**

In `apps/api/src/modules/admin/infrastructure/admin.controller.ts`, add to the imports:

```ts
import { SECTOR_REPOSITORY, type SectorRepository, type AdminSectorRow } from "@/modules/sector/application/ports/sector-repository.port.js";
```

Add `SECTOR_REPOSITORY` to the constructor:

```ts
  constructor(
    @Inject(LoginAdminUseCase) private readonly loginAdmin: LoginAdminUseCase,
    @Inject(CreateInstitutionUseCase) private readonly createInstitution: CreateInstitutionUseCase,
    @Inject(ListInstitutionsUseCase) private readonly listInstitutions: ListInstitutionsUseCase,
    @Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly institutionRepository: AdminInstitutionRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}
```

Add the new route (anywhere after `updateInstitutionHandler`):

```ts
  @Get("institutions/:id/sectors")
  @UseGuards(AdminAuthGuard)
  async listInstitutionSectorsHandler(@Param("id") id: string): Promise<AdminSectorRow[]> {
    return this.sectorRepository.findAllForAdmin(id);
  }
```

In `apps/api/src/modules/admin/admin.module.ts`, import `SectorModule` and add it to `imports`:

```ts
import { SectorModule } from "../sector/sector.module.ts";

@Module({
  imports: [EmailModule, SectorModule],
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

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/api`): `npx vitest run src/modules/admin/infrastructure/admin.controller.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/admin
git commit -m "feat(api): let the system admin list a chosen institution's sectors with invite codes"
```

---

### Task 7: Frontend — discriminated `LinkCodeResult` in the institution-link port

**Files:**
- Modify: `apps/web/src/ports/institution-link.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-institution-link.adapter.ts`
- Modify: `apps/web/src/infrastructure/http/http-institution-link.adapter.test.ts` (check it
  exists first via glob; if absent, create it following the sibling `*.adapter.test.ts` pattern in
  the same folder)
- Test: same file as above

**Interfaces:**
- Produces: `InstitutionLinkPort.lookupByCode(code): Promise<LinkCodeResult>` where
  `LinkCodeResult = { institution: InstitutionLookupResult; sector?: InstitutionSector }` — Task 8
  consumes this exact shape.

- [ ] **Step 1: Write the failing tests**

Check whether `apps/web/src/infrastructure/http/http-institution-link.adapter.test.ts` already
exists. If it does, read it fully and adapt the assertions below to its existing `fetchMock`/MSW
setup style instead of introducing a new one. If it does not exist, create it:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HttpInstitutionLinkAdapter } from "./http-institution-link.adapter";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

describe("HttpInstitutionLinkAdapter.lookupByCode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns just the institution when the code has no sector", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ institution: { id: "inst-1", name: "Hospital São Lucas" } }),
    } as Response);

    const adapter = new HttpInstitutionLinkAdapter();
    const result = await adapter.lookupByCode("sao-lucas-2026");

    expect(result).toEqual({ institution: { id: "inst-1", name: "Hospital São Lucas" } });
  });

  it("returns the institution and sector together when the code resolves a sector", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        institution: { id: "inst-1", name: "Hospital São Lucas" },
        sector: { id: "sector-1", name: "UTI" },
      }),
    } as Response);

    const adapter = new HttpInstitutionLinkAdapter();
    const result = await adapter.lookupByCode("uti-2026");

    expect(result).toEqual({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });
  });

  it("throws InstitutionNotFoundError on 404", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 } as Response);

    const adapter = new HttpInstitutionLinkAdapter();
    await expect(adapter.lookupByCode("unknown")).rejects.toThrow(InstitutionNotFoundError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/infrastructure/http/http-institution-link.adapter.test.ts`
Expected: FAIL — `lookupByCode` currently returns the flat `{id, name}` shape, not `{institution}`.

- [ ] **Step 3: Write the minimal implementation**

Replace the full contents of `apps/web/src/ports/institution-link.port.ts`:

```ts
import { z } from "zod";

export const InstitutionLookupResultSchema = z.object({ id: z.string(), name: z.string() });
export type InstitutionLookupResult = z.infer<typeof InstitutionLookupResultSchema>;

export const InstitutionSectorSchema = z.object({ id: z.string(), name: z.string() });
export type InstitutionSector = z.infer<typeof InstitutionSectorSchema>;

export const LinkCodeResultSchema = z.object({
  institution: InstitutionLookupResultSchema,
  sector: InstitutionSectorSchema.optional(),
});
export type LinkCodeResult = z.infer<typeof LinkCodeResultSchema>;

export class InstitutionNotFoundError extends Error {}

export interface InstitutionLinkPort {
  lookupByCode(code: string): Promise<LinkCodeResult>;
  listSectors(institutionId: string): Promise<InstitutionSector[]>;
}
```

Replace `lookupByCode` in `apps/web/src/infrastructure/http/http-institution-link.adapter.ts`:

```ts
import type { InstitutionLinkPort, InstitutionSector, LinkCodeResult } from "@/ports/institution-link.port";
import { InstitutionNotFoundError, InstitutionSectorSchema, LinkCodeResultSchema } from "@/ports/institution-link.port";
import { API_BASE_URL } from './api-base-url';


export class HttpInstitutionLinkAdapter implements InstitutionLinkPort {
  async lookupByCode(code: string): Promise<LinkCodeResult> {
    const response = await fetch(`${API_BASE_URL}/institutions/by-code/${encodeURIComponent(code)}`);

    if (response.status === 404) {
      throw new InstitutionNotFoundError();
    }
    if (!response.ok) {
      throw new Error(`institution lookup failed with status ${response.status}`);
    }

    return LinkCodeResultSchema.parse(await response.json());
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

Note: `listSectors` still needs the `z` import (`import { z } from "zod";`) — keep it if it's
already at the top of the file (it was, per the original file).

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/infrastructure/http/http-institution-link.adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the one call site that assumed the flat shape**

`apps/web/src/use-cases/lookup-institution.usecase.ts` only forwards the return value — update its
return type import:

```ts
import type { InstitutionLinkPort, LinkCodeResult } from "@/ports/institution-link.port";

export class LookupInstitutionUseCase {
  constructor(private readonly institutionLinkPort: InstitutionLinkPort) {}

  async execute(code: string): Promise<LinkCodeResult> {
    return this.institutionLinkPort.lookupByCode(code);
  }
}
```

Run (from `apps/web`): `npx vitest run src/use-cases/lookup-institution.usecase.test.ts` — read
this test file first; if any assertion still expects the flat `{id, name}` shape, update it to
`{ institution: { id, name } }` to match.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ports/institution-link.port.ts apps/web/src/infrastructure/http/http-institution-link.adapter.ts apps/web/src/infrastructure/http/http-institution-link.adapter.test.ts apps/web/src/use-cases/lookup-institution.usecase.ts apps/web/src/use-cases/lookup-institution.usecase.test.ts
git commit -m "feat(web): parse a sector alongside the institution from a link code lookup"
```

---

### Task 8: `useLinkInstitutionFlow` — the `"confirm"` step

**Files:**
- Modify: `apps/web/src/presentation/hooks/useLinkInstitutionFlow.ts`
- Modify: `apps/web/src/presentation/hooks/useLinkInstitutionFlow.test.ts` (read it first; it
  already exists per the earlier research — adapt to its exact `renderHook`/mock style)
- Create: `apps/web/src/presentation/components/LinkInstitutionConfirmStep.tsx`
- Create: `apps/web/src/presentation/components/LinkInstitutionConfirmStep.test.tsx`
- Modify: `apps/web/src/presentation/pages/LinkInstitutionPage.tsx` (wire the new step in)

**Interfaces:**
- Consumes: `LinkCodeResult` (Task 7).
- Produces: `useLinkInstitutionFlow()` returns now include `step: "code" | "sector" | "confirm"`,
  `confirmSector: { id: string; name: string } | null`, `handleConfirmSubmit(): void`,
  `handleRejectConfirm(): void` — `LinkInstitutionPage.tsx` and the new
  `LinkInstitutionConfirmStep` component consume these.

- [ ] **Step 1: Read the existing hook test file first**

Read `apps/web/src/presentation/hooks/useLinkInstitutionFlow.test.ts` fully to see its exact mock
setup for `useLookupInstitution`/`useInstitutionSectors`/the link store, then write the new cases
below in that same style rather than reinventing the mocking approach.

- [ ] **Step 2: Write the failing tests**

Add these cases (adapt mock return values to the file's existing conventions):

```ts
  it("moves to the sector step when the lookup resolves only an institution", async () => {
    mockLookup.mutate.mockImplementation((_code, { onSuccess }) => {
      onSuccess({ institution: { id: "inst-1", name: "Hospital São Lucas" } });
    });

    const { result } = renderHook(() => useLinkInstitutionFlow());
    act(() => result.current.handleCodeSubmit({ preventDefault: () => {} } as never));

    expect(result.current.step).toBe("sector");
  });

  it("moves straight to the confirm step when the lookup resolves a sector too", async () => {
    mockLookup.mutate.mockImplementation((_code, { onSuccess }) => {
      onSuccess({
        institution: { id: "inst-1", name: "Hospital São Lucas" },
        sector: { id: "sector-1", name: "UTI" },
      });
    });

    const { result } = renderHook(() => useLinkInstitutionFlow());
    act(() => result.current.handleCodeSubmit({ preventDefault: () => {} } as never));

    expect(result.current.step).toBe("confirm");
    expect(result.current.confirmSector).toEqual({ id: "sector-1", name: "UTI" });
  });

  it("handleConfirmSubmit links using the already-resolved institution and sector, without another network call", async () => {
    mockLookup.mutate.mockImplementation((_code, { onSuccess }) => {
      onSuccess({
        institution: { id: "inst-1", name: "Hospital São Lucas" },
        sector: { id: "sector-1", name: "UTI" },
      });
    });

    const { result } = renderHook(() => useLinkInstitutionFlow());
    act(() => result.current.handleCodeSubmit({ preventDefault: () => {} } as never));
    act(() => result.current.handleConfirmSubmit());

    expect(mockLink).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId: "inst-1", sectorId: "sector-1", sectorName: "UTI" }),
    );
  });

  it("handleRejectConfirm returns to the code step so a wrong QR can be rescanned", async () => {
    mockLookup.mutate.mockImplementation((_code, { onSuccess }) => {
      onSuccess({
        institution: { id: "inst-1", name: "Hospital São Lucas" },
        sector: { id: "sector-1", name: "UTI" },
      });
    });

    const { result } = renderHook(() => useLinkInstitutionFlow());
    act(() => result.current.handleCodeSubmit({ preventDefault: () => {} } as never));
    act(() => result.current.handleRejectConfirm());

    expect(result.current.step).toBe("code");
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/presentation/hooks/useLinkInstitutionFlow.test.ts`
Expected: FAIL — `confirmSector`, `handleConfirmSubmit`, `handleRejectConfirm` don't exist; `step`
never becomes `"confirm"`.

- [ ] **Step 4: Write the minimal implementation**

Replace the full contents of `apps/web/src/presentation/hooks/useLinkInstitutionFlow.ts`:

```ts
import { useState } from "react";
import { useNavigate } from "react-router";
import { useLookupInstitution } from "./useLookupInstitution";
import { useInstitutionSectors } from "./useInstitutionSectors";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { routes } from "@/presentation/lib/routes";

type Step = "code" | "sector" | "confirm";

export function useLinkInstitutionFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [institution, setInstitution] = useState<{ id: string; name: string } | null>(null);
  const [confirmSector, setConfirmSector] = useState<{ id: string; name: string } | null>(null);
  const lookup = useLookupInstitution();
  const sectors = useInstitutionSectors(institution?.id ?? null);
  const link = useInstitutionLinkStore((state) => state.link);

  const lookupCode = (rawCode: string) => {
    const trimmed = rawCode.trim();
    setCode(trimmed);
    lookup.mutate(trimmed, {
      onSuccess: (result) => {
        setInstitution(result.institution);
        if (result.sector) {
          setConfirmSector(result.sector);
          setStep("confirm");
        } else {
          setStep("sector");
        }
      },
    });
  };

  const handleCodeSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault();
    lookupCode(code);
  };

  const handleCodeScanned = (scannedCode: string) => {
    lookupCode(scannedCode);
  };

  const handleSectorSubmit = () => {
    if (!institution || !sectorId) return;
    const sectorName = sectors.data?.find((sector) => sector.id === sectorId)?.name ?? "";
    link({ institutionId: institution.id, institutionName: institution.name, sectorId, sectorName });
    navigate(routes.you);
  };

  const handleConfirmSubmit = () => {
    if (!institution || !confirmSector) return;
    link({
      institutionId: institution.id,
      institutionName: institution.name,
      sectorId: confirmSector.id,
      sectorName: confirmSector.name,
    });
    navigate(routes.you);
  };

  const handleRejectConfirm = () => {
    setInstitution(null);
    setConfirmSector(null);
    setStep("code");
  };

  const codeErrorMessage = lookup.isError
    ? lookup.error instanceof Error && lookup.error.name === "InstitutionNotFoundError"
      ? "Código não encontrado."
      : "Não foi possível verificar o código agora. Tente de novo."
    : null;

  return {
    step,
    code,
    setCode,
    sectorId,
    setSectorId,
    institution,
    confirmSector,
    sectors: {
      isLoading: sectors.isLoading,
      isError: sectors.isError,
      list: sectors.data ?? [],
      hasSectors: (sectors.data?.length ?? 0) > 0,
    },
    handleCodeSubmit,
    handleCodeScanned,
    handleSectorSubmit,
    handleConfirmSubmit,
    handleRejectConfirm,
    isLookingUp: lookup.isPending,
    codeErrorMessage,
  };
}
```

Read the *current* file before replacing it, so the exact existing `codeErrorMessage` logic and
every other returned field not mentioned above (there may be a couple this plan didn't need to
touch) are preserved rather than dropped — this snippet reconstructs the ones known from research;
diff against the real current file and keep anything present there that isn't shown here.

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run src/presentation/hooks/useLinkInstitutionFlow.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for the new confirm-step component**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LinkInstitutionConfirmStep } from "./LinkInstitutionConfirmStep";

describe("LinkInstitutionConfirmStep", () => {
  it("shows the institution and sector names and confirms on click", () => {
    const onConfirm = vi.fn();
    render(
      <LinkInstitutionConfirmStep
        institutionName="Hospital São Lucas"
        sectorName="UTI"
        onConfirm={onConfirm}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText("Hospital São Lucas")).toBeInTheDocument();
    expect(screen.getByText("UTI")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onReject when the person says it's the wrong code", () => {
    const onReject = vi.fn();
    render(
      <LinkInstitutionConfirmStep
        institutionName="Hospital São Lucas"
        sectorName="UTI"
        onConfirm={vi.fn()}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /não é isso/i }));
    expect(onReject).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/components/LinkInstitutionConfirmStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 8: Write the minimal implementation**

```tsx
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";

interface LinkInstitutionConfirmStepProps {
  institutionName: string;
  sectorName: string;
  onConfirm: () => void;
  onReject: () => void;
}

export function LinkInstitutionConfirmStep({
  institutionName,
  sectorName,
  onConfirm,
  onReject,
}: LinkInstitutionConfirmStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-label text-muted">Instituição</p>
        <p className="text-h2 text-ink">{institutionName}</p>
        <p className="mt-3 text-label text-muted">Setor</p>
        <p className="text-h2 text-ink">{sectorName}</p>
      </Card>
      <Button type="button" variant="primary" onClick={onConfirm}>
        Confirmar
      </Button>
      <Button type="button" variant="outline" onClick={onReject}>
        Não é isso
      </Button>
    </div>
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/components/LinkInstitutionConfirmStep.test.tsx`
Expected: PASS.

- [ ] **Step 10: Wire the new step into `LinkInstitutionPage.tsx`**

Read `apps/web/src/presentation/pages/LinkInstitutionPage.tsx` first to find exactly how it
currently branches on `step` (it renders `LinkInstitutionCodeStep` for `"code"` and
`LinkInstitutionSectorStep` for `"sector"` today). Add a third branch for `"confirm"`:

```tsx
{flow.step === "confirm" && flow.institution && flow.confirmSector && (
  <LinkInstitutionConfirmStep
    institutionName={flow.institution.name}
    sectorName={flow.confirmSector.name}
    onConfirm={flow.handleConfirmSubmit}
    onReject={flow.handleRejectConfirm}
  />
)}
```

Add the import: `import { LinkInstitutionConfirmStep } from "@/presentation/components/LinkInstitutionConfirmStep";`

- [ ] **Step 11: Run the page's existing test suite**

Run (from `apps/web`): `npx vitest run src/presentation/pages/LinkInstitutionPage.test.tsx`
Expected: PASS — this step should not have broken the existing `"code"`/`"sector"` rendering; if
it did, the branch conditions in Step 10 were not additive — fix them to only add the new branch.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/presentation/hooks/useLinkInstitutionFlow.ts apps/web/src/presentation/hooks/useLinkInstitutionFlow.test.ts apps/web/src/presentation/components/LinkInstitutionConfirmStep.tsx apps/web/src/presentation/components/LinkInstitutionConfirmStep.test.tsx apps/web/src/presentation/pages/LinkInstitutionPage.tsx
git commit -m "feat(web): confirm institution+sector before linking when a sector QR resolves both"
```

---

### Task 9: Generic `QrCodeModal` + `InstitutionQrCodeModal`/`SectorQrCodeModal` wrappers

**Files:**
- Create: `apps/web/src/presentation/components/QrCodeModal.tsx`
- Create: `apps/web/src/presentation/components/QrCodeModal.test.tsx`
- Modify: `apps/web/src/presentation/components/InstitutionQrCodeModal.tsx`
- Create: `apps/web/src/presentation/components/SectorQrCodeModal.tsx`
- Create: `apps/web/src/presentation/components/SectorQrCodeModal.test.tsx`

**Interfaces:**
- Produces: `QrCodeModal({ isOpen, onClose, title, payload, downloadFilename })`;
  `InstitutionQrCodeModal({ isOpen, onClose, institutionName, inviteCode })` (same public API as
  before — no caller changes needed); `SectorQrCodeModal({ isOpen, onClose, sectorName,
  inviteCode })` for Task 11 and Task 14 to use.

- [ ] **Step 1: Check for an existing `InstitutionQrCodeModal.test.tsx`**

Glob `apps/web/src/presentation/components/InstitutionQrCodeModal.test.tsx`. If it exists, read it
fully — its assertions likely key off `data-testid="institution-qr-canvas"` and the exact download
filename; preserve both exactly through the refactor (Step 3 keeps `data-testid` configurable with
that value as `InstitutionQrCodeModal`'s default, so this file needs no changes at all). Run it now
to confirm it currently passes, as a baseline:

Run (from `apps/web`): `npx vitest run src/presentation/components/InstitutionQrCodeModal.test.tsx`

- [ ] **Step 2: Write the failing test for the new generic modal**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QrCodeModal } from "./QrCodeModal";

describe("QrCodeModal", () => {
  it("renders the title and the payload as text below the code", async () => {
    render(
      <QrCodeModal
        isOpen
        onClose={vi.fn()}
        title="QR Code — UTI"
        payload="uti-2026"
        downloadFilename="zelo-setor-uti-2026.png"
      />,
    );

    await waitFor(() => screen.getByTestId("qr-code-canvas"));
    expect(screen.getByText("Código: uti-2026")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/components/QrCodeModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the minimal implementation**

```tsx
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/presentation/ui/Button";
import { Modal } from "@/presentation/ui/Modal";

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  payload: string;
  downloadFilename: string;
  testId?: string;
}

const QR_SIZE = 240;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// qrcode is loaded lazily — every session pays for it only once it actually
// opens a QR modal, not on every visit to the list that can open one.
export function QrCodeModal({
  isOpen,
  onClose,
  title,
  payload,
  downloadFilename,
  testId = "qr-code-canvas",
}: QrCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsReady(false);
      setRenderError(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { default: QRCode } = await import("qrcode");
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      try {
        await QRCode.toCanvas(canvas, payload, { width: QR_SIZE, margin: 1 });
        if (!cancelled) setIsReady(true);
      } catch {
        if (!cancelled) setRenderError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, payload]);

  const handleDownload = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) triggerDownload(blob, downloadFilename);
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center gap-4">
        {renderError ? (
          <p role="alert" className="text-label text-danger">
            Não foi possível gerar o QR Code agora. Tente de novo.
          </p>
        ) : (
          <canvas ref={canvasRef} width={QR_SIZE} height={QR_SIZE} className="rounded-card" data-testid={testId} />
        )}
        <p className="text-center text-label text-muted">Código: {payload}</p>
        <Button type="button" variant="outline" full={false} onClick={handleDownload} disabled={!isReady}>
          <Download size={16} aria-hidden="true" />
          Baixar PNG
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Run the new test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/components/QrCodeModal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Rewrite `InstitutionQrCodeModal` as a thin wrapper**

Replace the full contents of `apps/web/src/presentation/components/InstitutionQrCodeModal.tsx`:

```tsx
import { QrCodeModal } from "./QrCodeModal";

interface InstitutionQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionName: string;
  inviteCode: string;
}

export function InstitutionQrCodeModal({
  isOpen,
  onClose,
  institutionName,
  inviteCode,
}: InstitutionQrCodeModalProps) {
  return (
    <QrCodeModal
      isOpen={isOpen}
      onClose={onClose}
      title={`QR Code — ${institutionName}`}
      payload={inviteCode}
      downloadFilename={`zelo-convite-${inviteCode}.png`}
      testId="institution-qr-canvas"
    />
  );
}
```

- [ ] **Step 7: Re-run `InstitutionQrCodeModal`'s existing test**

Run (from `apps/web`): `npx vitest run src/presentation/components/InstitutionQrCodeModal.test.tsx`
Expected: PASS unchanged — same `data-testid`, same title format, same download filename as
before the refactor.

- [ ] **Step 8: Write the failing test for `SectorQrCodeModal`**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SectorQrCodeModal } from "./SectorQrCodeModal";

describe("SectorQrCodeModal", () => {
  it("titles the modal with the sector name and encodes the sector's invite code", async () => {
    render(<SectorQrCodeModal isOpen onClose={vi.fn()} sectorName="UTI" inviteCode="uti-2026" />);

    await waitFor(() => screen.getByTestId("sector-qr-canvas"));
    expect(screen.getByText("QR Code — UTI")).toBeInTheDocument();
    expect(screen.getByText("Código: uti-2026")).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/presentation/components/SectorQrCodeModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 10: Write the minimal implementation**

```tsx
import { QrCodeModal } from "./QrCodeModal";

interface SectorQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectorName: string;
  inviteCode: string;
}

export function SectorQrCodeModal({ isOpen, onClose, sectorName, inviteCode }: SectorQrCodeModalProps) {
  return (
    <QrCodeModal
      isOpen={isOpen}
      onClose={onClose}
      title={`QR Code — ${sectorName}`}
      payload={inviteCode}
      downloadFilename={`zelo-setor-${inviteCode}.png`}
      testId="sector-qr-canvas"
    />
  );
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/presentation/components/SectorQrCodeModal.test.tsx`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/presentation/components/QrCodeModal.tsx apps/web/src/presentation/components/QrCodeModal.test.tsx apps/web/src/presentation/components/InstitutionQrCodeModal.tsx apps/web/src/presentation/components/SectorQrCodeModal.tsx apps/web/src/presentation/components/SectorQrCodeModal.test.tsx
git commit -m "refactor(web): extract a generic QrCodeModal, add SectorQrCodeModal"
```

---

### Task 10: Frontend — `manager-admin` port/adapter/hooks carry `inviteCode`

**Files:**
- Modify: `apps/web/src/ports/manager-admin.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-admin.adapter.test.ts` (read first, adapt)
- Modify: `apps/web/src/presentation/hooks/useCreateSector.ts`
- Modify: `apps/web/src/use-cases/create-sector.usecase.ts`
- Modify: `apps/web/src/use-cases/create-sector.usecase.test.ts` (read first, adapt)

**Interfaces:**
- Produces: `AdminSector.inviteCode: string | null`; `UpdateSectorParams.inviteCode?: string`;
  `ManagerAdminPort.createSector(token, params: { name: string; inviteCode?: string })`;
  `SectorInviteCodeConflictError` (frontend port). Task 11 consumes all of these.

- [ ] **Step 1: Write the failing adapter tests**

Read `apps/web/src/infrastructure/http/http-manager-admin.adapter.test.ts` first for its exact
mock style, then add:

```ts
  it("createSector sends the inviteCode when provided", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "sector-1", name: "UTI" }),
    } as Response);

    const adapter = new HttpManagerAdminAdapter();
    await adapter.createSector("token", { name: "UTI", inviteCode: "uti-2026" });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/manager/admin/sectors"),
      expect.objectContaining({ body: JSON.stringify({ name: "UTI", inviteCode: "uti-2026" }) }),
    );
  });

  it("createSector throws SectorInviteCodeConflictError when the server reports a code conflict", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ conflict: "inviteCode" }),
    } as Response);

    const adapter = new HttpManagerAdminAdapter();
    await expect(adapter.createSector("token", { name: "PS", inviteCode: "shared" })).rejects.toThrow(
      SectorInviteCodeConflictError,
    );
  });

  it("createSector still throws SectorNameConflictError for a name conflict", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ conflict: "name" }),
    } as Response);

    const adapter = new HttpManagerAdminAdapter();
    await expect(adapter.createSector("token", { name: "Duplicada" })).rejects.toThrow(SectorNameConflictError);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/infrastructure/http/http-manager-admin.adapter.test.ts`
Expected: FAIL — `createSector` currently takes a bare `name: string`, and always throws
`SectorNameConflictError` on any 409 regardless of body.

- [ ] **Step 3: Update the port**

In `apps/web/src/ports/manager-admin.port.ts`:

Change `AdminSectorSchema`:

```ts
export const AdminSectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  managerId: z.string().nullable(),
  managerName: z.string().nullable(),
  inviteCode: z.string().nullable(),
});
```

Change `UpdateSectorParams`:

```ts
export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
  inviteCode?: string;
}
```

Add, next to `SectorNameConflictError`:

```ts
export class SectorInviteCodeConflictError extends Error {}
```

Change the `createSector` signature in `ManagerAdminPort`:

```ts
  createSector(token: string, params: { name: string; inviteCode?: string }): Promise<{ id: string; name: string }>;
```

- [ ] **Step 4: Update the adapter**

In `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts`, replace `createSector`:

```ts
  async createSector(
    token: string,
    params: { name: string; inviteCode?: string },
  ): Promise<{ id: string; name: string }> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(params),
    });
    if (response.status === 409) {
      const body = await response.json();
      if (body.conflict === "inviteCode") throw new SectorInviteCodeConflictError();
      throw new SectorNameConflictError();
    }
    if (!response.ok) throw new Error(`create sector failed with status ${response.status}`);
    return response.json();
  }
```

Replace `updateSector` to also branch on the conflict body:

```ts
  async updateSector(token: string, id: string, patch: UpdateSectorParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (response.status === 409) {
      const body = await response.json();
      if (body.conflict === "inviteCode") throw new SectorInviteCodeConflictError();
      throw new SectorNameConflictError();
    }
    if (!response.ok) throw new Error(`update sector failed with status ${response.status}`);
  }
```

Add `SectorInviteCodeConflictError` to this file's existing import of `SectorNameConflictError`
from `@/ports/manager-admin.port`.

- [ ] **Step 5: Run the adapter tests to verify they pass**

Run (from `apps/web`): `npx vitest run src/infrastructure/http/http-manager-admin.adapter.test.ts`
Expected: PASS.

- [ ] **Step 6: Update `CreateSectorUseCase` and `useCreateSector`**

Replace `apps/web/src/use-cases/create-sector.usecase.ts`:

```ts
import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class CreateSectorUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, params: { name: string; inviteCode?: string }): Promise<{ id: string; name: string }> {
    return this.port.createSector(token, params);
  }
}
```

Read `apps/web/src/use-cases/create-sector.usecase.test.ts` first, then update its call sites from
`useCase.execute(token, "UTI")` to `useCase.execute(token, { name: "UTI" })` (and add a case passing
`{ name: "UTI", inviteCode: "uti-2026" }` asserting it forwards both fields to the port).

Replace `apps/web/src/presentation/hooks/useCreateSector.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSectorUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useCreateSector() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; inviteCode?: string }) => createSectorUseCase.execute(token!, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sectors"] }),
  });
}
```

- [ ] **Step 7: Run the use-case test to verify it passes**

Run (from `apps/web`): `npx vitest run src/use-cases/create-sector.usecase.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/ports/manager-admin.port.ts apps/web/src/infrastructure/http/http-manager-admin.adapter.ts apps/web/src/infrastructure/http/http-manager-admin.adapter.test.ts apps/web/src/use-cases/create-sector.usecase.ts apps/web/src/use-cases/create-sector.usecase.test.ts apps/web/src/presentation/hooks/useCreateSector.ts
git commit -m "feat(web): thread an optional sector invite code through create/update"
```

---

### Task 11: `ManagerAdminSectorsPage` — invite-code field and "Gerar QR" action

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerAdminSectorsPage.test.tsx` (read first, add to
  its existing structure)

**Interfaces:**
- Consumes: `AdminSector.inviteCode`, `useCreateSector`'s new signature (Task 10),
  `SectorQrCodeModal` (Task 9).

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/pages/ManagerAdminSectorsPage.test.tsx` fully first, then add
these cases (adjusting fixture/mock setup — e.g. how `useAdminSectors` is mocked — to match the
file's existing conventions):

```tsx
  it("lets the gestor type an invite code when creating a sector", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar setor" }));
    fireEvent.change(screen.getByLabelText("Nome do setor"), { target: { value: "UTI" } });
    fireEvent.change(screen.getByLabelText("Código de convite (opcional)"), {
      target: { value: "uti-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(createSectorMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "UTI", inviteCode: "uti-2026" }),
        expect.anything(),
      ),
    );
  });

  it("disables the invite code field once a sector already has one", async () => {
    renderPage({ sectors: [{ id: "s1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" }] });
    fireEvent.click(screen.getByRole("button", { name: "Editar UTI" }));

    expect(screen.getByLabelText("Código de convite (opcional)")).toBeDisabled();
  });

  it("shows a 'Gerar QR' action only enabled when the sector has a code", async () => {
    renderPage({
      sectors: [
        { id: "s1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
        { id: "s2", name: "PS", isActive: true, managerId: null, managerName: null, inviteCode: null },
      ],
    });

    expect(screen.getByRole("button", { name: "Ver QR Code de UTI" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ver QR Code de PS" })).toBeDisabled();
  });

  it("opens the SectorQrCodeModal with the sector's code when 'Gerar QR' is clicked", async () => {
    renderPage({ sectors: [{ id: "s1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" }] });
    fireEvent.click(screen.getByRole("button", { name: "Ver QR Code de UTI" }));

    await waitFor(() => screen.getByTestId("sector-qr-canvas"));
    expect(screen.getByText("QR Code — UTI")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerAdminSectorsPage.test.tsx`
Expected: FAIL — no invite-code field, no second row action exists yet.

- [ ] **Step 3: Write the minimal implementation**

In `apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx`, update the import line:

```ts
import { Pencil, QrCode } from "lucide-react";
```

Add `import { SectorQrCodeModal } from "@/presentation/components/SectorQrCodeModal";`.

Extend `SectorFields`'s props and body to add the invite-code input right after the name field
(before the suggestions block):

```tsx
function SectorFields({
  idPrefix,
  name,
  onNameChange,
  nameDisabled,
  showSuggestions,
  inviteCode,
  onInviteCodeChange,
  inviteCodeDisabled,
  managers,
  managerId,
  onManagerChange,
}: {
  idPrefix: string;
  name: string;
  onNameChange?: (value: string) => void;
  nameDisabled?: boolean;
  showSuggestions?: boolean;
  inviteCode: string;
  onInviteCodeChange?: (value: string) => void;
  inviteCodeDisabled?: boolean;
  managers: ManagerSummary[];
  managerId: string | null;
  onManagerChange: (id: string | null) => void;
}) {
  const nameFieldId = `${idPrefix}-sector-name`;
  const inviteCodeFieldId = `${idPrefix}-sector-invite-code`;
  const managerFieldId = `${idPrefix}-sector-manager`;

  return (
    <>
      <label htmlFor={nameFieldId} className="text-label font-semibold text-ink-2">
        Nome do setor
      </label>
      <TextField
        id={nameFieldId}
        required
        value={name}
        disabled={nameDisabled}
        onChange={onNameChange ? (event) => onNameChange(event.target.value) : undefined}
        className="mt-2"
      />

      <label htmlFor={inviteCodeFieldId} className="mt-4 block text-label font-semibold text-ink-2">
        Código de convite (opcional)
      </label>
      <TextField
        id={inviteCodeFieldId}
        value={inviteCode}
        disabled={inviteCodeDisabled}
        onChange={onInviteCodeChange ? (event) => onInviteCodeChange(event.target.value) : undefined}
        className="mt-2"
      />

      {showSuggestions && (
```

(the rest of the function body — suggestions block, manager select — is unchanged; only the
props destructuring and the new label+field above are added).

In `ManagerAdminSectorsPage`, add state:

```ts
  const [inviteCode, setInviteCode] = useState("");
  const [editInviteCode, setEditInviteCode] = useState("");
  const [qrSector, setQrSector] = useState<{ name: string; inviteCode: string } | null>(null);
```

Update `openCreate`, `openEdit`, `handleCreateSubmit`, `handleSaveEdit`:

```ts
  const openCreate = () => {
    setName("");
    setInviteCode("");
    setManagerId(null);
    createSector.reset();
    setFormMode("create");
  };

  const openEdit = (sector: AdminSector) => {
    setEditingSector(sector);
    setEditInviteCode(sector.inviteCode ?? "");
    setEditManagerId(sector.managerId);
    setFormMode("edit");
  };
```

```ts
  const handleCreateSubmit = () => {
    createSector.mutate(
      { name, inviteCode: inviteCode.trim() || undefined },
      {
        onSuccess: (result) => {
          if (managerId === null) {
            closeModal();
            return;
          }
          updateSector.mutate(
            { id: result.id, patch: { managerId } },
            {
              onSuccess: () => closeModal(),
              onError: () => {
                closeModal();
                setNotice(
                  `Setor "${result.name}" criado, mas não foi possível atribuir o gestor. Edite o setor para tentar de novo.`,
                );
              },
            },
          );
        },
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editingSector) return;
    const patch: UpdateSectorParams = { managerId: editManagerId };
    if (!editingSector.inviteCode && editInviteCode.trim().length > 0) {
      patch.inviteCode = editInviteCode.trim();
    }
    updateSector.mutate({ id: editingSector.id, patch }, { onSuccess: () => closeModal() });
  };
```

Add `import type { UpdateSectorParams } from "@/ports/manager-admin.port";` alongside the existing
`AdminSector, ManagerSummary` type import from that same module (merge into one import
statement).

Replace `renderRowActions`:

```tsx
  const renderRowActions = (sector: AdminSector) => (
    <>
      <IconButton label={`Editar ${sector.name}`} icon={<Pencil size={16} aria-hidden="true" />} onClick={() => openEdit(sector)} />
      <IconButton
        label={`Ver QR Code de ${sector.name}`}
        icon={<QrCode size={16} aria-hidden="true" />}
        disabled={!sector.inviteCode}
        tooltip={sector.inviteCode ? undefined : "Cadastre um código de convite antes de gerar o QR"}
        onClick={() => setQrSector({ name: sector.name, inviteCode: sector.inviteCode! })}
      />
    </>
  );
```

Update the two `SectorFields` call sites in the JSX to pass the new props:

```tsx
            <SectorFields
              idPrefix="create"
              name={name}
              onNameChange={setName}
              showSuggestions
              inviteCode={inviteCode}
              onInviteCodeChange={setInviteCode}
              managers={managerList}
              managerId={managerId}
              onManagerChange={setManagerId}
            />
```

```tsx
            <SectorFields
              idPrefix={`edit-${editingSector.id}`}
              name={editingSector.name}
              nameDisabled
              inviteCode={editInviteCode}
              onInviteCodeChange={setEditInviteCode}
              inviteCodeDisabled={Boolean(editingSector.inviteCode)}
              managers={managerList}
              managerId={editManagerId}
              onManagerChange={setEditManagerId}
            />
```

Add the conflict-aware error message for create (replace the existing hardcoded paragraph):

```tsx
            {createSector.isError && (
              <p role="alert" className="mt-4 text-label text-danger">
                {createSector.error instanceof SectorInviteCodeConflictError
                  ? "Já existe um setor com esse código."
                  : "Já existe um setor com esse nome."}
              </p>
            )}
```

Add an error message for edit (there was none before — add it right after the edit `SectorFields`
call, still inside the `editingSector && (...)` block):

```tsx
              {updateSector.isError && (
                <p role="alert" className="mt-4 text-label text-danger">
                  {updateSector.error instanceof SectorInviteCodeConflictError
                    ? "Já existe um setor com esse código."
                    : "Não foi possível salvar. Tente de novo."}
                </p>
              )}
```

Import `SectorInviteCodeConflictError` from `@/ports/manager-admin.port` (merge into the existing
import from that module).

Mount the modal at the end of the component's returned JSX, right after the existing bulk-delete
`Modal`:

```tsx
      <SectorQrCodeModal
        isOpen={qrSector !== null}
        onClose={() => setQrSector(null)}
        sectorName={qrSector?.name ?? ""}
        inviteCode={qrSector?.inviteCode ?? ""}
      />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run src/presentation/pages/ManagerAdminSectorsPage.test.tsx`
Expected: PASS — including every pre-existing test in that file (none of the above should have
removed or renamed anything a prior test depended on).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx apps/web/src/presentation/pages/ManagerAdminSectorsPage.test.tsx
git commit -m "feat(web): let gestores set a sector invite code and generate its QR"
```

---

### Task 12: Frontend — admin-authenticated sector list (port, adapter, use-case, hook)

**Files:**
- Modify: `apps/web/src/ports/admin-institution.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-admin-institution.adapter.ts`
- Modify: `apps/web/src/infrastructure/http/http-admin-institution.adapter.test.ts` (read first)
- Create: `apps/web/src/use-cases/list-admin-institution-sectors.usecase.ts`
- Create: `apps/web/src/use-cases/list-admin-institution-sectors.usecase.test.ts`
- Modify: `apps/web/src/app/container/admin-institution.ts`
- Create: `apps/web/src/presentation/hooks/useAdminInstitutionSectors.ts`

**Interfaces:**
- Consumes: `GET /admin/institutions/:id/sectors` (Task 6).
- Produces: `useAdminInstitutionSectors(institutionId: string | null)` for Task 14.

- [ ] **Step 1: Write the failing adapter test**

Read `apps/web/src/infrastructure/http/http-admin-institution.adapter.test.ts` first for its exact
mock/fixture conventions, then add:

```ts
  it("listSectors fetches the institution's sectors with invite codes, authenticated", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
      ],
    } as Response);

    const adapter = new HttpAdminInstitutionAdapter();
    const result = await adapter.listSectors("token", "inst-1");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/admin/institutions/inst-1/sectors"),
      expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
    );
    expect(result).toEqual([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
    ]);
  });

  it("listSectors throws UnauthorizedAdminError on 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 401 } as Response);

    const adapter = new HttpAdminInstitutionAdapter();
    await expect(adapter.listSectors("token", "inst-1")).rejects.toThrow(UnauthorizedAdminError);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/infrastructure/http/http-admin-institution.adapter.test.ts`
Expected: FAIL — `listSectors` does not exist on the adapter yet.

- [ ] **Step 3: Update the port**

In `apps/web/src/ports/admin-institution.port.ts`, add after `AdminInstitutionPageSchema`:

```ts
export const AdminInstitutionSectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  managerId: z.string().nullable(),
  managerName: z.string().nullable(),
  inviteCode: z.string().nullable(),
});
export type AdminInstitutionSector = z.infer<typeof AdminInstitutionSectorSchema>;
```

Add to `AdminInstitutionPort`:

```ts
  listSectors(token: string, institutionId: string): Promise<AdminInstitutionSector[]>;
```

- [ ] **Step 4: Implement in the adapter**

In `apps/web/src/infrastructure/http/http-admin-institution.adapter.ts`, add the import
`AdminInstitutionSectorSchema` (alongside the existing named imports from
`@/ports/admin-institution.port`) and add the `z` import (`import { z } from "zod";`) at the top if
not already present. Add the method:

```ts
  async listSectors(token: string, institutionId: string): Promise<AdminInstitutionSector[]> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions/${institutionId}/sectors`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (!response.ok) throw new Error(`list institution sectors failed with status ${response.status}`);

    return z.array(AdminInstitutionSectorSchema).parse(await response.json());
  }
```

Also add `AdminInstitutionSector` to the type-only import list at the top of the file.

- [ ] **Step 5: Run the adapter test to verify it passes**

Run (from `apps/web`): `npx vitest run src/infrastructure/http/http-admin-institution.adapter.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing use-case test**

```ts
import { describe, expect, it, vi } from "vitest";
import { ListAdminInstitutionSectorsUseCase } from "./list-admin-institution-sectors.usecase";
import type { AdminInstitutionPort } from "@/ports/admin-institution.port";

describe("ListAdminInstitutionSectorsUseCase", () => {
  it("delegates to the port with the token and institution id", async () => {
    const port = { listSectors: vi.fn().mockResolvedValue([]) } as unknown as AdminInstitutionPort;
    const useCase = new ListAdminInstitutionSectorsUseCase(port);

    await useCase.execute("token", "inst-1");

    expect(port.listSectors).toHaveBeenCalledWith("token", "inst-1");
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run (from `apps/web`): `npx vitest run src/use-cases/list-admin-institution-sectors.usecase.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Write the minimal implementation**

```ts
import type { AdminInstitutionPort, AdminInstitutionSector } from "@/ports/admin-institution.port";

export class ListAdminInstitutionSectorsUseCase {
  constructor(private readonly port: AdminInstitutionPort) {}
  async execute(token: string, institutionId: string): Promise<AdminInstitutionSector[]> {
    return this.port.listSectors(token, institutionId);
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run (from `apps/web`): `npx vitest run src/use-cases/list-admin-institution-sectors.usecase.test.ts`
Expected: PASS.

- [ ] **Step 10: Register it in the container and add the hook**

In `apps/web/src/app/container/admin-institution.ts`, add:

```ts
import { ListAdminInstitutionSectorsUseCase } from "@/use-cases/list-admin-institution-sectors.usecase";
// ...
export const listAdminInstitutionSectorsUseCase = new ListAdminInstitutionSectorsUseCase(new HttpAdminInstitutionAdapter());
```

Create `apps/web/src/presentation/hooks/useAdminInstitutionSectors.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listAdminInstitutionSectorsUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

export function useAdminInstitutionSectors(institutionId: string | null) {
  const token = useAdminSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["admin-institution-sectors", institutionId, token],
    queryFn: () => listAdminInstitutionSectorsUseCase.execute(token!, institutionId!),
    enabled: token !== null && institutionId !== null,
  });
}
```

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/ports/admin-institution.port.ts apps/web/src/infrastructure/http/http-admin-institution.adapter.ts apps/web/src/infrastructure/http/http-admin-institution.adapter.test.ts apps/web/src/use-cases/list-admin-institution-sectors.usecase.ts apps/web/src/use-cases/list-admin-institution-sectors.usecase.test.ts apps/web/src/app/container/admin-institution.ts apps/web/src/presentation/hooks/useAdminInstitutionSectors.ts
git commit -m "feat(web): let the admin fetch a chosen institution's sectors with invite codes"
```

---

### Task 13: `DataTable` — optional per-row expand/collapse

**Files:**
- Modify: `apps/web/src/presentation/ui/DataTable/DataTable.tsx`
- Modify: `apps/web/src/presentation/ui/DataTable/DataTable.test.tsx` (read first, add to it)

**Interfaces:**
- Produces: three new optional `DataTableProps<T>` members —
  `renderExpanded?(row: T): ReactNode`, `isRowExpanded?(row: T): boolean`,
  `onToggleExpand?(row: T): void` — all three present together or all three absent. Task 14
  consumes these.

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/ui/DataTable/DataTable.test.tsx` fully first for its exact
fixture row shape and `selection` stub, then add (adapting the fixture to match):

```tsx
  it("renders no expand column when renderExpanded is not provided", () => {
    render(<DataTable {...baseProps} />);
    expect(screen.queryByLabelText(/expandir/i)).not.toBeInTheDocument();
  });

  it("renders an expand toggle per row when renderExpanded is provided, collapsed by default", () => {
    render(
      <DataTable
        {...baseProps}
        renderExpanded={(row) => <p>Detalhe de {row.name}</p>}
        isRowExpanded={() => false}
        onToggleExpand={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/expandir/i)).toBeInTheDocument();
    expect(screen.queryByText(/Detalhe de/)).not.toBeInTheDocument();
  });

  it("renders the expanded content in a full-width row when isRowExpanded returns true", () => {
    render(
      <DataTable
        {...baseProps}
        renderExpanded={(row) => <p>Detalhe de {row.name}</p>}
        isRowExpanded={() => true}
        onToggleExpand={vi.fn()}
      />,
    );

    expect(screen.getByText(/Detalhe de/)).toBeInTheDocument();
  });

  it("calls onToggleExpand with the row when its toggle is clicked", () => {
    const onToggleExpand = vi.fn();
    render(
      <DataTable
        {...baseProps}
        renderExpanded={() => <p>Detalhe</p>}
        isRowExpanded={() => false}
        onToggleExpand={onToggleExpand}
      />,
    );

    fireEvent.click(screen.getByLabelText(/expandir/i));
    expect(onToggleExpand).toHaveBeenCalledWith(baseProps.rows[0]);
  });
```

(`baseProps` and `fireEvent` should already exist/be imported in this test file per its existing
tests — reuse them, don't redeclare.)

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/presentation/ui/DataTable/DataTable.test.tsx`
Expected: FAIL — no expand column exists.

- [ ] **Step 3: Write the minimal implementation**

Replace the full contents of `apps/web/src/presentation/ui/DataTable/DataTable.tsx`:

```tsx
import { Fragment, type JSX, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/presentation/ui/Checkbox';
import { IconButton } from '@/presentation/ui/IconButton';
import { DataTableShell } from './DataTableShell';
import type { DataTableSelection } from './useDataTableSelection';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  width: string;
  cell(row: T): ReactNode;
  hideBelowLg?: boolean;
  breakAll?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  selection: DataTableSelection<T>;
  rowActions(row: T): ReactNode;
  toolbar: ReactNode;
  emptyState: ReactNode;
  caption: string;
  /**
   * The phone rendering of the same rows. Required, not optional: the table is
   * hidden below md, so a consumer that omitted this would render nothing at
   * all there. It lives inside the shell so the toolbar that filters it and the
   * bulk actions that act on it stay attached to the list they belong to.
   */
  mobileList: ReactNode;
  /** Fill the column and scroll the rows instead of the page. See DataTableShell. */
  fill?: boolean;
  /**
   * Optional per-row expand/collapse. Pass all three together (or none): a
   * toggle column renders before the caller's columns, and expanding a row
   * inserts `renderExpanded(row)` in a full-width row right below it. Desktop
   * table only — this does not touch `mobileList`.
   */
  renderExpanded?(row: T): ReactNode;
  isRowExpanded?(row: T): boolean;
  onToggleExpand?(row: T): void;
}

function rowLabel(row: { name?: string; id: string }): string {
  return row.name ?? row.id;
}

export function DataTable<T extends { id: string; isActive: boolean; name?: string }>({
  columns,
  rows,
  selection,
  rowActions,
  toolbar,
  emptyState,
  caption,
  mobileList,
  fill = false,
  renderExpanded,
  isRowExpanded,
  onToggleExpand,
}: DataTableProps<T>): JSX.Element {
  const hasExpand = renderExpanded !== undefined && isRowExpanded !== undefined && onToggleExpand !== undefined;

  return (
    <DataTableShell fill={fill} toolbar={toolbar}>
      {rows.length === 0 ? (
        emptyState
      ) : (
        <>
          <div data-testid="data-table-mobile" className="md:hidden">
            {mobileList}
          </div>
          <table className="hidden w-full table-fixed md:table">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line">
              <th scope="col" className="w-12 px-cell-x py-cell-y">
                <span className="sr-only">Seleção</span>
              </th>
              {hasExpand && (
                <th scope="col" className="w-10 px-cell-x py-cell-y">
                  <span className="sr-only">Expandir</span>
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-cell-x py-cell-y text-left font-sans text-caption font-semibold text-muted uppercase ${column.width} ${
                    column.hideBelowLg ? 'hidden lg:table-cell' : ''
                  }`}
                >
                  {column.header}
                </th>
              ))}
              <th scope="col" className="w-28 px-cell-x py-cell-y">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr
                  className={`border-b border-line last:border-b-0 ${
                    selection.isSelected(row.id) ? 'bg-brand/5' : ''
                  }`}
                >
                  <td className="px-cell-x py-cell-y">
                    <Checkbox
                      aria-label={`Selecionar ${rowLabel(row)}`}
                      checked={selection.isSelected(row.id)}
                      onChange={() => selection.toggle(row.id)}
                    />
                  </td>
                  {hasExpand && (
                    <td className="px-cell-x py-cell-y">
                      <IconButton
                        label={isRowExpanded!(row) ? `Recolher ${rowLabel(row)}` : `Expandir ${rowLabel(row)}`}
                        icon={
                          isRowExpanded!(row) ? (
                            <ChevronDown size={16} aria-hidden="true" />
                          ) : (
                            <ChevronRight size={16} aria-hidden="true" />
                          )
                        }
                        onClick={() => onToggleExpand!(row)}
                      />
                    </td>
                  )}
                  {columns.map((column) => {
                    const value = column.cell(row);
                    const isString = typeof value === 'string';
                    return (
                      <td
                        key={column.key}
                        className={`px-cell-x py-cell-y text-label text-ink ${column.width} ${
                          column.hideBelowLg ? 'hidden lg:table-cell' : ''
                        }`}
                      >
                        <span
                          className={
                            column.breakAll
                              ? 'block break-all whitespace-normal'
                              : isString
                                ? 'block truncate'
                                : 'block overflow-hidden'
                          }
                          title={column.breakAll || !isString ? undefined : value}
                        >
                          {value}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-cell-x py-cell-y">
                    <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                  </td>
                </tr>
                {hasExpand && isRowExpanded!(row) && (
                  <tr className="border-b border-line last:border-b-0 bg-canvas">
                    <td colSpan={columns.length + 3} className="px-cell-x py-cell-y">
                      {renderExpanded!(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            </tbody>
          </table>
        </>
      )}
    </DataTableShell>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run src/presentation/ui/DataTable/DataTable.test.tsx`
Expected: PASS — including every pre-existing test in the file (the new props are additive and
default to `undefined`, so no existing consumer's rendering changes).

- [ ] **Step 5: Run every other page's test suite that uses `DataTable`**

Run (from `apps/web`): `npx vitest run src/presentation/pages/AdminInstitutionsPage.test.tsx
src/presentation/pages/ManagerAdminSectorsPage.test.tsx src/presentation/pages/ManagerAdminManagersPage.test.tsx src/presentation/pages/ManagerAdminPeersPage.test.tsx`
Expected: PASS — confirms the `Fragment` restructuring of `tbody` didn't change any existing
table's rendered output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/ui/DataTable/DataTable.tsx apps/web/src/presentation/ui/DataTable/DataTable.test.tsx
git commit -m "feat(web): add optional per-row expand/collapse to DataTable"
```

---

### Task 14: `AdminInstitutionsPage` — expandable sector list with "Gerar QR"

**Files:**
- Modify: `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`
- Modify: `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx` (read first, add to it)

**Interfaces:**
- Consumes: `DataTable`'s new expand props (Task 13), `useAdminInstitutionSectors` (Task 12),
  `SectorQrCodeModal` (Task 9).

- [ ] **Step 1: Write the failing tests**

Read `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx` fully first for its exact
`useAdminInstitutions` mock shape, then add (mocking `useAdminInstitutionSectors` the same way the
file already mocks its other hooks):

```tsx
  it("expands a row to show its sectors, including one without an invite code", async () => {
    mockUseAdminInstitutionSectors.mockReturnValue({
      data: [
        { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
        { id: "sector-2", name: "PS", isActive: true, managerId: null, managerName: null, inviteCode: null },
      ],
      isLoading: false,
      isError: false,
    });

    renderPage();
    fireEvent.click(screen.getByLabelText(/expandir hospital são lucas/i));

    expect(await screen.findByText("UTI")).toBeInTheDocument();
    expect(screen.getByText("PS")).toBeInTheDocument();
  });

  it("only enables 'Gerar QR' for a sector that already has a code", async () => {
    mockUseAdminInstitutionSectors.mockReturnValue({
      data: [
        { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
        { id: "sector-2", name: "PS", isActive: true, managerId: null, managerName: null, inviteCode: null },
      ],
      isLoading: false,
      isError: false,
    });

    renderPage();
    fireEvent.click(screen.getByLabelText(/expandir hospital são lucas/i));
    await screen.findByText("UTI");

    expect(screen.getByRole("button", { name: "Ver QR Code de UTI" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ver QR Code de PS" })).toBeDisabled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/presentation/pages/AdminInstitutionsPage.test.tsx`
Expected: FAIL — no expand control exists yet.

- [ ] **Step 3: Write the minimal implementation**

In `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`, add imports:

```ts
import { useAdminInstitutionSectors } from "@/presentation/hooks/useAdminInstitutionSectors";
import { SectorQrCodeModal } from "@/presentation/components/SectorQrCodeModal";
```

Add state, right after `qrInstitution`:

```ts
  const [expandedInstitutionId, setExpandedInstitutionId] = useState<string | null>(null);
  const [qrSector, setQrSector] = useState<{ name: string; inviteCode: string } | null>(null);
  const expandedSectors = useAdminInstitutionSectors(expandedInstitutionId);
```

Add a small component, right after the `institutionStatusMessage` function (top level of the
file, not inside the page component — it needs no closure over page state beyond its props):

```tsx
function InstitutionSectorList({
  isLoading,
  isError,
  sectors,
  onGenerateQr,
}: {
  isLoading: boolean;
  isError: boolean;
  sectors: { id: string; name: string; inviteCode: string | null }[];
  onGenerateQr: (sector: { name: string; inviteCode: string }) => void;
}) {
  if (isLoading) return <p className="text-label text-muted">Carregando setores…</p>;
  if (isError) return <p className="text-label text-danger">Não foi possível carregar os setores.</p>;
  if (sectors.length === 0) return <p className="text-label text-muted">Nenhum setor cadastrado.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {sectors.map((sector) => (
        <li key={sector.id} className="flex items-center justify-between gap-3">
          <span className="text-label text-ink">{sector.name}</span>
          <IconButton
            label={`Ver QR Code de ${sector.name}`}
            icon={<QrCode size={16} aria-hidden="true" />}
            disabled={!sector.inviteCode}
            tooltip={sector.inviteCode ? undefined : "Este setor ainda não tem código de convite"}
            onClick={() => onGenerateQr({ name: sector.name, inviteCode: sector.inviteCode! })}
          />
        </li>
      ))}
    </ul>
  );
}
```

Wire the expand props into the `<DataTable>` call:

```tsx
          <DataTable
            fill
            caption="Instituições cadastradas"
            columns={COLUMNS}
            rows={filteredInstitutions}
            selection={selection}
            rowActions={renderRowActions}
            renderExpanded={(institution) => (
              <InstitutionSectorList
                isLoading={expandedSectors.isLoading}
                isError={expandedSectors.isError}
                sectors={expandedSectors.data ?? []}
                onGenerateQr={setQrSector}
              />
            )}
            isRowExpanded={(institution) => expandedInstitutionId === institution.id}
            onToggleExpand={(institution) =>
              setExpandedInstitutionId((current) => (current === institution.id ? null : institution.id))
            }
            toolbar={
```

(only the three new props are added; every other `DataTable` prop already there — `toolbar`,
`emptyState`, `mobileList` — stays exactly as it was.)

Mount the new modal at the end of the returned JSX, alongside the existing
`InstitutionQrCodeModal`:

```tsx
      <SectorQrCodeModal
        isOpen={qrSector !== null}
        onClose={() => setQrSector(null)}
        sectorName={qrSector?.name ?? ""}
        inviteCode={qrSector?.inviteCode ?? ""}
      />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run src/presentation/pages/AdminInstitutionsPage.test.tsx`
Expected: PASS — including every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/AdminInstitutionsPage.tsx apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx
git commit -m "feat(web): let the admin expand an institution's row to see and QR its sectors"
```

---

### Task 15: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full API test suite**

Run (from `apps/api`): `npx vitest run`
Expected: PASS, no regressions anywhere in the suite.

- [ ] **Step 2: Run the full web test suite**

Run (from `apps/web`): `npx vitest run`
Expected: PASS, no regressions anywhere in the suite.

- [ ] **Step 3: Typecheck both apps**

Run (from `apps/api`): `npx tsc --noEmit -p tsconfig.json`
Run (from `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean) on both.

- [ ] **Step 4: Lint the touched files**

Run (from `apps/web`):
```bash
npx eslint src/presentation/ui/DataTable/DataTable.tsx \
  src/presentation/pages/AdminInstitutionsPage.tsx src/presentation/pages/AdminInstitutionsPage.test.tsx \
  src/presentation/pages/ManagerAdminSectorsPage.tsx src/presentation/pages/ManagerAdminSectorsPage.test.tsx \
  src/presentation/components/QrCodeModal.tsx src/presentation/components/InstitutionQrCodeModal.tsx \
  src/presentation/components/SectorQrCodeModal.tsx \
  src/presentation/components/LinkInstitutionConfirmStep.tsx src/presentation/pages/LinkInstitutionPage.tsx \
  src/presentation/hooks/useLinkInstitutionFlow.ts src/presentation/hooks/useCreateSector.ts \
  src/presentation/hooks/useAdminInstitutionSectors.ts \
  src/ports/institution-link.port.ts src/ports/manager-admin.port.ts src/ports/admin-institution.port.ts \
  src/infrastructure/http/http-institution-link.adapter.ts src/infrastructure/http/http-manager-admin.adapter.ts \
  src/infrastructure/http/http-admin-institution.adapter.ts \
  src/use-cases/lookup-institution.usecase.ts src/use-cases/create-sector.usecase.ts \
  src/use-cases/list-admin-institution-sectors.usecase.ts
```
Expected: no output (clean).

Run (from `apps/api`):
```bash
npx eslint src/modules/sector src/modules/institution/infrastructure/institution.controller.ts \
  src/modules/manager/infrastructure/manager-admin.controller.ts \
  src/modules/admin/infrastructure/admin.controller.ts src/modules/admin/admin.module.ts
```
Expected: no output (clean).

- [ ] **Step 5: Manual smoke test**

Start both apps (`pnpm dev` from repo root, or per-app as this project's `run` skill/README
describes). As a `HOSPITAL_ADMIN` gestor: create a sector with an invite code, confirm the field
becomes disabled on re-opening edit, generate its QR and confirm the downloaded PNG's filename and
the on-screen code match. As the system Admin: expand an institution's row, confirm the same
sector and its code appear, and that a sector without a code shows a disabled QR button. As an
anonymous médico/aluno: scan (or manually type) the sector's code in the link flow and confirm it
lands on the new confirm screen with the right institution+sector names, accept it, and confirm
the vínculo completes; then try a manually-typed institution-only code and confirm the old
manual-sector-picker flow still works unchanged. Finally, deactivate that sector from
`ManagerAdminSectorsPage` and confirm re-scanning its QR now fails the same way a deactivated
institution's code does. This step has no automated assertion — it is the final human check that
the wiring behaves in a real browser against a real (or seeded local) database.

- [ ] **Step 6: Report**

No commit for this task — it is verification only. If any step surfaces a regression, fix it as
part of the task that introduced it (a new small fix commit, never amend) and re-run Steps 1–4.
