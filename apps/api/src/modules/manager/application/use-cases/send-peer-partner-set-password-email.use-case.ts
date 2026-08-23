import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { sendInviteEmailOrRecord } from "../../../../shared/email/send-invite-email.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface SendPeerPartnerSetPasswordEmailInput {
  institutionId: string;
  peerPartnerId: string;
}

@Injectable()
export class SendPeerPartnerSetPasswordEmailUseCase {
  private readonly logger = new Logger(SendPeerPartnerSetPasswordEmailUseCase.name);

  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  async execute(input: SendPeerPartnerSetPasswordEmailInput): Promise<void> {
    const peerPartner = await this.repository.findById(input.peerPartnerId);
    if (!peerPartner || peerPartner.institutionId !== input.institutionId) {
      throw new PeerPartnerNotFoundError();
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);
    await this.repository.update(input.peerPartnerId, { setPasswordToken, setPasswordTokenExpiresAt });

    const template = peerPartner.passwordHash ? "password-reset" : "invite";
    // The token has already been persisted at this point. Letting a send
    // failure propagate would return 500 even though the token rotation
    // itself succeeded, hiding the real state from the admin.
    await sendInviteEmailOrRecord(
      () =>
        this.emailPort.send(peerPartner.email, template, {
          name: peerPartner.name,
          setPasswordUrl: buildSetPasswordUrl("peer-partner", setPasswordToken),
        }),
      {
        logger: this.logger,
        logContext: `invite email failed for peer partner ${peerPartner.id}`,
        onDeliveryFailure: (reason) =>
          this.notifications.publish({
            institutionId: input.institutionId,
            type: "INVITE_EMAIL_FAILED",
            payload: { kind: "peer-partner", name: peerPartner.name, email: peerPartner.email, reason },
            dedupKey: `invite-email-failed:peer-partner:${peerPartner.id}:${new Date().toISOString()}`,
          }),
      },
    );
  }
}
