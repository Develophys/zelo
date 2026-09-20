import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { PeerPartnerController } from "./peer-partner.controller.ts";
import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";
import { LoginPeerPartnerUseCase } from "../application/use-cases/login-peer-partner.use-case.ts";
import { FinishPeerPartnerSetupUseCase } from "../application/use-cases/finish-peer-partner-setup.use-case.ts";
import { RequestPeerPartnerPasswordResetUseCase } from "../application/use-cases/request-peer-partner-password-reset.use-case.ts";
import { EMAIL_PORT } from "@/shared/email/email.port.js";
import type { EmailPort, EmailTemplate, SendEmailParams } from "@/shared/email/email.port.js";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";
import { PeerPartnerPasswordService } from "../application/services/peer-partner-password.service.ts";
import { PEER_PARTNER_REPOSITORY } from "../application/ports/peer-partner-repository.port.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../application/ports/peer-partner-repository.port.ts";
import { NOTIFICATION_PUBLISHER } from "@/modules/notification/application/ports/notification.port.js";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";
import { INSTITUTION_REPOSITORY } from "@/modules/institution/application/ports/institution-repository.port.js";
import type { InstitutionRepository, InstitutionRow } from "@/modules/institution/application/ports/institution-repository.port.js";

class FakeInstitutionRepository implements InstitutionRepository {
  rows: InstitutionRow[] = [{ id: "institution-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026", isActive: true }];
  async findByInviteCode(): Promise<InstitutionRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<InstitutionRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
}

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
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
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
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

class FakeEmailPort implements EmailPort {
  lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { PEER_PARTNER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("peer partner controller", () => {
  let app: INestApplication;
  let repository: FakePeerPartnerRepository;
  let emailPort: FakeEmailPort;

  beforeAll(async () => {
    const passwordService = new PeerPartnerPasswordService();
    repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: await passwordService.hash("test-password"), setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    emailPort = new FakeEmailPort();

    const moduleRef = await Test.createTestingModule({
      controllers: [PeerPartnerController],
      providers: [
        LoginPeerPartnerUseCase,
        FinishPeerPartnerSetupUseCase,
        RequestPeerPartnerPasswordResetUseCase,
        PeerPartnerTokenService,
        PeerPartnerPasswordService,
        PeerPartnerAuthGuard,
        { provide: PEER_PARTNER_REPOSITORY, useValue: repository },
        { provide: INSTITUTION_REPOSITORY, useValue: new FakeInstitutionRepository() },
        { provide: NOTIFICATION_PUBLISHER, useValue: new FakeNotificationPublisher() },
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

  it("POST /peer-partner/login returns a token for the correct email and password", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });
    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("POST /peer-partner/login also returns the peer partner's name, for the inbox to greet them by", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });
    expect(response.body.peerPartnerName).toBe("Dra. Ana");
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
    (repository.rows[repository.rows.length - 1] as unknown as { setPasswordToken: string }).setPasswordToken =
      hashSetPasswordToken("valid-token");

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

  it("POST /peer-partner/finish-setup rejects a password under the minimum with 400 and leaves the account unset", async () => {
    repository.rows.push({
      id: "peer-short",
      name: "Dr. Senha Curta",
      email: "curta@zelo-demo.local",
      passwordHash: null,
      setPasswordTokenExpiresAt: new Date(Date.now() + 60_000),
      institutionId: "institution-1",
      specialty: "Psiquiatria",
      isActive: true,
    });
    (repository.rows[repository.rows.length - 1] as unknown as { setPasswordToken: string }).setPasswordToken =
      hashSetPasswordToken("short-password-token");

    const response = await request(app.getHttpServer()).post("/peer-partner/finish-setup").send({ token: "short-password-token", password: "nine-char" });

    expect(response.status).toBe(400);
    expect(repository.rows.find((row) => row.id === "peer-short")!.passwordHash).toBeNull();
  });

  it("POST /peer-partner/finish-setup accepts a password of exactly the minimum length", async () => {
    repository.rows.push({
      id: "peer-exact",
      name: "Dr. Senha Exata",
      email: "exata@zelo-demo.local",
      passwordHash: null,
      setPasswordTokenExpiresAt: new Date(Date.now() + 60_000),
      institutionId: "institution-1",
      specialty: "Psiquiatria",
      isActive: true,
    });
    (repository.rows[repository.rows.length - 1] as unknown as { setPasswordToken: string }).setPasswordToken =
      hashSetPasswordToken("exact-password-token");

    const response = await request(app.getHttpServer()).post("/peer-partner/finish-setup").send({ token: "exact-password-token", password: "ten-chars!" });

    expect(response.status).toBe(200);
  });

  it("POST /peer-partner/forgot-password sends the set-password email for a known, active peer partner", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/forgot-password").send({ email: "ana@zelo-demo.local" });

    expect(response.status).toBe(200);
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
  });

  it("POST /peer-partner/forgot-password returns 200 for an unknown email too, without sending anything", async () => {
    emailPort.lastSend = null;
    const response = await request(app.getHttpServer()).post("/peer-partner/forgot-password").send({ email: "unknown@zelo-demo.local" });

    expect(response.status).toBe(200);
    expect(emailPort.lastSend).toBeNull();
  });

  it("POST /peer-partner/forgot-password rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/forgot-password").send({ email: "not-an-email" });
    expect(response.status).toBe(400);
  });

  function peerCookieOf(response: request.Response): string {
    const header = response.headers["set-cookie"] as unknown as string[] | undefined;
    return header?.find((cookie) => cookie.startsWith("peer_partner_session=")) ?? "";
  }

  it("POST /peer-partner/login also sets the session as an HttpOnly, SameSite=Strict cookie that lasts eight hours", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });

    const cookie = peerCookieOf(response);
    expect(cookie).toContain(`peer_partner_session=${response.body.token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Domain=");
  });

  it("GET /peer-partner/me returns the name and specialty for a valid session cookie", async () => {
    const login = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });

    const response = await request(app.getHttpServer()).get("/peer-partner/me").set("Cookie", `peer_partner_session=${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: "Dra. Ana", specialty: expect.any(String) });
  });

  it("GET /peer-partner/me rejects a request with no session with 401", async () => {
    const response = await request(app.getHttpServer()).get("/peer-partner/me");

    expect(response.status).toBe(401);
  });

  it("GET /peer-partner/me rejects the cookie of a peer partner who has been deactivated with 401", async () => {
    const login = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });
    const row = repository.rows.find((candidate) => candidate.id === "peer-1")!;
    row.isActive = false;

    try {
      const response = await request(app.getHttpServer()).get("/peer-partner/me").set("Cookie", `peer_partner_session=${login.body.token}`);
      expect(response.status).toBe(401);
    } finally {
      row.isActive = true;
    }
  });

  it("POST /peer-partner/logout clears the session cookie and answers 204", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/logout");

    expect(response.status).toBe(204);
    const cookie = peerCookieOf(response);
    expect(cookie).toContain("peer_partner_session=;");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
  });
});
