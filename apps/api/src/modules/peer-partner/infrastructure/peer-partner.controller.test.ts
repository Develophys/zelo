import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { PeerPartnerController } from "./peer-partner.controller.ts";
import { LoginPeerPartnerUseCase } from "../application/use-cases/login-peer-partner.use-case.ts";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";
import { PeerPartnerPasswordService } from "../application/services/peer-partner-password.service.ts";
import { PEER_PARTNER_REPOSITORY } from "../application/ports/peer-partner-repository.port.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByName(name: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
  async findById(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { PEER_PARTNER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("peer partner controller", () => {
  let app: INestApplication;
  let repository: FakePeerPartnerRepository;

  beforeAll(async () => {
    const passwordService = new PeerPartnerPasswordService();
    repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: await passwordService.hash("test-password"), institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    const moduleRef = await Test.createTestingModule({
      controllers: [PeerPartnerController],
      providers: [
        LoginPeerPartnerUseCase,
        PeerPartnerTokenService,
        PeerPartnerPasswordService,
        { provide: PEER_PARTNER_REPOSITORY, useValue: repository },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /peer-partner/login returns a token for the correct name and password", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ name: "Dra. Ana", password: "test-password" });
    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("POST /peer-partner/login rejects an unknown name with 401", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ name: "Unknown", password: "test-password" });
    expect(response.status).toBe(401);
  });

  it("POST /peer-partner/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({});
    expect(response.status).toBe(400);
  });
});
