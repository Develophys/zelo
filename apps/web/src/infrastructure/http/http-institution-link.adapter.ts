import type { InstitutionLinkPort, InstitutionLookupResult } from "@/ports/institution-link.port";
import { InstitutionLookupResultSchema, InstitutionNotFoundError } from "@/ports/institution-link.port";

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
}
