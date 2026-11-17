import { describe, expect, it } from "vitest";
import { GetManagerInsightHistoryUseCase } from "./get-manager-insight-history.usecase";
import type { ManagerInsightHistoryPage, ManagerInsightHistoryPort } from "@/ports/manager-insight-history.port";

const PAGE: ManagerInsightHistoryPage = {
  items: [
    { id: "1", interpretation: "texto", suggestedActions: ["ação"], summary: "resumo", generatedAt: "2026-07-01T00:00:00.000Z", createdByManagerName: null },
  ],
  nextCursor: null,
  total: 1,
};

class FakeManagerInsightHistoryPort implements ManagerInsightHistoryPort {
  fetchPageCalls: { query: { cursor?: string | null; limit?: number } }[] = [];
  async fetchPage(query: { cursor?: string | null; limit?: number }): Promise<ManagerInsightHistoryPage> {
    this.fetchPageCalls.push({ query });
    return PAGE;
  }
}

describe("GetManagerInsightHistoryUseCase", () => {
  it("delegates to the port with the given query, returning its page unchanged", async () => {
    const port = new FakeManagerInsightHistoryPort();
    const useCase = new GetManagerInsightHistoryUseCase(port);

    const result = await useCase.execute({ cursor: "id-9", limit: 25 });

    expect(result).toBe(PAGE);
    expect(port.fetchPageCalls).toEqual([{ query: { cursor: "id-9", limit: 25 } }]);
  });
});
