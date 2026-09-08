import type { AdminInstitutionPort, UpdateInstitutionParams } from "@/ports/admin-institution.port";

export class UpdateInstitutionUseCase {
  constructor(private readonly adminInstitutionPort: AdminInstitutionPort) {}

  async execute(token: string, id: string, patch: UpdateInstitutionParams): Promise<void> {
    return this.adminInstitutionPort.update(token, id, patch);
  }
}
