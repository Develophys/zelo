import { describe, expect, it } from "vitest";
import { GenerateManagerInsightUseCase } from "./generate-manager-insight.use-case.ts";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SignalRepository, SignalRow } from "../ports/signal-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../ports/simulated-follow-up-repository.port.ts";
import type { AiInsightPort, ManagerInsightResponse } from "../ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_SYSTEM_PROMPT } from "../prompts/manager-insight-system-prompt.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../ports/manager-insight-repository.port.ts";

class FakeSignalRepository implements SignalRepository {
  constructor(private readonly rows: SignalRow[]) {}
  async findAll(): Promise<SignalRow[]> {
    return this.rows;
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
  async findAll(): Promise<StoredManagerInsight[]> {
    return [];
  }
}

const WEEK_1 = new Date("2026-06-15T00:00:00.000Z");
const WEEK_2 = new Date("2026-06-22T00:00:00.000Z");

describe("GenerateManagerInsightUseCase", () => {
  it("formats the current ManagerSignalsResponse into a PT-BR summary and forwards it with the system prompt", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository);

    const result = await useCase.execute("Ana Konder", "institution-1", ["sector-uti"]);

    expect(result).toEqual({ interpretation: "texto", suggestedActions: ["ação 1"] });
    expect(aiInsight.lastParams?.systemPrompt).toBe(MANAGER_INSIGHT_SYSTEM_PROMPT);
    expect(aiInsight.lastParams?.summary).toContain("Taxa geral de sinais preocupantes: 60%");
    expect(aiInsight.lastParams?.summary).toContain("UTI: 60% (n=10)");
    expect(aiInsight.lastParams?.summary).toContain(
      "Tendência semanal (taxa de sinais preocupantes por semana, 2 semanas): 30%, 60%",
    );
  });

  it("propagates whatever the AiInsightPort throws (e.g. InsightGenerationFailedError from the adapter)", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    class ThrowingAiInsightPort implements AiInsightPort {
      async generateInsight(): Promise<ManagerInsightResponse> {
        throw new Error("boom");
      }
    }
    const insightRepository = new FakeManagerInsightRepository();
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, new ThrowingAiInsightPort(), insightRepository);

    await expect(useCase.execute("Ana Konder", "institution-1", ["sector-uti"])).rejects.toThrow("boom");
    expect(insightRepository.savedEntries).toEqual([]);
  });

  it("saves the generated insight to the repository, attributed to the manager and institution", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository);

    await useCase.execute("Ana Konder", "institution-1", ["sector-uti"]);

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
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] });
    const insightRepository = new FakeManagerInsightRepository();
    insightRepository.shouldFailSave = true;
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository);

    const result = await useCase.execute("Ana Konder", "institution-1", ["sector-uti"]);

    expect(result).toEqual({ interpretation: "texto", suggestedActions: ["ação 1"] });
  });
});
