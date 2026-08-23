# Admin Delete Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a hospital admin delete a manager, a sector or a peer partner — and refuse, with a reason, when deleting would destroy data the panel is built on.

**Architecture:** Three `DELETE` routes on the existing `ManagerAdminController`, each backed by a use case that checks its dependents before deleting. Nothing cascades: a sector with check-in history and a manager who still owns sectors are refused with `409`, pointing the admin at "Pausar" instead. Peer partners have no dependents and delete cleanly.

**Tech Stack:** NestJS 10 + Prisma 7 + Postgres (`apps/api`); React 19 + TanStack Query v5 (`apps/web`).

**Spec:** `docs/superpowers/specs/manager-panel/04-screen-layouts.md` §C names the bulk action; this plan supplies the backend it needs. Runs **before** `docs/superpowers/plans/2026-08-23-manager-panel-phase-04.md`, so the tables there are built with Excluir already available.

## Global Constraints

- **Ports, not classes.** Use cases depend on `MANAGER_REPOSITORY`, `SECTOR_REPOSITORY`, `PEER_PARTNER_REPOSITORY`, `SIGNAL_REPOSITORY` — all existing `Symbol` tokens.
- **`application/` must never import from `generated/prisma`.** `pnpm --filter @zelo/api lint:boundaries` enforces it.
- **`apps/api` imports carry the `.ts` extension** (NodeNext). `apps/web` uses `@/` and no extension. ESLint enforces `@typescript-eslint/consistent-type-imports` in both.
- **PT-BR copy is normative.** The refusal messages in Task 2 are the copy.
- **Every route stays behind `ManagerAuthGuard` + `HospitalAdminGuard`**, which `ManagerAdminController` already applies at class level.
- **Nothing cascades.** No `onDelete: Cascade` is added to `schema.prisma` in this plan. `Notification.managerId` already cascades and that is intentional and unchanged.

### Why refusal and not cascade

`Signal.sectorId` is a required foreign key to `Sector` with no `onDelete`, so Postgres restricts by default. That default is load-bearing, not an oversight: `Signal` rows are the weekly aggregates the whole dashboard is built on, and cascading a sector delete would silently rewrite the trend for every past week — a rate from twelve weeks ago would quietly acquire a different denominator. Refusing keeps the series honest and costs the admin one extra click on "Pausar", which is this product's real soft delete.

### Baseline

`main` is at `f0dbbb4`. **Three tests fail on the baseline for unrelated, pre-existing reasons:** two API tests (`src/shared/prisma/prisma.service.test.ts`, `src/modules/health/infrastructure/health.controller.test.ts`) fail because the Prisma/Neon account is at `planLimitReached`; one web test (`ChatPage.test.tsx > grows the composer with a long message`) fails on a clean tree. Do not chase them. **api 361 passing · web 1234 passing** before this plan starts.

No schema change is needed, so the Neon quota blocks nothing here.

---

## Task 1: The three delete use cases and their routes

