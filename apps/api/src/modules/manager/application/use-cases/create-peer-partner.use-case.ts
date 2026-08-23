import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { EMAIL_PORT, EmailDeliveryError, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreatePeerPartnerInput {
  institutionId: string;
  name: string;
  email: string;
  specialty: string;
}

export interface CreatePeerPartnerResult {
  peerPartner: { id: string; name: string; email: string };
}

@Injectable()
export class CreatePeerPartnerUseCase {
  private readonly logger = new Logger(CreatePeerPartnerUseCase.name);

  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  async execute(input: CreatePeerPartnerInput): Promise<CreatePeerPartnerResult> {
    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

    const peerPartner = await this.repository.create({
      name: input.name,
      email: input.email,
      institutionId: input.institutionId,
      specialty: input.specialty,
      setPasswordToken,
      setPasswordTokenExpiresAt,
    });

    // The peer partner row is already committed at this point. Letting a send
    // failure propagate would return 500 for an account that genuinely exists,
    // and the retry would then collide with the unique email constraint —
    // leaving an account the admin can neither use nor recreate.
    try {
      await this.emailPort.send(peerPartner.email, "invite", {
        name: peerPartner.name,
        setPasswordUrl: buildSetPasswordUrl("peer-partner", setPasswordToken),
      });
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) {
        throw error;
      }
      this.logger.error(`invite email failed for peer partner ${peerPartner.id}`, error);
      await this.notifications.publish({
        institutionId: input.institutionId,
        type: "INVITE_EMAIL_FAILED",
        payload: {
          kind: "peer-partner",
          name: peerPartner.name,
          email: peerPartner.email,
          reason: error instanceof Error ? error.message : "unknown",
        },
        dedupKey: `invite-email-failed:peer-partner:${peerPartner.id}:${new Date().toISOString()}`,
      });
    }

    return { peerPartner };
  }
}
