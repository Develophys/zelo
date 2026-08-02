import { describe, expect, it } from "vitest";
import { GetManagerInsightHistoryUseCase } from "./get-manager-insight-history.usecase";
import type { ManagerInsightHistoryPort, StoredManagerInsight } from "@/ports/manager-insight-history.port";

class FakeManagerInsightHistoryPort implements ManagerInsightHistoryPort {
  constructor(private readonly rows: StoredManagerInsight[]) {}
  async fetchHistory(): Promise<StoredManagerInsight[]> {
    return this.rows;
  }
}

describe("GetManagerInsightHistoryUseCase", () => {
  it("returns whatever the port's fetchHistory() returns", async () => {
    const rows: StoredManagerInsight[] = [
      { id: "1", interpretation: "texto", suggestedActions: ["ação"], summary: "resumo", generatedAt: "2026-07-01T00:00:00.000Z", createdByManagerName: null },
    ];
    const useCase = new GetManagerInsightHistoryUseCase(new FakeManagerInsightHistoryPort(rows));

    const result = await useCase.execute("valid-token");

    expect(result).toEqual(rows);
  });
});
