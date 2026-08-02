import { Inject, Injectable } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionRepository,
} from "../ports/admin-institution-repository.port.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
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
    @Inject(AdminPasswordService) private readonly passwordService: AdminPasswordService,
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
