import type { InstitutionLinkPort, LinkCodeResult } from "@/ports/institution-link.port";

export class LookupInstitutionUseCase {
  constructor(private readonly institutionLinkPort: InstitutionLinkPort) {}

  async execute(code: string): Promise<LinkCodeResult> {
    return this.institutionLinkPort.lookupByCode(code);
  }
}
