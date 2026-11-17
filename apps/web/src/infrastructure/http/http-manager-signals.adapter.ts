import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";
import { ManagerSignalsResponseSchema, UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { apiFetch } from "./api-fetch";


export class HttpManagerSignalsAdapter implements ManagerSignalsPort {
  async fetchSignals(sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    const query = sectorIds !== undefined ? `?sectorIds=${sectorIds.map(encodeURIComponent).join(",")}` : "";
    const response = await apiFetch(`/manager/signals${query}`);

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager signals failed with status ${response.status}`);
    }

    return ManagerSignalsResponseSchema.parse(await response.json());
  }
}
