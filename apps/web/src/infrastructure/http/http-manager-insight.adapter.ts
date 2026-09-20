import type { ManagerInsightPort, ManagerInsightResult } from "@/ports/manager-insight.port";
import { ManagerInsightResultSchema, InsightGenerationFailedError } from "@/ports/manager-insight.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { apiFetch } from "./api-fetch";


export class HttpManagerInsightAdapter implements ManagerInsightPort {
  async generateInsight(): Promise<ManagerInsightResult> {
    const response = await apiFetch("/manager/insights", { method: "POST" });

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (response.status === 502) {
      throw new InsightGenerationFailedError();
    }
    if (!response.ok) {
      throw new Error(`manager insight generation failed with status ${response.status}`);
    }

    return ManagerInsightResultSchema.parse(await response.json());
  }
}
