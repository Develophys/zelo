import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { EMAIL_PORT, EmailDeliveryError, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface SendManagerSetPasswordEmailInput {
  institutionId: string;
  managerId: string;
}

@Injectable()
export class SendManagerSetPasswordEmailUseCase {
  private readonly logger = new Logger(SendManagerSetPasswordEmailUseCase.name);

  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  async execute(input: SendManagerSetPasswordEmailInput): Promise<void> {
    const manager = await this.managerRepository.findById(input.managerId);
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);
    await this.managerRepository.update(input.managerId, { setPasswordToken, setPasswordTokenExpiresAt });

    const template = manager.passwordHash ? "password-reset" : "invite";
    // The token has already been persisted at this point. Letting a send
    // failure propagate would return 500 even though the token rotation
    // itself succeeded, hiding the real state from the admin.
    try {
      await this.emailPort.send(manager.email, template, {
        name: manager.name,
        setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken),
      });
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) {
        throw error;
      }
      this.logger.error(`invite email failed for manager ${manager.id}`, error);
      await this.notifications.publish({
        institutionId: input.institutionId,
        type: "INVITE_EMAIL_FAILED",
        payload: {
          kind: "manager",
          name: manager.name,
          email: manager.email,
          reason: error instanceof Error ? error.message : "unknown",
        },
        dedupKey: `invite-email-failed:manager:${manager.id}:${new Date().toISOString()}`,
      });
    }
  }
}
