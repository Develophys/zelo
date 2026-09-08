import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_INSIGHT_REPOSITORY, type ManagerInsightPage, type ManagerInsightRepository } from "../ports/manager-insight-repository.port.ts";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

@Injectable()
export class GetManagerInsightHistoryUseCase {
  constructor(@Inject(MANAGER_INSIGHT_REPOSITORY) private readonly repository: ManagerInsightRepository) {}

  async execute(institutionId: string, query: { cursor: string | null; limit: number }): Promise<ManagerInsightPage> {
    return this.repository.findPage(institutionId, query);
  }
}
