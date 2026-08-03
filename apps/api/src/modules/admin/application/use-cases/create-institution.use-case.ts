import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionRepository,
} from "../ports/admin-institution-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreateInstitutionInput {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminEmail: string;
}

export interface CreateInstitutionResult {
  institution: { id: string; name: string; inviteCode: string };
  hospitalAdmin: { id: string; name: string; email: string };
}

@Injectable()
export class CreateInstitutionUseCase {
  constructor(
    @Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly repository: AdminInstitutionRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: CreateInstitutionInput): Promise<CreateInstitutionResult> {
    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

    const { institution, hospitalAdmin } = await this.repository.createWithHospitalAdmin({
      institutionName: input.institutionName,
      inviteCode: input.inviteCode,
      hospitalAdminName: input.hospitalAdminName,
      hospitalAdminEmail: input.hospitalAdminEmail,
      setPasswordToken,
      setPasswordTokenExpiresAt,
    });

    await this.emailPort.send(hospitalAdmin.email, "invite", { name: hospitalAdmin.name, setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken) });

    return { institution, hospitalAdmin };
  }
}
