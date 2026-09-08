import type { ManagerInsightHistoryPage, ManagerInsightHistoryPort } from "@/ports/manager-insight-history.port";

export class GetManagerInsightHistoryUseCase {
  constructor(private readonly historyPort: ManagerInsightHistoryPort) {}

  async execute(token: string, query: { cursor?: string | null; limit?: number } = {}): Promise<ManagerInsightHistoryPage> {
    return this.historyPort.fetchPage(token, query);
  }
}
