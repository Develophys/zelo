import { z } from "zod";
import type { InstitutionLinkPort, InstitutionLookupResult, InstitutionSector } from "@/ports/institution-link.port";
import { InstitutionLookupResultSchema, InstitutionNotFoundError, InstitutionSectorSchema } from "@/ports/institution-link.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpInstitutionLinkAdapter implements InstitutionLinkPort {
  async lookupByCode(code: string): Promise<InstitutionLookupResult> {
    const response = await fetch(`${API_BASE_URL}/institutions/by-code/${encodeURIComponent(code)}`);

    if (response.status === 404) {
      throw new InstitutionNotFoundError();
    }
    if (!response.ok) {
      throw new Error(`institution lookup failed with status ${response.status}`);
    }

    return InstitutionLookupResultSchema.parse(await response.json());
  }

  async listSectors(institutionId: string): Promise<InstitutionSector[]> {
    const response = await fetch(`${API_BASE_URL}/institutions/${encodeURIComponent(institutionId)}/sectors`);

    if (!response.ok) {
      throw new Error(`institution sectors lookup failed with status ${response.status}`);
    }

    return z.array(InstitutionSectorSchema).parse(await response.json());
  }
}
