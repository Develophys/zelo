import { z } from "zod";
import type { InstitutionLinkPort, InstitutionSector, LinkCodeResult } from "@/ports/institution-link.port";
import { InstitutionNotFoundError, InstitutionSectorSchema, LinkCodeResultSchema } from "@/ports/institution-link.port";
import { API_BASE_URL } from './api-base-url';


export class HttpInstitutionLinkAdapter implements InstitutionLinkPort {
  async lookupByCode(code: string): Promise<LinkCodeResult> {
    const response = await fetch(`${API_BASE_URL}/institutions/by-code/${encodeURIComponent(code)}`);

    if (response.status === 404) {
      throw new InstitutionNotFoundError();
    }
    if (!response.ok) {
      throw new Error(`institution lookup failed with status ${response.status}`);
    }

    return LinkCodeResultSchema.parse(await response.json());
  }

  async listSectors(institutionId: string): Promise<InstitutionSector[]> {
    const response = await fetch(`${API_BASE_URL}/institutions/${encodeURIComponent(institutionId)}/sectors`);

    if (!response.ok) {
      throw new Error(`institution sectors lookup failed with status ${response.status}`);
    }

    return z.array(InstitutionSectorSchema).parse(await response.json());
  }
}
