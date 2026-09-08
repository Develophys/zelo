import { z } from "zod";

export const StoredManagerInsightSchema = z.object({
  id: z.string(),
  interpretation: z.string(),
  suggestedActions: z.array(z.string()),
  summary: z.string(),
  generatedAt: z.string(),
  createdByManagerName: z.string().nullable(),
});
export type StoredManagerInsight = z.infer<typeof StoredManagerInsightSchema>;

export const ManagerInsightHistoryPageSchema = z.object({
  items: z.array(StoredManagerInsightSchema),
  nextCursor: z.string().nullable(),
  total: z.number().nullable(),
});
export type ManagerInsightHistoryPage = z.infer<typeof ManagerInsightHistoryPageSchema>;

export interface ManagerInsightHistoryPort {
  fetchPage(token: string, query: { cursor?: string | null; limit?: number }): Promise<ManagerInsightHistoryPage>;
}
