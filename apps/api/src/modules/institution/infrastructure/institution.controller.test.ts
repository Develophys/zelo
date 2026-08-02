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
