import { describe, expect, it } from "vitest";
import { MANAGER_METRICS, sectorCoverageReading } from "@zelo/domain";
import { GenerateManagerInsightUseCase } from "./generate-manager-insight.use-case.ts";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SignalRepository, SignalRow, WeeklySignalRow } from "../ports/signal-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../ports/simulated-follow-up-repository.port.ts";
import type { AiInsightPort, ManagerInsightResponse } from "../ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_SYSTEM_PROMPT } from "../prompts/manager-insight-system-prompt.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../ports/manager-insight-repository.port.ts";

class FakeSignalRepository implements SignalRepository {
  public lastSectorIds: string[] | null = null;
  constructor(private readonly rows: SignalRow[]) {}
  async findAll(_institutionId: string, sectorIds: string[]): Promise<SignalRow[]> {
    this.lastSectorIds = sectorIds;
    return this.rows;
  }
  async findAllForWeek(): Promise<WeeklySignalRow[]> {
    throw new Error("not used in this test");
  }
  async countBySector(): Promise<never> {
    throw new Error("not used in this test");
  }
}

// Institution-wide by design: insight generation always resolves every
// active sector in the institution, regardless of the requesting manager's
// role or assignment (unlike the sector-scoped dashboard signals endpoint).
class FakeSectorRepository {
  constructor(private readonly active: { id: string; name: string }[]) {}
  async findActiveByInstitution() {
    return this.active;
  }
}

class FakeSimulatedFollowUpRepository implements SimulatedFollowUpRepository {
  constructor(private readonly rows: SimulatedFollowUpRow[] = []) {}
  async findAll(): Promise<SimulatedFollowUpRow[]> {
    return this.rows;
  }
}

class FakeAiInsightPort implements AiInsightPort {
  public lastParams: { summary: string; systemPrompt: string } | null = null;
  constructor(private readonly result: ManagerInsightResponse) {}
  async generateInsight(params: { summary: string; systemPrompt: string }): Promise<ManagerInsightResponse> {
    this.lastParams = params;
    return this.result;
  }
}

class FakeManagerInsightRepository implements ManagerInsightRepository {
  public savedEntries: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }[] = [];
  public shouldFailSave = false;
  async save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error("save failed");
    }
    this.savedEntries.push(entry);
  }
  async findPage(): Promise<{ items: StoredManagerInsight[]; nextCursor: string | null; total: number | null }> {
    return { items: [], nextCursor: null, total: 0 };
  }
}

const WEEK_1 = new Date("2026-06-15T00:00:00.000Z");
const WEEK_2 = new Date("2026-06-22T00:00:00.000Z");

