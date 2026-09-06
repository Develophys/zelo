import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../ports/peer-partner-repository.port.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";

export class InvalidOrExpiredPeerPartnerSetupTokenError extends Error {}

export interface FinishPeerPartnerSetupInput {
  token: string;
  password: string;
}

@Injectable()
export class FinishPeerPartnerSetupUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  async execute(input: FinishPeerPartnerSetupInput): Promise<void> {
    const peerPartner = await this.repository.findBySetPasswordToken(hashSetPasswordToken(input.token));
    if (!peerPartner || !peerPartner.setPasswordTokenExpiresAt || peerPartner.setPasswordTokenExpiresAt.getTime() < Date.now()) {
      throw new InvalidOrExpiredPeerPartnerSetupTokenError();
    }

    const passwordHash = await this.passwordService.hash(input.password);
    await this.repository.update(peerPartner.id, { passwordHash, setPasswordToken: null, setPasswordTokenExpiresAt: null });

    await this.notifications.publish({
      institutionId: peerPartner.institutionId,
      type: "INVITE_ACCEPTED",
      payload: { kind: "peer-partner", name: peerPartner.name },
      dedupKey: `invite-accepted:peer-partner:${peerPartner.id}`,
    });
  }
}
