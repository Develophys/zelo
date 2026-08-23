import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionRepository,
} from "../ports/admin-institution-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { sendInviteEmailOrRecord } from "../../../../shared/email/send-invite-email.ts";
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
  private readonly logger = new Logger(CreateInstitutionUseCase.name);

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

    // The institution and its first hospital admin are already committed at
    // this point. Letting a send failure propagate would 500 an otherwise
    // successful creation, and the retry would then collide on the unique
    // inviteCode/email. There is no manager audience to notify yet — the
    // hospital admin being created here is the first one — so this site
    // just logs and returns successfully, unlike the sibling call sites
    // that publish INVITE_EMAIL_FAILED.
    await sendInviteEmailOrRecord(
      () =>
        this.emailPort.send(hospitalAdmin.email, "invite", {
          name: hospitalAdmin.name,
          setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken),
        }),
      { logger: this.logger, logContext: `invite email failed for hospital admin ${hospitalAdmin.id}` },
    );

    return { institution, hospitalAdmin };
  }
}
