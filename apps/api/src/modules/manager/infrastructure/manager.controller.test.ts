import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { ManagerController } from "./manager.controller.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { LoginManagerUseCase } from "../application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase } from "../application/use-cases/get-manager-signals.use-case.ts";
import { GenerateManagerInsightUseCase } from "../application/use-cases/generate-manager-insight.use-case.ts";
import { GetManagerInsightHistoryUseCase } from "../application/use-cases/get-manager-insight-history.use-case.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { ManagerPasswordService } from "../application/services/manager-password.service.ts";
import { MANAGER_REPOSITORY } from "../application/ports/manager-repository.port.ts";
import type { ManagerRepository, ManagerRow } from "../application/ports/manager-repository.port.ts";
import { SIMULATED_SIGNAL_REPOSITORY } from "../application/ports/simulated-signal-repository.port.ts";
import type { SimulatedSignalRepository, SimulatedSignalRow } from "../application/ports/simulated-signal-repository.port.ts";
import { SIMULATED_FOLLOW_UP_REPOSITORY } from "../application/ports/simulated-follow-up-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../application/ports/simulated-follow-up-repository.port.ts";
import { AI_INSIGHT_PORT, InsightGenerationFailedError } from "../application/ports/ai-insight.port.ts";
import type { AiInsightPort, ManagerInsightResponse } from "../application/ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_REPOSITORY } from "../application/ports/manager-insight-repository.port.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../application/ports/manager-insight-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  async findByName(name: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
}

class FakeSimulatedSignalRepository implements SimulatedSignalRepository {
  public rows: SimulatedSignalRow[] = [];
  async findAll(): Promise<SimulatedSignalRow[]> {
    return this.rows;
  }
}

class FakeSimulatedFollowUpRepository implements SimulatedFollowUpRepository {
  public rows: SimulatedFollowUpRow[] = [];
  async findAll(): Promise<SimulatedFollowUpRow[]> {
    return this.rows;
  }
}

class FakeAiInsightPort implements AiInsightPort {
  public shouldFail = false;
  async generateInsight(): Promise<ManagerInsightResponse> {
    if (this.shouldFail) {
      throw new InsightGenerationFailedError("simulated failure");
    }
    return { interpretation: "análise de teste", suggestedActions: ["ação de teste"] };
  }
}

class FakeManagerInsightRepository implements ManagerInsightRepository {
  public rows: StoredManagerInsight[] = [];
  async save(entry: { interpretation: string; suggestedActions: string[]; summary: string; createdByManagerName: string | null }): Promise<void> {
    this.rows.unshift({ id: `id-${this.rows.length + 1}`, generatedAt: new Date(), ...entry });
  }
  async findAll(): Promise<StoredManagerInsight[]> {
    return this.rows;
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { MANAGER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("manager controller", () => {
  let app: INestApplication;
  let managerRepository: FakeManagerRepository;
  let repository: FakeSimulatedSignalRepository;
  let followUpRepository: FakeSimulatedFollowUpRepository;
  let aiInsightPort: FakeAiInsightPort;
  let insightRepository: FakeManagerInsightRepository;

  beforeAll(async () => {
    const passwordService = new ManagerPasswordService();
    managerRepository = new FakeManagerRepository();
    managerRepository.rows = [
      { id: "manager-1", name: "Ana Konder", passwordHash: await passwordService.hash("test-password") },
    ];
    repository = new FakeSimulatedSignalRepository();
    followUpRepository = new FakeSimulatedFollowUpRepository();
    aiInsightPort = new FakeAiInsightPort();
    insightRepository = new FakeManagerInsightRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [ManagerController],
      providers: [
        LoginManagerUseCase,
        GetManagerSignalsUseCase,
        GenerateManagerInsightUseCase,
        GetManagerInsightHistoryUseCase,
        ManagerTokenService,
        ManagerPasswordService,
        ManagerAuthGuard,
        { provide: MANAGER_REPOSITORY, useValue: managerRepository },
        { provide: SIMULATED_SIGNAL_REPOSITORY, useValue: repository },
        { provide: SIMULATED_FOLLOW_UP_REPOSITORY, useValue: followUpRepository },
        { provide: AI_INSIGHT_PORT, useValue: aiInsightPort },
        { provide: MANAGER_INSIGHT_REPOSITORY, useValue: insightRepository },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function getToken(): Promise<string> {
    const login = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ name: "Ana Konder", password: "test-password" });
    return login.body.token;
  }

  it("POST /manager/login returns a token for the correct name and password", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ name: "Ana Konder", password: "test-password" });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.expiresAt).toEqual(expect.any(String));
  });

  it("POST /manager/login rejects an unknown name with 401", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ name: "Unknown Person", password: "test-password" });

    expect(response.status).toBe(401);
  });

  it("POST /manager/login rejects the wrong password with 401", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ name: "Ana Konder", password: "wrong-password" });

    expect(response.status).toBe(401);
  });

  it("POST /manager/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/manager/login").send({});

    expect(response.status).toBe(400);
  });

  it("GET /manager/signals rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).get("/manager/signals");

    expect(response.status).toBe(401);
  });

  it("GET /manager/signals returns aggregated data for a valid token, suppressing n<5 departments", async () => {
    repository.rows = [
      { department: "A", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 10, concerning: 6 },
      { department: "Tiny", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 3, concerning: 1 },
    ];
    const token = await getToken();

    const response = await request(app.getHttpServer()).get("/manager/signals").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.segments).toEqual([{ label: "A", value: 60, n: 10 }]);
  });

  it("POST /manager/insights rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).post("/manager/insights");

    expect(response.status).toBe(401);
  });

  it("POST /manager/insights returns the structured insight for a valid token", async () => {
    aiInsightPort.shouldFail = false;
    const token = await getToken();

    const response = await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ interpretation: "análise de teste", suggestedActions: ["ação de teste"] });
  });

  it("POST /manager/insights returns 502 when insight generation fails", async () => {
    aiInsightPort.shouldFail = true;
    const token = await getToken();

    const response = await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(502);
    aiInsightPort.shouldFail = false;
  });

  it("GET /manager/insights/history rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).get("/manager/insights/history");

    expect(response.status).toBe(401);
  });

  it("POST /manager/insights auto-saves to history with the authenticated manager's name, visible via GET /manager/insights/history", async () => {
    insightRepository.rows = [];
    aiInsightPort.shouldFail = false;
    const token = await getToken();

    await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${token}`);
    const response = await request(app.getHttpServer())
      .get("/manager/insights/history")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        interpretation: "análise de teste",
        suggestedActions: ["ação de teste"],
        createdByManagerName: "Ana Konder",
      }),
    ]);
  });
});
