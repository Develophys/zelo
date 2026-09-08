import type { AdminInstitutionPage, AdminInstitutionPort } from "@/ports/admin-institution.port";

export class ListInstitutionsUseCase {
  constructor(private readonly adminInstitutionPort: AdminInstitutionPort) {}

  async execute(token: string, query: { cursor?: string | null; limit?: number } = {}): Promise<AdminInstitutionPage> {
    return this.adminInstitutionPort.list(token, query);
  }
}