**Files:**
- Modify: `apps/api/src/modules/manager/application/use-cases/manager-admin-errors.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/delete-manager.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/delete-peer-partner.use-case.ts`
- Create: `apps/api/src/modules/sector/application/use-cases/delete-sector.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/ports/manager-repository.port.ts`
- Modify: `apps/api/src/modules/sector/application/ports/sector-repository.port.ts`
- Modify: `apps/api/src/modules/peer-partner/application/ports/peer-partner-repository.port.ts`
- Modify: `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`
- Modify: the four matching Prisma adapters
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`
- Test: `delete-manager.use-case.test.ts`, `delete-peer-partner.use-case.test.ts`, `delete-sector.use-case.test.ts`, and `manager-admin.controller.test.ts`

**Interfaces:**
- Produces:
  - `class ManagerOwnsSectorsError extends Error` and `class SectorHasHistoryError extends Error` in `manager-admin-errors.ts`
  - `ManagerRepository.delete(id: string): Promise<void>`
  - `SectorRepository.delete(id: string): Promise<void>`
  - `PeerPartnerRepository.delete(id: string): Promise<void>`
  - `SignalRepository.countBySector(sectorId: string): Promise<number>`
  - `DeleteManagerUseCase.execute(input: { institutionId: string; managerId: string }): Promise<void>`
  - `DeleteSectorUseCase.execute(input: { institutionId: string; sectorId: string }): Promise<void>`
  - `DeletePeerPartnerUseCase.execute(input: { institutionId: string; peerPartnerId: string }): Promise<void>`
  - Routes `DELETE /manager/admin/managers/:id`, `DELETE /manager/admin/sectors/:id`, `DELETE /manager/admin/peer-partners/:id`, all `204` on success

- [ ] **Step 1: Write the failing use-case tests**

`apps/api/src/modules/manager/application/use-cases/delete-manager.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DeleteManagerUseCase } from "./delete-manager.use-case.ts";
import {
  LastActiveHospitalAdminError,
  ManagerNotFoundError,
  ManagerOwnsSectorsError,
} from "./manager-admin-errors.ts";
import type { ManagerRepository, ManagerRow } from "../ports/manager-repository.port.ts";
import type { SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";

const MANAGER: ManagerRow = {
  id: "manager-2",
  name: "Bruno",
  email: "bruno@zelo-demo.local",
  passwordHash: "hash",
  setPasswordTokenExpiresAt: null,
  institutionId: "institution-1",
  role: "SECTOR_MANAGER",
  isActive: true,
};

function build(options: {
  manager?: ManagerRow | null;
  ownedSectorIds?: string[];
  activeAdmins?: number;
} = {}) {
  const deleted: string[] = [];
  const managers = {
    findById: async () => (options.manager === undefined ? MANAGER : options.manager),
    countActiveHospitalAdmins: async () => options.activeAdmins ?? 2,
    delete: async (id: string) => {
      deleted.push(id);
    },
  } as unknown as ManagerRepository;
  const sectors = {
    findAssignedSectorIds: async () => options.ownedSectorIds ?? [],
  } as unknown as SectorRepository;

  return { useCase: new DeleteManagerUseCase(managers, sectors), deleted };
}

const input = { institutionId: "institution-1", managerId: "manager-2" };

describe("DeleteManagerUseCase", () => {
  it("deletes a manager who owns no sector", async () => {
    const { useCase, deleted } = build();
    await useCase.execute(input);
    expect(deleted).toEqual(["manager-2"]);
  });

  it("refuses a manager from another institution as not found, revealing nothing", async () => {
    const { useCase, deleted } = build({
      manager: { ...MANAGER, institutionId: "institution-2" },
    });
    await expect(useCase.execute(input)).rejects.toThrow(ManagerNotFoundError);
    expect(deleted).toEqual([]);
  });

  it("refuses an unknown manager", async () => {
    const { useCase } = build({ manager: null });
    await expect(useCase.execute(input)).rejects.toThrow(ManagerNotFoundError);
  });

  // Deleting the sector's owner would leave the sector orphaned at the database
  // level (Sector.managerId RESTRICTs), so the check is explicit and the message
  // tells the admin what to do about it.
  it("refuses a manager who still owns sectors", async () => {
    const { useCase, deleted } = build({ ownedSectorIds: ["sector-1"] });
    await expect(useCase.execute(input)).rejects.toThrow(ManagerOwnsSectorsError);
    expect(deleted).toEqual([]);
  });

  // Same guard UpdateManagerUseCase already applies to deactivation and
  // demotion — without it an institution locks itself out with no recovery.
  it("refuses to delete the last active hospital admin", async () => {
    const { useCase, deleted } = build({
      manager: { ...MANAGER, role: "HOSPITAL_ADMIN" },
      activeAdmins: 1,
    });
    await expect(useCase.execute(input)).rejects.toThrow(LastActiveHospitalAdminError);
    expect(deleted).toEqual([]);
  });

  it("allows deleting a hospital admin while another active one remains", async () => {
    const { useCase, deleted } = build({
      manager: { ...MANAGER, role: "HOSPITAL_ADMIN" },
      activeAdmins: 2,
    });
    await useCase.execute(input);
    expect(deleted).toEqual(["manager-2"]);
  });

  // An inactive admin is not holding the door open for anyone, so the
  // last-admin guard must not count them and must not block on them.
  it("deletes an inactive hospital admin without consulting the last-admin guard", async () => {
    const { useCase, deleted } = build({
      manager: { ...MANAGER, role: "HOSPITAL_ADMIN", isActive: false },
      activeAdmins: 1,
    });
    await useCase.execute(input);
    expect(deleted).toEqual(["manager-2"]);
  });
});
```

`apps/api/src/modules/sector/application/use-cases/delete-sector.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DeleteSectorUseCase } from "./delete-sector.use-case.ts";
import { SectorHasHistoryError } from "../../../manager/application/use-cases/manager-admin-errors.ts";
import { SectorNotInInstitutionError } from "../../../manager/application/use-cases/manager-admin-errors.ts";
import type { SectorRepository } from "../ports/sector-repository.port.ts";
import type { SignalRepository } from "../../../manager/application/ports/signal-repository.port.ts";

