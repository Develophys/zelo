import type { AdminInstitutionPort, CreateInstitutionParams, CreateInstitutionResult } from "@/ports/admin-institution.port";

export class CreateInstitutionUseCase {
  constructor(private readonly adminInstitutionPort: AdminInstitutionPort) {}

  async execute(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult> {
    return this.adminInstitutionPort.create(token, params);
  }
}
