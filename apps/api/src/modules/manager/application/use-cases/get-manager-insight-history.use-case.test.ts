import { describe, expect, it } from "vitest";
import { GetManagerInsightHistoryUseCase } from "./get-manager-insight-history.use-case.ts";
import type { ManagerInsightPage, ManagerInsightRepository } from "../ports/manager-insight-repository.port.ts";

class FakeManagerInsightRepository implements ManagerInsightRepository {
  public lastInstitutionId: string | null = null;
  public lastQuery: { cursor: string | null; limit: number } | null = null;
  constructor(private readonly page: ManagerInsightPage) {}
  async save(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findPage(institutionId: string, query: { cursor: string | null; limit: number }): Promise<ManagerInsightPage> {
    this.lastInstitutionId = institutionId;
    this.lastQuery = query;
    return this.page;
  }
}

describe("GetManagerInsightHistoryUseCase", () => {
  it("passes the given institutionId and query through to the repository", async () => {
    const repository = new FakeManagerInsightRepository({ items: [], nextCursor: null, total: 0 });
    const useCase = new GetManagerInsightHistoryUseCase(repository);

    await useCase.execute("institution-1", { cursor: "cursor-9", limit: 25 });

    expect(repository.lastInstitutionId).toBe("institution-1");
    expect(repository.lastQuery).toEqual({ cursor: "cursor-9", limit: 25 });
  });

  it("returns whatever the repository's findPage() returns, unchanged, regardless of which manager generated each entry", async () => {
    const page: ManagerInsightPage = {
      items: [
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
      ],
      nextCursor: "2",
      total: 5,
    };
    const repository = new FakeManagerInsightRepository(page);
    const useCase = new GetManagerInsightHistoryUseCase(repository);

    const result = await useCase.execute("institution-1", { cursor: null, limit: 20 });

    expect(result).toEqual(page);
  });
});
