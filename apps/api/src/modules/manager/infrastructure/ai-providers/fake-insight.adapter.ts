import { Injectable } from "@nestjs/common";
import type { AiInsightPort, ManagerInsightResponse } from "@/modules/manager/application/ports/ai-insight.port.js";

/**
 * AI_INSIGHT_PORT implementation for local/dev testing without spending real
 * Groq tokens — see AI_PROVIDER=mock in manager.module.ts.
 */
@Injectable()
export class FakeInsightAdapter implements AiInsightPort {
  async generateInsight(): Promise<ManagerInsightResponse> {
    await new Promise((resolve) => setTimeout(resolve, 150));

    return {
      interpretation:
        "[mock] A equipe apresenta sinais de sobrecarga moderada nas últimas duas semanas, concentrados no turno da noite.",
      suggestedActions: [
        "[mock] Revisar a escala do turno da noite para reduzir plantões consecutivos.",
        "[mock] Agendar uma conversa 1:1 com os colaboradores com maior variação de sinal.",
      ],
    };
  }
}
