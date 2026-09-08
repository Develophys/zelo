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
import { CreateInstitutionUseCase } from "../application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "../application/use-cases/list-institutions.use-case.ts";
import { AdminAuthGuard } from "./admin-auth.guard.ts";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  DuplicateInstitutionOrManagerError,
} from "../application/ports/admin-institution-repository.port.ts";
import type {
  AdminInstitutionPage,
  AdminInstitutionRepository,
  AdminInstitutionRow,
  UpdateInstitutionParams,
} from "../application/ports/admin-institution-repository.port.ts";
import { EMAIL_PORT } from "@/shared/email/email.port.js";
import type { EmailPort, EmailTemplate, SendEmailParams } from "@/shared/email/email.port.js";

class FakeAdminRepository implements AdminRepository {
  public rows: AdminRow[] = [];
  async findByEmail(email: string): Promise<AdminRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
}

class FakeAdminInstitutionRepository implements AdminInstitutionRepository {
  public rows: AdminInstitutionRow[] = [];
  public shouldThrowDuplicate = false;
  public shouldThrowDuplicateOnUpdate = false;
  public lastCreateParams: { hospitalAdminEmail: string; setPasswordToken: string } | null = null;
  public lastUpdate: { id: string; patch: UpdateInstitutionParams } | null = null;
  public lastQuery: { cursor: string | null; limit: number } | null = null;
  async createWithHospitalAdmin(params: {
    institutionName: string;
    inviteCode: string;
    hospitalAdminName: string;
    hospitalAdminEmail: string;
    setPasswordToken: string;
    setPasswordTokenExpiresAt: Date;
  }) {
    this.lastCreateParams = params;
    if (this.shouldThrowDuplicate) throw new DuplicateInstitutionOrManagerError();
    return {
      institution: { id: "institution-1", name: params.institutionName, inviteCode: params.inviteCode },
      hospitalAdmin: { id: "manager-1", name: params.hospitalAdminName, email: params.hospitalAdminEmail },
    };
  }
  async findPage(query: { cursor: string | null; limit: number }): Promise<AdminInstitutionPage> {
    this.lastQuery = query;
    return { items: this.rows, nextCursor: null, total: this.rows.length };
  }
  async findById(id: string): Promise<AdminInstitutionRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async update(id: string, patch: UpdateInstitutionParams): Promise<void> {
    this.lastUpdate = { id, patch };
    if (this.shouldThrowDuplicateOnUpdate) throw new DuplicateInstitutionOrManagerError();
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.isActive !== undefined) row.isActive = patch.isActive;
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
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
  let emailPort: FakeEmailPort;

  beforeAll(async () => {
    const passwordService = new AdminPasswordService();
    adminRepository = new FakeAdminRepository();
    adminRepository.rows = [{ id: "admin-1", name: "Zelo Ops", email: "ops@zelo-demo.local", passwordHash: await passwordService.hash("test-password") }];
    institutionRepository = new FakeAdminInstitutionRepository();
    emailPort = new FakeEmailPort();

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        LoginAdminUseCase,
        CreateInstitutionUseCase,
        ListInstitutionsUseCase,
        AdminTokenService,
        AdminPasswordService,
        AdminAuthGuard,
        { provide: ADMIN_REPOSITORY, useValue: adminRepository },
        { provide: ADMIN_INSTITUTION_REPOSITORY, useValue: institutionRepository },
        { provide: EMAIL_PORT, useValue: emailPort },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /admin/login returns a token for the correct email and password", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("POST /admin/login rejects an unknown email with 401", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({ email: "unknown@zelo-demo.local", password: "test-password" });
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

  it("POST /admin/institutions creates the institution and its first hospital admin, sending an invite email", async () => {
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });
    const token = login.body.token;

    const response = await request(app.getHttpServer())
      .post("/admin/institutions")
      .set("Authorization", `Bearer ${token}`)
      .send({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio", hospitalAdminEmail: "mauricio@zelo-demo.local" });

    expect(response.status).toBe(201);
    expect(response.body.institution).toEqual({ id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026" });
    expect(response.body.hospitalAdmin).toEqual({ id: "manager-1", name: "Mauricio", email: "mauricio@zelo-demo.local" });
    expect(emailPort.lastSend?.to).toBe("mauricio@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });

  it("POST /admin/institutions returns 409 on a duplicate institution or manager email", async () => {
    institutionRepository.shouldThrowDuplicate = true;
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });
    const token = login.body.token;

    const response = await request(app.getHttpServer())
      .post("/admin/institutions")
      .set("Authorization", `Bearer ${token}`)
      .send({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio", hospitalAdminEmail: "mauricio@zelo-demo.local" });

    expect(response.status).toBe(409);
    institutionRepository.shouldThrowDuplicate = false;
  });

  it("GET /admin/institutions rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).get("/admin/institutions");
    expect(response.status).toBe(401);
  });

  it("GET /admin/institutions returns a page shaped like every other list in the panel", async () => {
    institutionRepository.rows = [
      { id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: new Date("2026-08-01T00:00:00.000Z"), hospitalAdminNames: ["Mauricio"] },
    ];
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });
    const token = login.body.token;

    const response = await request(app.getHttpServer()).get("/admin/institutions").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({ id: "institution-1", name: "Hospital Teste", hospitalAdminNames: ["Mauricio"] }),
    ]);
    expect(response.body.total).toBe(1);
  });

  it("GET /admin/institutions scopes cursor and limit through to the repository, clamping an absurd limit", async () => {
    institutionRepository.rows = [];
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });
    const token = login.body.token;

    await request(app.getHttpServer())
      .get("/admin/institutions?cursor=institution-9&limit=5000")
      .set("Authorization", `Bearer ${token}`);

    expect(institutionRepository.lastQuery).toEqual({ cursor: "institution-9", limit: 50 });
  });

