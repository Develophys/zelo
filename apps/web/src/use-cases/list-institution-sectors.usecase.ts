import type { InstitutionLinkPort, InstitutionSector } from "@/ports/institution-link.port";

export class ListInstitutionSectorsUseCase {
  constructor(private readonly institutionLinkPort: InstitutionLinkPort) {}

  async execute(institutionId: string): Promise<InstitutionSector[]> {
    return this.institutionLinkPort.listSectors(institutionId);
  }
}
