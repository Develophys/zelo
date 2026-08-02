import type { InstitutionLinkPort, InstitutionLookupResult } from "@/ports/institution-link.port";

export class LookupInstitutionUseCase {
  constructor(private readonly institutionLinkPort: InstitutionLinkPort) {}

  async execute(code: string): Promise<InstitutionLookupResult> {
    return this.institutionLinkPort.lookupByCode(code);
  }
}
