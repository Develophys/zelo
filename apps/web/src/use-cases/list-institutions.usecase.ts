import type { AdminInstitutionListItem, AdminInstitutionPort } from "@/ports/admin-institution.port";

export class ListInstitutionsUseCase {
  constructor(private readonly adminInstitutionPort: AdminInstitutionPort) {}

  async execute(token: string): Promise<AdminInstitutionListItem[]> {
    return this.adminInstitutionPort.list(token);
  }
}
