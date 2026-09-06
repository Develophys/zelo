import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "@/modules/manager/application/ports/manager-repository.port.js";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "@/modules/peer-partner/application/ports/peer-partner-repository.port.js";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../ports/notification.port.ts";

@Injectable()
export class SweepLapsedInvitesUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  // Expiry is not an event — nothing happens at the moment the token's deadline
  // passes — so it has to be swept for. The dedup key carries the expiry
  // instant itself (not a sweep timestamp): repeated nightly sweeps over the
  // same unchanged invite produce exactly one notification, but a resend
  // that rotates setPasswordTokenExpiresAt is a genuinely new lapse and
  // notifies again. The repository bounds the scan to a recent window
  // (thresholds.LAPSED_INVITE_WINDOW_DAYS) so this never re-selects an
  // invite that lapsed long enough ago that its notification row could
  // already have been purged by the retention sweep.
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
        payload: { kind: account.kind, id: account.id, name: account.name },
        dedupKey: `invite-expired:${account.kind}:${account.id}:${account.setPasswordTokenExpiresAt.toISOString()}`,
      });
    }

    return accounts.length;
  }
}
