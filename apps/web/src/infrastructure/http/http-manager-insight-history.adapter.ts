import type { ManagerInsightHistoryPage, ManagerInsightHistoryPort } from "@/ports/manager-insight-history.port";
import { ManagerInsightHistoryPageSchema } from "@/ports/manager-insight-history.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { API_BASE_URL } from './api-base-url';


export class HttpManagerInsightHistoryAdapter implements ManagerInsightHistoryPort {
  async fetchPage(
    token: string,
    query: { cursor?: string | null; limit?: number },
  ): Promise<ManagerInsightHistoryPage> {
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";

    const response = await fetch(`${API_BASE_URL}/manager/insights/history${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager insight history fetch failed with status ${response.status}`);
    }

    return ManagerInsightHistoryPageSchema.parse(await response.json());
  }
}
