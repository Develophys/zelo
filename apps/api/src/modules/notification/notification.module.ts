import { Module } from "@nestjs/common";
import { SectorModule } from "../sector/sector.module.ts";
import { MANAGER_REPOSITORY } from "../manager/application/ports/manager-repository.port.ts";
import { PrismaManagerRepository } from "../manager/infrastructure/persistence/prisma-manager.repository.ts";
import { PEER_PARTNER_REPOSITORY } from "../peer-partner/application/ports/peer-partner-repository.port.ts";
import { PrismaPeerPartnerRepository } from "../peer-partner/infrastructure/persistence/prisma-peer-partner.repository.ts";
import { SIGNAL_REPOSITORY } from "../manager/application/ports/signal-repository.port.ts";
import { PrismaSignalRepository } from "../manager/infrastructure/persistence/prisma-signal.repository.ts";
import { NOTIFICATION_PUBLISHER } from "./application/ports/notification.port.ts";
import { NOTIFICATION_REPOSITORY } from "./application/ports/notification-repository.port.ts";
import { PublishNotificationUseCase } from "./application/use-cases/publish-notification.use-case.ts";
import { ResolveNotificationRecipientsUseCase } from "./application/use-cases/resolve-notification-recipients.use-case.ts";
import { SweepLapsedInvitesUseCase } from "./application/use-cases/sweep-lapsed-invites.use-case.ts";
import { SweepNotificationRetentionUseCase } from "./application/use-cases/sweep-notification-retention.use-case.ts";
import { SweepSectorRiskUseCase } from "./application/use-cases/sweep-sector-risk.use-case.ts";
import { PrismaNotificationRepository } from "./infrastructure/persistence/prisma-notification.repository.ts";
import { NotificationScheduler } from "./infrastructure/notification-scheduler.ts";

// SectorModule exports SECTOR_REPOSITORY, so it can simply be imported.
// MANAGER_REPOSITORY, PEER_PARTNER_REPOSITORY and SIGNAL_REPOSITORY are
// provided directly instead: neither ManagerModule nor PeerPartnerModule can
// be imported here without creating a cycle — ManagerModule imports this
// module (Task 3), and PeerPartnerModule imports it too. Both bind the same
// Prisma classes their owning modules do, so there is one implementation with
// two registrations, not two behaviours.
@Module({
  imports: [SectorModule],
  providers: [
    ResolveNotificationRecipientsUseCase,
    PublishNotificationUseCase,
    SweepLapsedInvitesUseCase,
    SweepNotificationRetentionUseCase,
    SweepSectorRiskUseCase,
    NotificationScheduler,
    { provide: MANAGER_REPOSITORY, useClass: PrismaManagerRepository },
    { provide: PEER_PARTNER_REPOSITORY, useClass: PrismaPeerPartnerRepository },
    { provide: SIGNAL_REPOSITORY, useClass: PrismaSignalRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    { provide: NOTIFICATION_PUBLISHER, useExisting: PublishNotificationUseCase },
  ],
  exports: [NOTIFICATION_PUBLISHER, NOTIFICATION_REPOSITORY],
})
export class NotificationModule {}
