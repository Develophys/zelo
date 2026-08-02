import { describe, expect, it, afterAll, beforeAll, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import request from "supertest";
import { ManagerAdminController } from "./manager-admin.controller.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { HospitalAdminGuard } from "./hospital-admin.guard.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { SECTOR_REPOSITORY } from "../../sector/application/ports/sector-repository.port.ts";
import type { AdminSectorRow, SectorRepository, UpdateSectorParams } from "../../sector/application/ports/sector-repository.port.ts";
import { SectorNameConflictError } from "../../sector/application/ports/sector-repository.port.ts";
import { CreateManagerUseCase } from "../application/use-cases/create-manager.use-case.ts";
import { UpdateManagerUseCase } from "../application/use-cases/update-manager.use-case.ts";
import { ResetManagerPasswordUseCase } from "../application/use-cases/reset-manager-password.use-case.ts";
import { ManagerPasswordService } from "../application/services/manager-password.service.ts";
import { MANAGER_REPOSITORY } from "../application/ports/manager-repository.port.ts";
import type { CreateManagerParams, ManagerRepository, ManagerRow, ManagerSummaryRow, UpdateManagerParams } from "../application/ports/manager-repository.port.ts";

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
    return this.rows
      .filter((row) => row.institutionId === institutionId)
      .map(({ id, name, isActive, managerId, managerName }) => ({ id, name, isActive, managerId, managerName }));
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
  async reassignManagerSectors(): Promise<void> {
    // Manager-tab tests only assert the manager-side response; sector
    // reassignment side effects aren't checked here, so this is a no-op.
  }
  async findByIdsInInstitution(institutionId: string, sectorIds: string[]) {
    return this.rows.filter((row) => row.institutionId === institutionId && sectorIds.includes(row.id)).map(({ id }) => ({ id }));
  }
}

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

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { MANAGER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("manager admin controller — sectors", () => {
  let app: INestApplication;
  let sectorRepository: FakeSectorRepository;
  let managerRepository: FakeManagerRepository;
  let tokenService: ManagerTokenService;

  beforeAll(async () => {
    tokenService = new ManagerTokenService(fakeConfig());
    sectorRepository = new FakeSectorRepository();
    managerRepository = new FakeManagerRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [ManagerAdminController],
      providers: [
        ManagerAuthGuard,
        HospitalAdminGuard,
        { provide: ManagerTokenService, useValue: tokenService },
        { provide: SECTOR_REPOSITORY, useValue: sectorRepository },
        { provide: MANAGER_REPOSITORY, useValue: managerRepository },
        CreateManagerUseCase,
        UpdateManagerUseCase,
        ResetManagerPasswordUseCase,
        ManagerPasswordService,
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
    managerRepository.rows = [];
    managerRepository.activeHospitalAdmins = 1;
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
});
