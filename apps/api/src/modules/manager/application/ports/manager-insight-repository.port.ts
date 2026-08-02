export interface StoredManagerInsight {
  id: string;
  interpretation: string;
  suggestedActions: string[];
  summary: string;
  generatedAt: Date;
  createdByManagerName: string | null;
  institutionId: string;
}

export interface ManagerInsightRepository {
  save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void>;
  findAll(institutionId: string): Promise<StoredManagerInsight[]>;
}

export const MANAGER_INSIGHT_REPOSITORY = Symbol("MANAGER_INSIGHT_REPOSITORY");
