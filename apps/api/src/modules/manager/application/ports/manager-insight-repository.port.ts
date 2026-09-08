export interface StoredManagerInsight {
  id: string;
  interpretation: string;
  suggestedActions: string[];
  summary: string;
  generatedAt: Date;
  createdByManagerName: string | null;
  institutionId: string;
}

export interface ManagerInsightPage {
  items: StoredManagerInsight[];
  nextCursor: string | null;
  total: number | null;
}

export interface ManagerInsightRepository {
  save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void>;
  findPage(institutionId: string, query: { cursor: string | null; limit: number }): Promise<ManagerInsightPage>;
}

export const MANAGER_INSIGHT_REPOSITORY = Symbol("MANAGER_INSIGHT_REPOSITORY");
