import { describe, expect, it } from "vitest";
import { GetManagerInsightHistoryUseCase } from "./get-manager-insight-history.use-case.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../ports/manager-insight-repository.port.ts";

class FakeManagerInsightRepository implements ManagerInsightRepository {
  public lastInstitutionId: string | null = null;
  constructor(private readonly rows: StoredManagerInsight[]) {}
  async save(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findAll(institutionId: string): Promise<StoredManagerInsight[]> {
    this.lastInstitutionId = institutionId;
    return this.rows;
  }
}

describe("GetManagerInsightHistoryUseCase", () => {
  it("passes the given institutionId through to the repository", async () => {
    const repository = new FakeManagerInsightRepository([]);
    const useCase = new GetManagerInsightHistoryUseCase(repository);

    await useCase.execute("institution-1");

    expect(repository.lastInstitutionId).toBe("institution-1");
  });

  it("returns whatever the repository's findAll() returns, unchanged, regardless of which manager generated each entry", async () => {
    const rows: StoredManagerInsight[] = [
      {
        id: "1",
        interpretation: "texto 1",
        suggestedActions: ["ação"],
        summary: "resumo 1",
        generatedAt: new Date("2026-07-01T00:00:00.000Z"),
        createdByManagerName: "Ana Konder",
        institutionId: "institution-1",
      },
      {
        id: "2",
        interpretation: "texto 2",
        suggestedActions: [],
        summary: "resumo 2",
        generatedAt: new Date("2026-06-01T00:00:00.000Z"),
        createdByManagerName: "Carlos Mendes",
        institutionId: "institution-1",
      },
      {
        id: "3",
        interpretation: "texto 3",
        suggestedActions: [],
        summary: "resumo 3",
        generatedAt: new Date("2026-05-01T00:00:00.000Z"),
        createdByManagerName: null,
        institutionId: "institution-1",
      },
    ];
    const repository = new FakeManagerInsightRepository(rows);
    const useCase = new GetManagerInsightHistoryUseCase(repository);

    const result = await useCase.execute("institution-1");

    expect(result).toEqual(rows);
  });
});