  describe("PATCH /admin/institutions/:id", () => {
    async function loginToken(): Promise<string> {
      const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });
      return login.body.token;
    }

    beforeAll(() => {
      institutionRepository.rows = [
        { id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: new Date("2026-08-01T00:00:00.000Z"), hospitalAdminNames: ["Mauricio"] },
      ];
    });

    it("rejects a request with no token", async () => {
      const response = await request(app.getHttpServer()).patch("/admin/institutions/institution-1").send({ name: "Novo Nome" });
      expect(response.status).toBe(401);
    });

    it("renames the institution", async () => {
      const token = await loginToken();
      const response = await request(app.getHttpServer())
        .patch("/admin/institutions/institution-1")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Novo Nome" });

      expect(response.status).toBe(204);
      expect(institutionRepository.lastUpdate).toEqual({ id: "institution-1", patch: { name: "Novo Nome" } });
    });

    it("deactivates and reactivates the institution", async () => {
      const token = await loginToken();

      const deactivate = await request(app.getHttpServer())
        .patch("/admin/institutions/institution-1")
        .set("Authorization", `Bearer ${token}`)
        .send({ isActive: false });
      expect(deactivate.status).toBe(204);
      expect(institutionRepository.rows[0]!.isActive).toBe(false);

      const reactivate = await request(app.getHttpServer())
        .patch("/admin/institutions/institution-1")
        .set("Authorization", `Bearer ${token}`)
        .send({ isActive: true });
      expect(reactivate.status).toBe(204);
      expect(institutionRepository.rows[0]!.isActive).toBe(true);
    });

    it("never accepts an inviteCode change — the field does not exist on the schema", async () => {
      const token = await loginToken();
      const response = await request(app.getHttpServer())
        .patch("/admin/institutions/institution-1")
        .set("Authorization", `Bearer ${token}`)
        .send({ inviteCode: "novo-codigo" });

      // Zod strips unknown keys by default, so this succeeds — but the
      // repository never receives inviteCode, which is the actual guarantee.
      expect(response.status).toBe(204);
      expect(institutionRepository.lastUpdate?.patch).not.toHaveProperty("inviteCode");
    });

    it("returns 404 for an institution that does not exist", async () => {
      const token = await loginToken();
      const response = await request(app.getHttpServer())
        .patch("/admin/institutions/unknown-id")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Novo Nome" });

      expect(response.status).toBe(404);
    });

    it("returns 409 when the new name collides with another institution", async () => {
      institutionRepository.shouldThrowDuplicateOnUpdate = true;
      const token = await loginToken();

      const response = await request(app.getHttpServer())
        .patch("/admin/institutions/institution-1")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Nome Já Usado" });

      expect(response.status).toBe(409);
      institutionRepository.shouldThrowDuplicateOnUpdate = false;
    });

    it("rejects a malformed body with 400", async () => {
      const token = await loginToken();
      const response = await request(app.getHttpServer())
        .patch("/admin/institutions/institution-1")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "" });

      expect(response.status).toBe(400);
    });
  });
});