describe("GenerateManagerInsightUseCase", () => {
  it("formats the current ManagerSignalsResponse into a PT-BR summary and forwards it with the system prompt", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_1, checkIns: 10, concerning: 3, abandoned: 0, unsentChatDrafts: 0 },
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6, abandoned: 0, unsentChatDrafts: 0 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    const sectorRepository = new FakeSectorRepository([{ id: "sector-uti", name: "UTI" }, { id: "sector-er", name: "Pronto-Socorro" }]);
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository, sectorRepository as never);

    const result = await useCase.execute("Ana Konder", "institution-1");

    expect(result).toEqual({ interpretation: "texto", suggestedActions: ["ação 1"] });
    expect(aiInsight.lastParams?.systemPrompt).toBe(MANAGER_INSIGHT_SYSTEM_PROMPT);
    expect(aiInsight.lastParams?.summary).toContain("Respostas com sinal de sofrimento relevante: 60%");
    expect(aiInsight.lastParams?.summary).toContain("UTI: 60% (n=10)");
    expect(aiInsight.lastParams?.summary).toContain(
      "Tendência semanal (taxa e base por semana, 2 semanas): 30% (n=10), 60% (n=10)",
    );
    // A mesma frase que o card de cobertura, o CSV e o PDF imprimem — o prompt
    // não pode descrever a cobertura com palavras próprias.
    expect(aiInsight.lastParams?.summary).toContain(
      `${MANAGER_METRICS.sectorCoverage.label}: ${sectorCoverageReading({ visible: 1, total: 2 })}`,
    );
    expect(aiInsight.lastParams?.summary).toContain(
      "1 de 2 setores · 1 oculto por ter menos de 5 respostas",
    );
    expect(aiInsight.lastParams?.summary).toContain(
      "Taxa de resposta do follow-up: 0% — dado de demonstração, não reflete esta instituição",
    );
    // Institution-wide, not scoped to any one manager's accessible sectors:
    // every active sector id gets resolved and forwarded unconditionally.
    expect(signalsRepository.lastSectorIds).toEqual(["sector-uti", "sector-er"]);
  });

  it("keeps a sub-threshold sector out of every number in the summary, but still reports it was suppressed", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 4, abandoned: 0, unsentChatDrafts: 0 },
      { sectorId: "sector-peq", sectorName: "Pediatria", weekStart: WEEK_2, checkIns: 3, concerning: 1, abandoned: 0, unsentChatDrafts: 0 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: [] });
    const insightRepository = new FakeManagerInsightRepository();
    const sectorRepository = new FakeSectorRepository([
      { id: "sector-uti", name: "UTI" },
      { id: "sector-peq", name: "Pediatria" },
    ]);
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository, sectorRepository as never);

    await useCase.execute("Ana Konder", "institution-1");

    const summary = aiInsight.lastParams?.summary ?? "";
    // 3 check-ins fica abaixo do limiar de 5: o setor nunca deveria contribuir
    // para nenhum agregado, nem sequer para o denominador da tendência.
    expect(summary).toContain(
      `${MANAGER_METRICS.sectorCoverage.label}: ${sectorCoverageReading({ visible: 1, total: 2 })}`,
    );
    expect(summary).toContain("Respostas com sinal de sofrimento relevante: 40%");
    expect(summary).toContain("Tendência semanal (taxa e base por semana, 1 semanas): 40% (n=10)");
    expect(summary).not.toContain("Pediatria");
  });

  it("propagates whatever the AiInsightPort throws (e.g. InsightGenerationFailedError from the adapter)", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6, abandoned: 0, unsentChatDrafts: 0 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    class ThrowingAiInsightPort implements AiInsightPort {
      async generateInsight(): Promise<ManagerInsightResponse> {
        throw new Error("boom");
      }
    }
    const insightRepository = new FakeManagerInsightRepository();
    const sectorRepository = new FakeSectorRepository([{ id: "sector-uti", name: "UTI" }]);
    const useCase = new GenerateManagerInsightUseCase(
      getManagerSignals,
      new ThrowingAiInsightPort(),
      insightRepository,
      sectorRepository as never,
    );

    await expect(useCase.execute("Ana Konder", "institution-1")).rejects.toThrow("boom");
    expect(insightRepository.savedEntries).toEqual([]);
  });

  it("saves the generated insight to the repository, attributed to the manager and institution", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6, abandoned: 0, unsentChatDrafts: 0 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    const sectorRepository = new FakeSectorRepository([{ id: "sector-uti", name: "UTI" }]);
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository, sectorRepository as never);

    await useCase.execute("Ana Konder", "institution-1");

    expect(insightRepository.savedEntries).toEqual([
      {
        interpretation: "texto",
        suggestedActions: ["ação 1"],
        summary: aiInsight.lastParams?.summary,
        createdByManagerName: "Ana Konder",
        institutionId: "institution-1",
      },
    ]);
  });

  it("still returns the generated insight even if saving to the repository fails", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6, abandoned: 0, unsentChatDrafts: 0 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    insightRepository.shouldFailSave = true;
    const sectorRepository = new FakeSectorRepository([{ id: "sector-uti", name: "UTI" }]);
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository, sectorRepository as never);

    const result = await useCase.execute("Ana Konder", "institution-1");

    expect(result).toEqual({ interpretation: "texto", suggestedActions: ["ação 1"] });
  });
});
