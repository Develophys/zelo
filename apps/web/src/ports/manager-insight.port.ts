import { z } from "zod";

export const ManagerInsightResultSchema = z.object({
  interpretation: z.string(),
  suggestedActions: z.array(z.string()),
});
export type ManagerInsightResult = z.infer<typeof ManagerInsightResultSchema>;

export class InsightGenerationFailedError extends Error {}

export interface ManagerInsightPort {
  generateInsight(): Promise<ManagerInsightResult>;
}
