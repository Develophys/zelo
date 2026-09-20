import { describe, expect, it } from "vitest";
import { GenerateManagerInsightUseCase } from "./generate-manager-insight.usecase";
import type { ManagerInsightPort, ManagerInsightResult } from "@/ports/manager-insight.port";
import { InsightGenerationFailedError } from "@/ports/manager-insight.port";

class FakeManagerInsightPort implements ManagerInsightPort {
  constructor(private readonly result: ManagerInsightResult | Error) {}
  async generateInsight(): Promise<ManagerInsightResult> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("GenerateManagerInsightUseCase", () => {
  it("returns the insight on success", async () => {
    const useCase = new GenerateManagerInsightUseCase(
      new FakeManagerInsightPort({ interpretation: "texto", suggestedActions: ["ação 1"] }),
    );

    const result = await useCase.execute();

    expect(result).toEqual({ interpretation: "texto", suggestedActions: ["ação 1"] });
  });

  it("propagates InsightGenerationFailedError", async () => {
    const useCase = new GenerateManagerInsightUseCase(new FakeManagerInsightPort(new InsightGenerationFailedError()));

    await expect(useCase.execute()).rejects.toBeInstanceOf(InsightGenerationFailedError);
  });
});
