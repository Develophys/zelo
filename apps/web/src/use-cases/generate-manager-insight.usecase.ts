import type { ManagerInsightPort, ManagerInsightResult } from "@/ports/manager-insight.port";

export class GenerateManagerInsightUseCase {
  constructor(private readonly insightPort: ManagerInsightPort) {}

  async execute(): Promise<ManagerInsightResult> {
    return this.insightPort.generateInsight();
  }
}
