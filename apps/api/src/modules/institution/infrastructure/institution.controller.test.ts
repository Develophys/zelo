import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { InstitutionController } from "./institution.controller.ts";
import { GetInstitutionByInviteCodeUseCase } from "../application/use-cases/get-institution-by-invite-code.use-case.ts";
import { INSTITUTION_REPOSITORY } from "../application/ports/institution-repository.port.ts";
import type { InstitutionRepository, InstitutionRow } from "../application/ports/institution-repository.port.ts";
import { SECTOR_REPOSITORY } from "../../sector/application/ports/sector-repository.port.ts";
import type {
  AdminSectorRow,
  SectorRepository,
  UpdateSectorParams,
} from "../../sector/application/ports/sector-repository.port.ts";

class FakeInstitutionRepository implements InstitutionRepository {
  public rows: InstitutionRow[] = [];
  async findByInviteCode(inviteCode: string): Promise<InstitutionRow | null> {
    return this.rows.find((row) => row.inviteCode === inviteCode) ?? null;
  }
}

class FakeSectorRepository implements SectorRepository {
  public activeByInstitution: Record<string, { id: string; name: string }[]> = {};

  async create(): Promise<{ id: string; name: string }> {
    throw new Error("not used in this test");
  }
  async findAllForAdmin(): Promise<AdminSectorRow[]> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<{ id: string; institutionId: string } | null> {
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
}

describe("institution controller", () => {
  let app: INestApplication;
  let repository: FakeInstitutionRepository;
  let sectorRepository: FakeSectorRepository;

  beforeAll(async () => {
    repository = new FakeInstitutionRepository();
    repository.rows = [{ id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026" }];
    sectorRepository = new FakeSectorRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [InstitutionController],
      providers: [
        GetInstitutionByInviteCodeUseCase,
        { provide: INSTITUTION_REPOSITORY, useValue: repository },
        { provide: SECTOR_REPOSITORY, useValue: sectorRepository },
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
});
