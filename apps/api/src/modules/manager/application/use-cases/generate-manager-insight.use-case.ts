import { Inject, Injectable, Logger } from "@nestjs/common";
import { MANAGER_METRICS } from "@zelo/domain";
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
    // O denominador viaja junto de cada ponto: sem ele o modelo lê
    // "40%, 42%, 44%" sem saber se cada semana tem 8 ou 180 respostas, e
    // afirma tendência onde há ruído de amostra.
    const trendLine = signals.weeklyTrend
      .map((point) => `${Math.round(point.concerningRate * 100)}% (n=${point.checkIns})`)
      .join(", ");
    const segmentLines = signals.segments
      .map((segment) => `  - ${segment.label}: ${segment.value}% (n=${segment.n})`)
      .join("\n");

    return [
      `Dados agregados da equipe (última semana visível, últimas ${signals.weeklyTrend.length} semanas de tendência):`,
      `- Cobertura: ${signals.sectorCoverage.visible} de ${signals.sectorCoverage.total} setores atingiram o mínimo de 5 respostas e entram nos números abaixo.`,
      `- ${MANAGER_METRICS.concerningRate.label}: ${Math.round(signals.overallConcerningRate * 100)}%`,
      `- ${MANAGER_METRICS.checkIns.label} (4 semanas): ${signals.checkInsLast4Weeks}`,
      `- Tendência semanal (taxa e base por semana, ${signals.weeklyTrend.length} semanas): ${trendLine}`,
      `- ${MANAGER_METRICS.followUpRate.label}: ${Math.round(signals.followUpResponseRate * 100)}% — dado de demonstração, não reflete esta instituição; não baseie nenhuma recomendação nele.`,
      "- Por setor (apenas setores com 5+ respostas, por privacidade):",
      segmentLines,
    ].join("\n");
  }
}
