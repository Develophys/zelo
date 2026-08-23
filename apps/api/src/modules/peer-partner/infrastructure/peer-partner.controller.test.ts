import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { PeerPartnerController } from "./peer-partner.controller.ts";
import { LoginPeerPartnerUseCase } from "../application/use-cases/login-peer-partner.use-case.ts";
import { FinishPeerPartnerSetupUseCase } from "../application/use-cases/finish-peer-partner-setup.use-case.ts";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";
import { PeerPartnerPasswordService } from "../application/services/peer-partner-password.service.ts";
import { PEER_PARTNER_REPOSITORY } from "../application/ports/peer-partner-repository.port.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../application/ports/peer-partner-repository.port.ts";
import { NOTIFICATION_PUBLISHER } from "../../notification/application/ports/notification.port.ts";
import type { NotificationEvent, NotificationPublisher } from "../../notification/application/ports/notification.port.ts";

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByEmail(email: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
  async findBySetPasswordToken(token: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => (row as unknown as { setPasswordToken?: string }).setPasswordToken === token) ?? null;
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
  async update(id: string, patch: Partial<PeerPartnerRow> & { setPasswordToken?: string | null }): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) Object.assign(row, { [key]: value });
    }
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
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: await passwordService.hash("test-password"), setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    const moduleRef = await Test.createTestingModule({
      controllers: [PeerPartnerController],
      providers: [
        LoginPeerPartnerUseCase,
        FinishPeerPartnerSetupUseCase,
        PeerPartnerTokenService,
        PeerPartnerPasswordService,
        { provide: PEER_PARTNER_REPOSITORY, useValue: repository },
        { provide: NOTIFICATION_PUBLISHER, useValue: new FakeNotificationPublisher() },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /peer-partner/login returns a token for the correct email and password", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });
    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("POST /peer-partner/login rejects an unknown email with 401", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "unknown@zelo-demo.local", password: "test-password" });
    expect(response.status).toBe(401);
  });

  it("POST /peer-partner/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({});
    expect(response.status).toBe(400);
  });

  it("POST /peer-partner/finish-setup sets the password for a valid, unexpired token", async () => {
    const passwordService = new PeerPartnerPasswordService();
    repository.rows.push({
      id: "peer-pending",
      name: "Dr. Novo",
      email: "novo@zelo-demo.local",
      passwordHash: null,
      setPasswordTokenExpiresAt: new Date(Date.now() + 60_000),
      institutionId: "institution-1",
      specialty: "Psiquiatria",
      isActive: true,
    });
    (repository.rows[repository.rows.length - 1] as unknown as { setPasswordToken: string }).setPasswordToken = "valid-token";

    const response = await request(app.getHttpServer()).post("/peer-partner/finish-setup").send({ token: "valid-token", password: "new-password-123" });

    expect(response.status).toBe(200);
    const updated = repository.rows.find((row) => row.id === "peer-pending")!;
    expect(await passwordService.verify("new-password-123", updated.passwordHash!)).toBe(true);
  });

  it("POST /peer-partner/finish-setup rejects an unknown token with 401", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/finish-setup").send({ token: "unknown-token", password: "new-password-123" });
    expect(response.status).toBe(401);
  });

  it("POST /peer-partner/finish-setup rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/finish-setup").send({ token: "x" });
    expect(response.status).toBe(400);
  });
});
