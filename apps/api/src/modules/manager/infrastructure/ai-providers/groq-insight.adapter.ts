import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq from "groq-sdk";
import { z } from "zod";
import type { AiInsightPort, ManagerInsightResponse } from "@/modules/manager/application/ports/ai-insight.port.js";
import { InsightGenerationFailedError } from "@/modules/manager/application/ports/ai-insight.port.js";

const ManagerInsightSchema = z.object({
  interpretation: z.string(),
  suggestedActions: z.array(z.string()),
});

/**
 * Separate Groq client instance from chat/infrastructure/ai-providers/groq.adapter.ts's
 * GroqAdapter — deliberately no shared code (see the design spec's "why a second, separate
 * AI component" section). Lower temperature than chat's 0.8: this component makes claims
 * about data and needs consistent, analytically-grounded output, not conversational variety.
 */
@Injectable()
export class GroqInsightAdapter implements AiInsightPort {
  private readonly client: Groq;
  private readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = new Groq({ apiKey: config.getOrThrow<string>("GROQ_API_KEY") });
    this.model = config.get<string>("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
  }

  async generateInsight(params: { summary: string; systemPrompt: string }): Promise<ManagerInsightResponse> {
    const completion = await this.createCompletion(params);

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new InsightGenerationFailedError("empty completion");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new InsightGenerationFailedError("completion was not valid JSON");
    }

    const result = ManagerInsightSchema.safeParse(parsed);
    if (!result.success) {
      throw new InsightGenerationFailedError("completion did not match ManagerInsightResponse shape");
    }

    return result.data;
  }

  private async createCompletion(params: { summary: string; systemPrompt: string }) {
    try {
      return await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 512,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.summary },
        ],
      });
    } catch (error) {
      throw new InsightGenerationFailedError("Groq API call failed", { cause: error });
    }
  }
}
