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
import { ResolveAccessibleSectorIdsUseCase } from "../application/use-cases/resolve-accessible-sector-ids.use-case.ts";
import { GetAccessibleSectorsUseCase } from "../application/use-cases/get-accessible-sectors.use-case.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { ManagerPasswordService } from "../application/services/manager-password.service.ts";
import { MANAGER_REPOSITORY } from "../application/ports/manager-repository.port.ts";
import type { ManagerRepository, ManagerRow } from "../application/ports/manager-repository.port.ts";
import { SIGNAL_REPOSITORY } from "../application/ports/signal-repository.port.ts";
import type { SignalRepository, SignalRow } from "../application/ports/signal-repository.port.ts";
import { SIMULATED_FOLLOW_UP_REPOSITORY } from "../application/ports/simulated-follow-up-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../application/ports/simulated-follow-up-repository.port.ts";
import { AI_INSIGHT_PORT, InsightGenerationFailedError } from "../application/ports/ai-insight.port.ts";
import type { AiInsightPort, ManagerInsightResponse } from "../application/ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_REPOSITORY } from "../application/ports/manager-insight-repository.port.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../application/ports/manager-insight-repository.port.ts";
import { SECTOR_REPOSITORY } from "../../sector/application/ports/sector-repository.port.ts";
import type { SectorRepository, AdminSectorRow, UpdateSectorParams } from "../../sector/application/ports/sector-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  async findByName(name: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
  async findById(): Promise<ManagerRow | null> {
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
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

class FakeSignalRepository implements SignalRepository {
  private byInstitution: Record<string, SignalRow[]> = {};
  setRowsForInstitution(institutionId: string, rows: SignalRow[]): void {
    this.byInstitution[institutionId] = rows;
  }
  async findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]> {
    return (this.byInstitution[institutionId] ?? []).filter((row) => sectorIds.includes(row.sectorId));
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
  async findActiveByIds(institutionId: string, sectorIds: string[]): Promise<{ id: string; name: string }[]> {
    return (this.activeByInstitution[institutionId] ?? []).filter((sector) => sectorIds.includes(sector.id));
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
  async save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void> {
    this.rows.unshift({ id: `id-${this.rows.length + 1}`, generatedAt: new Date(), ...entry });
  }
  async findAll(institutionId: string): Promise<StoredManagerInsight[]> {
    return this.rows.filter((row) => row.institutionId === institutionId);
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { MANAGER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("manager controller", () => {
  let app: INestApplication;
  let managerRepository: FakeManagerRepository;
  let signalRepository: FakeSignalRepository;
  let sectorRepository: FakeSectorRepository;
  let followUpRepository: FakeSimulatedFollowUpRepository;
  let aiInsightPort: FakeAiInsightPort;
  let insightRepository: FakeManagerInsightRepository;

  beforeAll(async () => {
    const passwordService = new ManagerPasswordService();
    managerRepository = new FakeManagerRepository();
    managerRepository.rows = [
      {
        id: "manager-1",
        name: "Ana Konder",
        passwordHash: await passwordService.hash("test-password"),
        institutionId: "institution-a",
        role: "HOSPITAL_ADMIN",
        isActive: true,
      },
      {
        id: "manager-2",
        name: "Beatriz Lima",
        passwordHash: await passwordService.hash("test-password-2"),
        institutionId: "institution-b",
        role: "HOSPITAL_ADMIN",
        isActive: true,
      },
    ];
    signalRepository = new FakeSignalRepository();
    sectorRepository = new FakeSectorRepository();
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
        ResolveAccessibleSectorIdsUseCase,
        GetAccessibleSectorsUseCase,
        ManagerTokenService,
        ManagerPasswordService,
        ManagerAuthGuard,
        { provide: MANAGER_REPOSITORY, useValue: managerRepository },
        { provide: SIGNAL_REPOSITORY, useValue: signalRepository },
        { provide: SECTOR_REPOSITORY, useValue: sectorRepository },
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

  async function getToken(name: string, password: string): Promise<string> {
    const login = await request(app.getHttpServer()).post("/manager/login").send({ name, password });
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

  it("GET /manager/signals returns only the authenticated manager's own institution's data, suppressing n<5 departments", async () => {
    signalRepository.setRowsForInstitution("institution-a", [
      { sectorId: "sector-a", sectorName: "A", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 10, concerning: 6 },
      { sectorId: "sector-tiny", sectorName: "Tiny", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 3, concerning: 1 },
    ]);
    signalRepository.setRowsForInstitution("institution-b", [
      { sectorId: "sector-a", sectorName: "A", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 20, concerning: 2 },
    ]);
    sectorRepository.activeByInstitution = {
      "institution-a": [{ id: "sector-a", name: "A" }, { id: "sector-tiny", name: "Tiny" }],
      "institution-b": [{ id: "sector-a", name: "A" }],
    };

    const tokenA = await getToken("Ana Konder", "test-password");
    const responseA = await request(app.getHttpServer()).get("/manager/signals").set("Authorization", `Bearer ${tokenA}`);
    expect(responseA.status).toBe(200);
    expect(responseA.body.segments).toEqual([{ label: "A", value: 60, n: 10 }]);

    const tokenB = await getToken("Beatriz Lima", "test-password-2");
    const responseB = await request(app.getHttpServer()).get("/manager/signals").set("Authorization", `Bearer ${tokenB}`);
    expect(responseB.status).toBe(200);
    expect(responseB.body.segments).toEqual([{ label: "A", value: 10, n: 20 }]);
  });

  it("GET /manager/sectors returns every active sector for a HOSPITAL_ADMIN", async () => {
    sectorRepository.activeByInstitution = { "institution-a": [{ id: "sector-1", name: "UTI" }] };
    const token = await getToken("Ana Konder", "test-password");

    const response = await request(app.getHttpServer()).get("/manager/sectors").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: "sector-1", name: "UTI" }]);
  });

  it("GET /manager/signals?sectorIds=... narrows the result to the requested, permitted sectors", async () => {
    signalRepository.setRowsForInstitution("institution-a", [
      { sectorId: "sector-1", sectorName: "UTI", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 10, concerning: 6 },
      { sectorId: "sector-2", sectorName: "Pronto-Socorro", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 20, concerning: 2 },
    ]);
    sectorRepository.activeByInstitution = { "institution-a": [{ id: "sector-1", name: "UTI" }, { id: "sector-2", name: "Pronto-Socorro" }] };
    const token = await getToken("Ana Konder", "test-password");

    const response = await request(app.getHttpServer())
      .get("/manager/signals?sectorIds=sector-1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.segments).toEqual([{ label: "UTI", value: 60, n: 10 }]);
  });

  it("POST /manager/insights rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).post("/manager/insights");

    expect(response.status).toBe(401);
  });

  it("POST /manager/insights returns the structured insight for a valid token", async () => {
    aiInsightPort.shouldFail = false;
    const token = await getToken("Ana Konder", "test-password");

    const response = await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ interpretation: "análise de teste", suggestedActions: ["ação de teste"] });
  });

  it("POST /manager/insights returns 502 when insight generation fails", async () => {
    aiInsightPort.shouldFail = true;
    const token = await getToken("Ana Konder", "test-password");

    const response = await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(502);
    aiInsightPort.shouldFail = false;
  });

  it("GET /manager/insights/history rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).get("/manager/insights/history");

    expect(response.status).toBe(401);
  });

  it("POST /manager/insights auto-saves to history with the authenticated manager's name and institution, visible only to managers at that same institution", async () => {
    insightRepository.rows = [];
    aiInsightPort.shouldFail = false;

    const tokenA = await getToken("Ana Konder", "test-password");
    await request(app.getHttpServer()).post("/manager/insights").set("Authorization", `Bearer ${tokenA}`);

    const historyForA = await request(app.getHttpServer())
      .get("/manager/insights/history")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(historyForA.status).toBe(200);
    expect(historyForA.body).toEqual([
      expect.objectContaining({
        interpretation: "análise de teste",
        suggestedActions: ["ação de teste"],
        createdByManagerName: "Ana Konder",
      }),
    ]);

    const tokenB = await getToken("Beatriz Lima", "test-password-2");
    const historyForB = await request(app.getHttpServer())
      .get("/manager/insights/history")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(historyForB.status).toBe(200);
    expect(historyForB.body).toEqual([]); // institution-a's insight never leaks to institution-b
  });
});
