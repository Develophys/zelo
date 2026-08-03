import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { AdminController } from "./admin.controller.ts";
import { LoginAdminUseCase } from "../application/use-cases/login-admin.use-case.ts";
import { AdminTokenService } from "../application/services/admin-token.service.ts";
import { AdminPasswordService } from "../application/services/admin-password.service.ts";
import { ManagerPasswordService } from "../../manager/application/services/manager-password.service.ts";
import { ADMIN_REPOSITORY } from "../application/ports/admin-repository.port.ts";
import type { AdminRepository, AdminRow } from "../application/ports/admin-repository.port.ts";
import { CreateInstitutionUseCase } from "../application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "../application/use-cases/list-institutions.use-case.ts";
import { AdminAuthGuard } from "./admin-auth.guard.ts";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  DuplicateInstitutionOrManagerError,
} from "../application/ports/admin-institution-repository.port.ts";
import type { AdminInstitutionRepository, AdminInstitutionRow } from "../application/ports/admin-institution-repository.port.ts";

class FakeAdminRepository implements AdminRepository {
  public rows: AdminRow[] = [];
  async findByName(name: string): Promise<AdminRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
}

class FakeAdminInstitutionRepository implements AdminInstitutionRepository {
  public rows: AdminInstitutionRow[] = [];
  public shouldThrowDuplicate = false;
  public lastCreateParams: { hospitalAdminPasswordHash: string } | null = null;
  async createWithHospitalAdmin(params: {
    institutionName: string;
    inviteCode: string;
    hospitalAdminName: string;
    hospitalAdminPasswordHash: string;
  }) {
    this.lastCreateParams = params;
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

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { ADMIN_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("admin controller", () => {
  let app: INestApplication;
  let adminRepository: FakeAdminRepository;
  let institutionRepository: FakeAdminInstitutionRepository;

  beforeAll(async () => {
    const passwordService = new AdminPasswordService();
    adminRepository = new FakeAdminRepository();
    adminRepository.rows = [{ id: "admin-1", name: "Zelo Ops", passwordHash: await passwordService.hash("test-password") }];
    institutionRepository = new FakeAdminInstitutionRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        LoginAdminUseCase,
        CreateInstitutionUseCase,
        ListInstitutionsUseCase,
        AdminTokenService,
        AdminPasswordService,
        ManagerPasswordService,
        AdminAuthGuard,
        { provide: ADMIN_REPOSITORY, useValue: adminRepository },
        { provide: ADMIN_INSTITUTION_REPOSITORY, useValue: institutionRepository },
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

    // The stored hash must be verifiable by the service the manager login path
    // actually uses, otherwise every newly onboarded admin is locked out.
    const storedHash = institutionRepository.lastCreateParams!.hospitalAdminPasswordHash;
    expect(await new ManagerPasswordService().verify(response.body.temporaryPassword, storedHash)).toBe(true);
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
});
