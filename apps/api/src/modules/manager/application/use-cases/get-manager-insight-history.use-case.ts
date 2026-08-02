import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_INSIGHT_REPOSITORY, type ManagerInsightRepository, type StoredManagerInsight } from "../ports/manager-insight-repository.port.ts";

@Injectable()
export class GetManagerInsightHistoryUseCase {
  constructor(@Inject(MANAGER_INSIGHT_REPOSITORY) private readonly repository: ManagerInsightRepository) {}

  async execute(institutionId: string): Promise<StoredManagerInsight[]> {
    return this.repository.findAll(institutionId);
  }
}
