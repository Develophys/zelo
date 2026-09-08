import type { ManagerInsightHistoryPort, StoredManagerInsight } from "@/ports/manager-insight-history.port";
import { StoredManagerInsightSchema } from "@/ports/manager-insight-history.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { API_BASE_URL } from './api-base-url';


export class HttpManagerInsightHistoryAdapter implements ManagerInsightHistoryPort {
  async fetchHistory(token: string): Promise<StoredManagerInsight[]> {
    const response = await fetch(`${API_BASE_URL}/manager/insights/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager insight history fetch failed with status ${response.status}`);
    }

    const body = await response.json();
    return StoredManagerInsightSchema.array().parse(body);
  }
}