function build(options: {
  sector?: { id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean } | null;
  signalCount?: number;
} = {}) {
  const deleted: string[] = [];
  const sectors = {
    findById: async () =>
      options.sector === undefined
        ? { id: "sector-1", institutionId: "institution-1", name: "UTI", managerId: null, isActive: true }
        : options.sector,
    delete: async (id: string) => {
      deleted.push(id);
    },
  } as unknown as SectorRepository;
  const signals = {
    countBySector: async () => options.signalCount ?? 0,
  } as unknown as SignalRepository;

  return { useCase: new DeleteSectorUseCase(sectors, signals), deleted };
}

const input = { institutionId: "institution-1", sectorId: "sector-1" };

describe("DeleteSectorUseCase", () => {
  it("deletes a sector that never received a check-in", async () => {
    const { useCase, deleted } = build();
    await useCase.execute(input);
    expect(deleted).toEqual(["sector-1"]);
  });

  // Signal rows are the aggregates the whole dashboard is built on. Cascading
  // here would silently rewrite the trend for every past week.
  it("refuses a sector that has check-in history", async () => {
    const { useCase, deleted } = build({ signalCount: 1 });
    await expect(useCase.execute(input)).rejects.toThrow(SectorHasHistoryError);
    expect(deleted).toEqual([]);
  });

  it("refuses a sector from another institution as not found", async () => {
    const { useCase } = build({
      sector: { id: "sector-1", institutionId: "institution-2", name: "UTI", managerId: null, isActive: true },
    });
    await expect(useCase.execute(input)).rejects.toThrow(SectorNotInInstitutionError);
  });

  it("refuses an unknown sector", async () => {
    const { useCase } = build({ sector: null });
    await expect(useCase.execute(input)).rejects.toThrow(SectorNotInInstitutionError);
  });

  it("checks history before deleting, never after", async () => {
    const { useCase, deleted } = build({ signalCount: 5 });
    await expect(useCase.execute(input)).rejects.toThrow(SectorHasHistoryError);
    expect(deleted).toEqual([]);
  });
});
```

`apps/api/src/modules/manager/application/use-cases/delete-peer-partner.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DeletePeerPartnerUseCase } from "./delete-peer-partner.use-case.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";

const PEER: PeerPartnerRow = {
  id: "peer-1",
  name: "Dra. Ana",
  email: "ana@zelo-demo.local",
  passwordHash: "hash",
  setPasswordTokenExpiresAt: null,
  institutionId: "institution-1",
  specialty: "Clínica médica",
  isActive: true,
};

function build(peer: PeerPartnerRow | null = PEER) {
  const deleted: string[] = [];
  const repository = {
    findById: async () => peer,
    delete: async (id: string) => {
      deleted.push(id);
    },
  } as unknown as PeerPartnerRepository;
  return { useCase: new DeletePeerPartnerUseCase(repository), deleted };
}

const input = { institutionId: "institution-1", peerPartnerId: "peer-1" };

