import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "@/shared/email/email.port.js";
import { sendInviteEmailOrRecord } from "@/shared/email/send-invite-email.js";
import { buildSetPasswordUrl } from "@/shared/email/build-set-password-url.js";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

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
    await this.managerRepository.update(input.managerId, {
      setPasswordToken: hashSetPasswordToken(setPasswordToken),
      setPasswordTokenExpiresAt,
    });

    const template = manager.passwordHash ? "password-reset" : "invite";
    // The token has already been persisted at this point. Letting a send
    // failure propagate would return 500 even though the token rotation
    // itself succeeded, hiding the real state from the admin.
    await sendInviteEmailOrRecord(
      () =>
        this.emailPort.send(manager.email, template, {
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
            payload: { kind: "manager", id: manager.id, name: manager.name, email: manager.email, reason },
            dedupKey: `invite-email-failed:manager:${manager.id}:${new Date().toISOString()}`,
          }),
      },
    );
  }
}
