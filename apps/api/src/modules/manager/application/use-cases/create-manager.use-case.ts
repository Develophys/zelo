import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerRole } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "@/modules/sector/application/ports/sector-repository.port.js";
import { EMAIL_PORT, type EmailPort } from "@/shared/email/email.port.js";
import { sendInviteEmailOrRecord } from "@/shared/email/send-invite-email.js";
import { buildSetPasswordUrl } from "@/shared/email/build-set-password-url.js";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreateManagerInput {
  institutionId: string;
  name: string;
  email: string;
  role: ManagerRole;
  sectorIds?: string[];
}

export interface CreateManagerResult {
  manager: { id: string; name: string; email: string };
}

@Injectable()
export class CreateManagerUseCase {
  private readonly logger = new Logger(CreateManagerUseCase.name);

  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  async execute(input: CreateManagerInput): Promise<CreateManagerResult> {
    const sectorIds = input.sectorIds ?? [];

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      const owned = await this.sectorRepository.findByIdsInInstitution(input.institutionId, sectorIds);
      if (owned.length !== sectorIds.length) {
        throw new SectorNotInInstitutionError();
      }
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

    const manager = await this.managerRepository.create({
      name: input.name,
      email: input.email,
      institutionId: input.institutionId,
      role: input.role,
      setPasswordToken: hashSetPasswordToken(setPasswordToken),
      setPasswordTokenExpiresAt,
    });

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      await this.sectorRepository.reassignManagerSectors(input.institutionId, manager.id, sectorIds);
    }

    // The manager row is already committed at this point. Letting a send failure
    // propagate would return 500 for an account that genuinely exists, and the
    // retry would then collide with the unique email constraint — leaving an
    // account the admin can neither use nor recreate.
    await sendInviteEmailOrRecord(
      () =>
        this.emailPort.send(manager.email, "invite", {
          name: manager.name,
          setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken),
        }),
      {
        logger: this.logger,
        logContext: `invite email failed for manager ${manager.id}`,
        onDeliveryFailure: (reason) =>
          this.notifications.publish({
            institutionId: input.institutionId,
            type: "INVITE_EMAIL_FAILED",
            payload: { kind: "manager", name: manager.name, email: manager.email, reason },
            dedupKey: `invite-email-failed:manager:${manager.id}:${new Date().toISOString()}`,
          }),
      },
    );

    return { manager };
  }
}
