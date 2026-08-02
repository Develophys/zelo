import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";
import { ManagerSignalsResponseSchema, UnauthorizedManagerError } from "@/ports/manager-signals.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpManagerSignalsAdapter implements ManagerSignalsPort {
  async fetchSignals(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    const query = sectorIds && sectorIds.length > 0 ? `?sectorIds=${sectorIds.map(encodeURIComponent).join(",")}` : "";
    const response = await fetch(`${API_BASE_URL}/manager/signals${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager signals failed with status ${response.status}`);
    }

    return ManagerSignalsResponseSchema.parse(await response.json());
  }
}
