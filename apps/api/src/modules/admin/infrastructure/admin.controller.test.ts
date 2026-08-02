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
