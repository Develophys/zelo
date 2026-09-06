import { Inject, Injectable, Logger } from "@nestjs/common";
import { GetManagerSignalsUseCase, type ManagerSignalsResponse } from "./get-manager-signals.use-case.ts";
import { AI_INSIGHT_PORT, type AiInsightPort, type ManagerInsightResponse } from "../ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_SYSTEM_PROMPT } from "../prompts/manager-insight-system-prompt.ts";
import { MANAGER_INSIGHT_REPOSITORY, type ManagerInsightRepository } from "../ports/manager-insight-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "@/modules/sector/application/ports/sector-repository.port.js";

@Injectable()
export class GenerateManagerInsightUseCase {
  private readonly logger = new Logger(GenerateManagerInsightUseCase.name);

  constructor(
    @Inject(GetManagerSignalsUseCase) private readonly getManagerSignals: GetManagerSignalsUseCase,
    @Inject(AI_INSIGHT_PORT) private readonly aiInsight: AiInsightPort,
    @Inject(MANAGER_INSIGHT_REPOSITORY) private readonly insightRepository: ManagerInsightRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  async execute(managerName: string, institutionId: string): Promise<ManagerInsightResponse> {
    // Insight generation is always institution-wide, regardless of the
    // requesting manager's role or sector assignment — unlike the dashboard
    // signals endpoint (which is scoped per-role), this is a deliberate,
    // already-approved design decision: a SECTOR_MANAGER's "Gerar análise"
    // still analyzes the whole institution's signals.
    const activeSectors = await this.sectorRepository.findActiveByInstitution(institutionId);
    const sectorIds = activeSectors.map((sector) => sector.id);
    const signals = await this.getManagerSignals.execute(institutionId, sectorIds);
    const summary = this.formatSummary(signals);
    const result = await this.aiInsight.generateInsight({ summary, systemPrompt: MANAGER_INSIGHT_SYSTEM_PROMPT });

    try {
      await this.insightRepository.save({
        interpretation: result.interpretation,
        suggestedActions: result.suggestedActions,
        summary,
        createdByManagerName: managerName,
        institutionId,
      });
    } catch (error) {
      this.logger.error(
        "Failed to save generated manager insight to history",
        error instanceof Error ? error.stack : String(error),
      );
    }

    return result;
  }

  private formatSummary(signals: ManagerSignalsResponse): string {
    const trendLine = signals.weeklyTrend.map((point) => `${Math.round(point.concerningRate * 100)}%`).join(", ");
    const segmentLines = signals.segments
      .map((segment) => `  - ${segment.label}: ${segment.value}% (n=${segment.n})`)
      .join("\n");

    return [
      "Dados agregados da equipe (última semana visível, últimas 6 semanas de tendência):",
      `- Taxa geral de sinais preocupantes: ${Math.round(signals.overallConcerningRate * 100)}%`,
      `- Check-ins nas últimas 4 semanas: ${signals.checkInsLast4Weeks}`,
      `- Tendência semanal (taxa de sinais preocupantes por semana, ${signals.weeklyTrend.length} semanas): ${trendLine}`,
      "- Por setor (apenas setores com 5+ respostas, por privacidade):",
      segmentLines,
    ].join("\n");
  }
}
