import type { AdminInstitutionPort, AdminInstitutionSector } from "@/ports/admin-institution.port";

export class ListAdminInstitutionSectorsUseCase {
  constructor(private readonly port: AdminInstitutionPort) {}

  async execute(token: string, institutionId: string): Promise<AdminInstitutionSector[]> {
    return this.port.listSectors(token, institutionId);
  }
}
