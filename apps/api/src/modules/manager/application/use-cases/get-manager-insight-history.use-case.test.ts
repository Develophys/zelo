import { describe, expect, it } from "vitest";
import { GetManagerInsightHistoryUseCase } from "./get-manager-insight-history.use-case.ts";
import type { ManagerInsightRepository, StoredManagerInsight } from "../ports/manager-insight-repository.port.ts";

class FakeManagerInsightRepository implements ManagerInsightRepository {
  constructor(private readonly rows: StoredManagerInsight[]) {}
  async save(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findAll(): Promise<StoredManagerInsight[]> {
    return this.rows;
  }
}

describe("GetManagerInsightHistoryUseCase", () => {
  it("returns whatever the repository's findAll() returns, unchanged, regardless of which manager generated each entry", async () => {
    const rows: StoredManagerInsight[] = [
      {
        id: "1",
        interpretation: "texto 1",
        suggestedActions: ["ação"],
        summary: "resumo 1",
        generatedAt: new Date("2026-07-01T00:00:00.000Z"),
        createdByManagerName: "Ana Konder",
      },
      {
        id: "2",
        interpretation: "texto 2",
        suggestedActions: [],
        summary: "resumo 2",
        generatedAt: new Date("2026-06-01T00:00:00.000Z"),
        createdByManagerName: "Carlos Mendes",
      },
      {
        id: "3",
        interpretation: "texto 3",
        suggestedActions: [],
        summary: "resumo 3",
        generatedAt: new Date("2026-05-01T00:00:00.000Z"),
        createdByManagerName: null,
      },
    ];
    const repository = new FakeManagerInsightRepository(rows);
    const useCase = new GetManagerInsightHistoryUseCase(repository);

    const result = await useCase.execute();

    expect(result).toEqual(rows);
  });
});