describe("DeletePeerPartnerUseCase", () => {
  // Nothing in the schema references PeerPartner, so this delete has no
  // dependents to guard — the only check is that it is ours.
  it("deletes a peer partner", async () => {
    const { useCase, deleted } = build();
    await useCase.execute(input);
    expect(deleted).toEqual(["peer-1"]);
  });

  it("refuses a peer partner from another institution as not found", async () => {
    const { useCase, deleted } = build({ ...PEER, institutionId: "institution-2" });
    await expect(useCase.execute(input)).rejects.toThrow(PeerPartnerNotFoundError);
    expect(deleted).toEqual([]);
  });

  it("refuses an unknown peer partner", async () => {
    const { useCase } = build(null);
    await expect(useCase.execute(input)).rejects.toThrow(PeerPartnerNotFoundError);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @zelo/api exec vitest run delete-manager delete-sector delete-peer-partner`
Expected: FAIL — none of the three modules exist.

- [ ] **Step 3: Add the two error types**

Append to `manager-admin-errors.ts`:

```ts
export class ManagerOwnsSectorsError extends Error {}
export class SectorHasHistoryError extends Error {}
```

- [ ] **Step 4: Implement the three use cases**

`delete-manager.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import {
  LastActiveHospitalAdminError,
  ManagerNotFoundError,
  ManagerOwnsSectorsError,
} from "./manager-admin-errors.ts";

export interface DeleteManagerInput {
  institutionId: string;
  managerId: string;
}

@Injectable()
export class DeleteManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  async execute(input: DeleteManagerInput): Promise<void> {
    const manager = await this.managerRepository.findById(input.managerId);
    // A manager from another institution is "not found", never "forbidden":
    // the difference would confirm that the id exists.
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    // Sector.managerId RESTRICTs, so this would fail at the database anyway —
    // checking here turns an opaque constraint violation into a message that
    // says which action to take instead.
    const ownedSectorIds = await this.sectorRepository.findAssignedSectorIds(input.managerId);
    if (ownedSectorIds.length > 0) {
      throw new ManagerOwnsSectorsError();
    }

    // The same door this institution could already lock itself behind by
    // deactivating or demoting its last admin — deleting is no different, and
    // has no undo at all.
    if (manager.role === "HOSPITAL_ADMIN" && manager.isActive) {
      const activeHospitalAdmins = await this.managerRepository.countActiveHospitalAdmins(
        input.institutionId,
      );
      if (activeHospitalAdmins <= 1) {
        throw new LastActiveHospitalAdminError();
      }
    }

    await this.managerRepository.delete(input.managerId);
  }
}
```

`delete-sector.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { SECTOR_REPOSITORY, type SectorRepository } from "../ports/sector-repository.port.ts";
import { SIGNAL_REPOSITORY, type SignalRepository } from "../../../manager/application/ports/signal-repository.port.ts";
import {
  SectorHasHistoryError,
  SectorNotInInstitutionError,
} from "../../../manager/application/use-cases/manager-admin-errors.ts";

export interface DeleteSectorInput {
  institutionId: string;
  sectorId: string;
}

@Injectable()
export class DeleteSectorUseCase {
  constructor(
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(SIGNAL_REPOSITORY) private readonly signalRepository: SignalRepository,
  ) {}

  async execute(input: DeleteSectorInput): Promise<void> {
    const sector = await this.sectorRepository.findById(input.sectorId);
    if (!sector || sector.institutionId !== input.institutionId) {
      throw new SectorNotInInstitutionError();
    }

    // Signal rows are the weekly aggregates every trend on the dashboard reads.
    // Deleting through them would rewrite history for weeks already reported.
    const signalCount = await this.signalRepository.countBySector(input.sectorId);
    if (signalCount > 0) {
      throw new SectorHasHistoryError();
    }

    await this.sectorRepository.delete(input.sectorId);
  }
}
```

`delete-peer-partner.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import {
  PEER_PARTNER_REPOSITORY,
  type PeerPartnerRepository,
} from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";

export interface DeletePeerPartnerInput {
  institutionId: string;
  peerPartnerId: string;
}

@Injectable()
export class DeletePeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
  ) {}

  async execute(input: DeletePeerPartnerInput): Promise<void> {
    const peerPartner = await this.repository.findById(input.peerPartnerId);
    if (!peerPartner || peerPartner.institutionId !== input.institutionId) {
      throw new PeerPartnerNotFoundError();
    }

    await this.repository.delete(input.peerPartnerId);
  }
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `pnpm --filter @zelo/api exec vitest run delete-manager delete-sector delete-peer-partner`
Expected: PASS — 15 tests.

- [ ] **Step 6: Add the four repository methods**

Ports gain, respectively:

```ts
  // ManagerRepository
  delete(id: string): Promise<void>;
  // SectorRepository
  delete(id: string): Promise<void>;
  // PeerPartnerRepository
  delete(id: string): Promise<void>;
  // SignalRepository
  countBySector(sectorId: string): Promise<number>;
```

Prisma adapters:

```ts
  // prisma-manager.repository.ts
  async delete(id: string): Promise<void> {
    await this.prisma.manager.delete({ where: { id } });
  }

  // prisma-sector.repository.ts
  async delete(id: string): Promise<void> {
    await this.prisma.sector.delete({ where: { id } });
  }

  // prisma-peer-partner.repository.ts
  async delete(id: string): Promise<void> {
    await this.prisma.peerPartner.delete({ where: { id } });
  }

  // prisma-signal.repository.ts
  async countBySector(sectorId: string): Promise<number> {
    return this.prisma.signal.count({ where: { sectorId } });
  }
```

Adding a method to these interfaces breaks every existing fake. Find them with
`grep -rln "ManagerRepository\|SectorRepository\|PeerPartnerRepository\|SignalRepository" apps/api/src --include=*.test.ts`
and add a throwing stub to each — `async delete(): Promise<never> { throw new Error("not used in this test"); }` — matching the convention already used across this codebase's fakes.

- [ ] **Step 7: Write the failing controller tests**

Append to `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`, following the file's existing pattern (real `ManagerAuthGuard` and a token issued by `ManagerTokenService` — this codebase has zero `overrideGuard` usages):

```ts
  it("deletes a manager and answers 204", async () => {
    await request(app.getHttpServer())
      .delete("/manager/admin/managers/manager-2")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
  });

  it("answers 409 when the manager still owns sectors", async () => {
    sectorRepository.assignedSectorIds = ["sector-1"];

    await request(app.getHttpServer())
      .delete("/manager/admin/managers/manager-2")
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    sectorRepository.assignedSectorIds = [];
  });

  it("answers 409 rather than locking the institution out of its own panel", async () => {
    managerRepository.activeHospitalAdmins = 1;

    await request(app.getHttpServer())
      .delete("/manager/admin/managers/manager-1")
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    managerRepository.activeHospitalAdmins = 2;
  });

  it("answers 409 when the sector has check-in history, instead of destroying it", async () => {
    signalRepository.countBySectorResult = 3;

    await request(app.getHttpServer())
      .delete("/manager/admin/sectors/sector-1")
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    signalRepository.countBySectorResult = 0;
  });

  it("deletes a sector with no history and answers 204", async () => {
    await request(app.getHttpServer())
      .delete("/manager/admin/sectors/sector-1")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
  });

  it("deletes a peer partner and answers 204", async () => {
    await request(app.getHttpServer())
      .delete("/manager/admin/peer-partners/peer-1")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
  });

  it("answers 404 for an entity in another institution, revealing nothing about it", async () => {
    await request(app.getHttpServer())
      .delete("/manager/admin/managers/manager-from-elsewhere")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("refuses a SECTOR_MANAGER, who is not an admin", async () => {
    await request(app.getHttpServer())
      .delete("/manager/admin/sectors/sector-1")
      .set("Authorization", `Bearer ${sectorManagerToken}`)
      .expect(403);
  });
```

Extend the file's existing fakes with the fields these tests set (`assignedSectorIds`, `activeHospitalAdmins`, `countBySectorResult`) and a `sectorManagerToken` issued for a `SECTOR_MANAGER`, following how the file already builds `token`.

- [ ] **Step 8: Run them and watch them fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/infrastructure/manager-admin.controller.test.ts`
Expected: FAIL — 404 on every route, since none exist yet.

- [ ] **Step 9: Add the three routes**

In `manager-admin.controller.ts` — the class already carries `@UseGuards(ManagerAuthGuard, HospitalAdminGuard)`, so each route inherits both:

```ts
  @Delete("managers/:id")
  @HttpCode(204)
  async deleteManager(@Req() request: Request, @Param("id") id: string): Promise<void> {
    try {
      await this.deleteManagerUseCase.execute({
        institutionId: request.manager!.institutionId,
        managerId: id,
      });
    } catch (error) {
      if (error instanceof ManagerNotFoundError) throw new NotFoundException();
      if (error instanceof ManagerOwnsSectorsError) throw new ConflictException("MANAGER_OWNS_SECTORS");
      if (error instanceof LastActiveHospitalAdminError) throw new ConflictException("LAST_ADMIN");
      throw error;
    }
  }

  @Delete("sectors/:id")
  @HttpCode(204)
  async deleteSector(@Req() request: Request, @Param("id") id: string): Promise<void> {
    try {
      await this.deleteSectorUseCase.execute({
        institutionId: request.manager!.institutionId,
        sectorId: id,
      });
    } catch (error) {
      if (error instanceof SectorNotInInstitutionError) throw new NotFoundException();
      if (error instanceof SectorHasHistoryError) throw new ConflictException("SECTOR_HAS_HISTORY");
      throw error;
    }
  }

  @Delete("peer-partners/:id")
  @HttpCode(204)
  async deletePeerPartner(@Req() request: Request, @Param("id") id: string): Promise<void> {
    try {
      await this.deletePeerPartnerUseCase.execute({
        institutionId: request.manager!.institutionId,
        peerPartnerId: id,
      });
    } catch (error) {
      if (error instanceof PeerPartnerNotFoundError) throw new NotFoundException();
      throw error;
    }
  }
```

The conflict bodies carry a machine-readable reason (`MANAGER_OWNS_SECTORS`, `LAST_ADMIN`, `SECTOR_HAS_HISTORY`) because Task 2's client renders a different sentence for each — a bare 409 would force the UI to guess.

Register the three use cases in `ManagerModule`'s `providers`, and import `Delete` and `Param` from `@nestjs/common`.

- [ ] **Step 10: Run them and watch them pass**

Run: `pnpm --filter @zelo/api test`
Expected: PASS except the two known baseline failures.

- [ ] **Step 11: Lint, build, commit**

```bash
pnpm --filter @zelo/api lint && pnpm --filter @zelo/api lint:boundaries && pnpm --filter @zelo/api build
git add apps/api/src
git commit -m "feat(api): delete endpoints for managers, sectors and peer partners"
```

---

## Task 2: The web data layer for delete

No UI in this task — Phase 04's tables consume these hooks.

**Files:**
- Modify: `apps/web/src/ports/manager-admin.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts`
- Create: `apps/web/src/use-cases/delete-manager.usecase.ts`
- Create: `apps/web/src/use-cases/delete-sector.usecase.ts`
- Create: `apps/web/src/use-cases/delete-peer-partner.usecase.ts`
- Modify: `apps/web/src/app/container/manager-admin.ts`
- Create: `apps/web/src/presentation/hooks/useDeleteManager.ts`
- Create: `apps/web/src/presentation/hooks/useDeleteSector.ts`
- Create: `apps/web/src/presentation/hooks/useDeletePeerPartner.ts`
- Test: `apps/web/src/infrastructure/http/http-manager-admin-delete.adapter.test.ts`

**Interfaces:**
- Consumes: the three routes from Task 1.
- Produces:
  - `class AdminDeleteConflictError extends Error` carrying `reason: "MANAGER_OWNS_SECTORS" | "LAST_ADMIN" | "SECTOR_HAS_HISTORY" | "UNKNOWN"`, exported from `@/ports/manager-admin.port`
  - `ManagerAdminPort` gains `deleteManager(token, id)`, `deleteSector(token, id)`, `deletePeerPartner(token, id)`, each `Promise<void>`
  - `deleteManagerAdminUseCase`, `deleteSectorAdminUseCase`, `deletePeerPartnerAdminUseCase` from `@/app/container`
  - `useDeleteManager()`, `useDeleteSector()`, `useDeletePeerPartner()` — TanStack mutations taking an `id: string`
  - `deleteConflictMessage(error: unknown): string | null` — the PT-BR sentence for a conflict, `null` for anything else

**The refusal copy (normative):**

| Reason | Sentence |
|---|---|
| `SECTOR_HAS_HISTORY` | `Este setor tem histórico de check-ins e não pode ser excluído. Pause-o para tirá-lo do painel.` |
| `MANAGER_OWNS_SECTORS` | `Este gestor ainda é responsável por setores. Reatribua os setores antes de excluí-lo.` |
| `LAST_ADMIN` | `Este é o último administrador ativo do hospital. Cadastre outro antes de excluí-lo.` |
| `UNKNOWN` | `Não foi possível excluir. Tente de novo.` |

- [ ] **Step 1: Write the failing adapter test**

`apps/web/src/infrastructure/http/http-manager-admin-delete.adapter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpManagerAdminAdapter } from "./http-manager-admin.adapter";
import { AdminDeleteConflictError, deleteConflictMessage } from "@/ports/manager-admin.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpManagerAdminAdapter deletes", () => {
  it("sends DELETE with the bearer token", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await new HttpManagerAdminAdapter().deleteManager("token", "m1");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/manager/admin/managers/m1");
    expect(init!.method).toBe("DELETE");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it.each([
    ["MANAGER_OWNS_SECTORS", "manager"],
    ["LAST_ADMIN", "manager"],
  ])("raises a typed conflict carrying the %s reason", async (reason) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: reason }), { status: 409 }),
    );

    await expect(new HttpManagerAdminAdapter().deleteManager("token", "m1")).rejects.toMatchObject({
      reason,
    });
  });

  it("raises a conflict with UNKNOWN when the body carries no recognised reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 409 }));

    await expect(new HttpManagerAdminAdapter().deleteSector("token", "s1")).rejects.toMatchObject({
      reason: "UNKNOWN",
    });
  });

  it("raises UnauthorizedManagerError on a 401, like every other call on this port", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    await expect(new HttpManagerAdminAdapter().deletePeerPartner("token", "p1")).rejects.toThrow(
      UnauthorizedManagerError,
    );
  });

  it("deletes a sector and a peer partner through their own routes", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await new HttpManagerAdminAdapter().deleteSector("token", "s1");
    await new HttpManagerAdminAdapter().deletePeerPartner("token", "p1");

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/manager/admin/sectors/s1");
    expect(String(fetchSpy.mock.calls[1]![0])).toContain("/manager/admin/peer-partners/p1");
  });
});

