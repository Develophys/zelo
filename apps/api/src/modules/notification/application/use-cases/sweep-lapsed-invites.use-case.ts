import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../../../manager/application/ports/manager-repository.port.ts";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../ports/notification.port.ts";

@Injectable()
export class SweepLapsedInvitesUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  // Expiry is not an event — nothing happens at the moment the token's deadline
  // passes — so it has to be swept for. The dedup key deliberately omits any
  // timestamp: the sweep runs nightly over the same lapsed invite forever, and
  // it must produce exactly one notification.
  async execute(now: Date = new Date()): Promise<number> {
    const managers = await this.managerRepository.findLapsedInvites(now);
    const peerPartners = await this.peerPartnerRepository.findLapsedInvites(now);

    const accounts = [
      ...managers.map((row) => ({ ...row, kind: "manager" as const })),
      ...peerPartners.map((row) => ({ ...row, kind: "peer-partner" as const })),
    ];

    for (const account of accounts) {
      await this.notifications.publish({
        institutionId: account.institutionId,
        type: "INVITE_EXPIRED",
        payload: { kind: account.kind, name: account.name },
        dedupKey: `invite-expired:${account.kind}:${account.id}`,
      });
    }

    return accounts.length;
  }
}
