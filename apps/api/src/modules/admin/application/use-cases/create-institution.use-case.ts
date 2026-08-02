import { Inject, Injectable } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionRepository,
} from "../ports/admin-institution-repository.port.ts";
import { ManagerPasswordService } from "../../../manager/application/services/manager-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";

export interface CreateInstitutionInput {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
}

export interface CreateInstitutionResult {
  institution: { id: string; name: string; inviteCode: string };
  hospitalAdmin: { id: string; name: string };
  temporaryPassword: string;
}

@Injectable()
export class CreateInstitutionUseCase {
  constructor(
    @Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly repository: AdminInstitutionRepository,
    // Deliberately the MANAGER password service, not AdminPasswordService: the
    // row being hashed for is a Manager, and LoginManagerUseCase is what will
    // verify this hash later. The two services must not be allowed to drift apart.
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
  ) {}

  async execute(input: CreateInstitutionInput): Promise<CreateInstitutionResult> {
    const temporaryPassword = generateTemporaryPassword();
    const hospitalAdminPasswordHash = await this.passwordService.hash(temporaryPassword);

    const { institution, hospitalAdmin } = await this.repository.createWithHospitalAdmin({
      institutionName: input.institutionName,
      inviteCode: input.inviteCode,
      hospitalAdminName: input.hospitalAdminName,
      hospitalAdminPasswordHash,
    });

    return { institution, hospitalAdmin, temporaryPassword };
  }
}