describe("deleteConflictMessage", () => {
  it("names the way out for a sector with history", () => {
    expect(deleteConflictMessage(new AdminDeleteConflictError("SECTOR_HAS_HISTORY"))).toBe(
      "Este setor tem histórico de check-ins e não pode ser excluído. Pause-o para tirá-lo do painel.",
    );
  });

  it("names the way out for a manager who still owns sectors", () => {
    expect(deleteConflictMessage(new AdminDeleteConflictError("MANAGER_OWNS_SECTORS"))).toBe(
      "Este gestor ainda é responsável por setores. Reatribua os setores antes de excluí-lo.",
    );
  });

  it("names the way out for the last admin", () => {
    expect(deleteConflictMessage(new AdminDeleteConflictError("LAST_ADMIN"))).toBe(
      "Este é o último administrador ativo do hospital. Cadastre outro antes de excluí-lo.",
    );
  });

  it("falls back to a plain retry sentence", () => {
    expect(deleteConflictMessage(new AdminDeleteConflictError("UNKNOWN"))).toBe(
      "Não foi possível excluir. Tente de novo.",
    );
  });

  it("returns null for an error that is not a delete conflict", () => {
    expect(deleteConflictMessage(new Error("network"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/infrastructure/http/http-manager-admin-delete.adapter.test.ts`
Expected: FAIL — `AdminDeleteConflictError` is not exported.

- [ ] **Step 3: Implement the port additions**

In `@/ports/manager-admin.port`:

```ts
export type AdminDeleteConflictReason =
  | "MANAGER_OWNS_SECTORS"
  | "LAST_ADMIN"
  | "SECTOR_HAS_HISTORY"
  | "UNKNOWN";

export class AdminDeleteConflictError extends Error {
  constructor(readonly reason: AdminDeleteConflictReason) {
    super(reason);
    this.name = "AdminDeleteConflictError";
  }
}

const CONFLICT_MESSAGE: Record<AdminDeleteConflictReason, string> = {
  SECTOR_HAS_HISTORY:
    "Este setor tem histórico de check-ins e não pode ser excluído. Pause-o para tirá-lo do painel.",
  MANAGER_OWNS_SECTORS:
    "Este gestor ainda é responsável por setores. Reatribua os setores antes de excluí-lo.",
  LAST_ADMIN:
    "Este é o último administrador ativo do hospital. Cadastre outro antes de excluí-lo.",
  UNKNOWN: "Não foi possível excluir. Tente de novo.",
};

/** The sentence to show for a delete refusal, or null when the error is something else. */
export function deleteConflictMessage(error: unknown): string | null {
  return error instanceof AdminDeleteConflictError ? CONFLICT_MESSAGE[error.reason] : null;
}
```

and add the three methods to `ManagerAdminPort`.

- [ ] **Step 4: Implement the adapter**

Add one shared private helper to `HttpManagerAdminAdapter` and three thin callers:

```ts
  private async deleteResource(token: string, path: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new UnauthorizedManagerError();
    if (response.status === 409) {
      // Nest puts our reason string in `message`. A body we cannot read is
      // still a refusal — fall back rather than throwing a parse error.
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const raw = typeof body?.message === "string" ? body.message : "";
      const reason: AdminDeleteConflictReason =
        raw === "MANAGER_OWNS_SECTORS" || raw === "LAST_ADMIN" || raw === "SECTOR_HAS_HISTORY"
          ? raw
          : "UNKNOWN";
      throw new AdminDeleteConflictError(reason);
    }
    if (!response.ok) throw new Error(`delete failed with status ${response.status}`);
  }

  async deleteManager(token: string, id: string): Promise<void> {
    return this.deleteResource(token, `/manager/admin/managers/${id}`);
  }

  async deleteSector(token: string, id: string): Promise<void> {
    return this.deleteResource(token, `/manager/admin/sectors/${id}`);
  }

  async deletePeerPartner(token: string, id: string): Promise<void> {
    return this.deleteResource(token, `/manager/admin/peer-partners/${id}`);
  }
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/infrastructure/http/http-manager-admin-delete.adapter.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 6: Add the use cases, container wiring and hooks**

Each use case is a thin delegate, matching `update-manager.usecase.ts`:

```ts
import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class DeleteManagerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}

  async execute(token: string, id: string): Promise<void> {
    return this.port.deleteManager(token, id);
  }
}
```

The other two are the same shape against `deleteSector` / `deletePeerPartner`. Export all three from `app/container/manager-admin.ts` as `deleteManagerAdminUseCase`, `deleteSectorAdminUseCase`, `deletePeerPartnerAdminUseCase`, reusing the existing `managerAdminAdapter` instance.

Each hook follows `useUpdateManager` exactly, invalidating both admin query keys because deleting a manager can change which sectors show a responsible manager:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteManagerAdminUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useDeleteManager() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteManagerAdminUseCase.execute(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
```

`useDeleteSector` invalidates the same two keys; `useDeletePeerPartner` invalidates `["admin-peer-partners"]`. Check the exact key each existing list hook uses before writing these — an invalidation against the wrong key is a stale list that looks like a failed delete.

- [ ] **Step 7: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): data layer for admin deletes, with typed refusal reasons"
```

---

## Done

The three bulk-action pages consume this in Phase 04. What that plan must now do differently:

- **"Excluir" is built.** Enabled with ≥1 row selected; disabled tooltip `Selecione ao menos um gestor` (and the sector/peer equivalents).
- It opens a **confirm dialog** first — the spec requires one for destructive actions, and this one is genuinely irreversible.
- A refusal is not a failure toast: render `deleteConflictMessage(error)` in the dialog, because every refusal names the action to take instead.
- Bulk delete is a **per-item loop** over the hook, as with the other bulk actions. If some items refuse and others succeed, report both — a silent partial success would leave the manager believing rows are gone that are not.
