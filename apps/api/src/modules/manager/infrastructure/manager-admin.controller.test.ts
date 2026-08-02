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
