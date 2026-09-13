import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../ports/peer-partner-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "@/shared/email/email.port.js";
import { sendInviteEmailOrRecord } from "@/shared/email/send-invite-email.js";
import { buildSetPasswordUrl } from "@/shared/email/build-set-password-url.js";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class RequestPeerPartnerPasswordResetUseCase {
  private readonly logger = new Logger(RequestPeerPartnerPasswordResetUseCase.name);

  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  // Deliberately silent on every non-happy path (no peer partner with that
  // email, or a paused one) — the caller must always see the same response
  // either way, or the response itself would leak which emails have an account.
  async execute(email: string): Promise<void> {
    const peerPartner = await this.repository.findByEmail(email);
    if (!peerPartner || !peerPartner.isActive) return;

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);
    await this.repository.update(peerPartner.id, {
      setPasswordToken: hashSetPasswordToken(setPasswordToken),
      setPasswordTokenExpiresAt,
    });

    const template = peerPartner.passwordHash ? "password-reset" : "invite";
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
            institutionId: peerPartner.institutionId,
            type: "INVITE_EMAIL_FAILED",
            payload: { kind: "peer-partner", id: peerPartner.id, name: peerPartner.name, email: peerPartner.email, reason },
            dedupKey: `invite-email-failed:peer-partner:${peerPartner.id}:${new Date().toISOString()}`,
          }),
      },
    );
  }
}
