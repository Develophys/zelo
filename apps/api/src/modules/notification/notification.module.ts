import { Module } from "@nestjs/common";
import { SectorModule } from "../sector/sector.module.ts";
import { MANAGER_REPOSITORY } from "../manager/application/ports/manager-repository.port.ts";
import { PrismaManagerRepository } from "../manager/infrastructure/persistence/prisma-manager.repository.ts";
import { NOTIFICATION_PUBLISHER } from "./application/ports/notification.port.ts";
import { NOTIFICATION_REPOSITORY } from "./application/ports/notification-repository.port.ts";
import { PublishNotificationUseCase } from "./application/use-cases/publish-notification.use-case.ts";
import { ResolveNotificationRecipientsUseCase } from "./application/use-cases/resolve-notification-recipients.use-case.ts";
import { PrismaNotificationRepository } from "./infrastructure/persistence/prisma-notification.repository.ts";

// SectorModule exports SECTOR_REPOSITORY, so it can simply be imported.
// MANAGER_REPOSITORY is provided directly instead: ManagerModule does not
// export it, and importing ManagerModule would create a cycle the moment
// ManagerModule imports this one (Task 3). Both bind the same Prisma class,
// so there is one implementation with two registrations, not two behaviours.
@Module({
  imports: [SectorModule],
  providers: [
    ResolveNotificationRecipientsUseCase,
    PublishNotificationUseCase,
    { provide: MANAGER_REPOSITORY, useClass: PrismaManagerRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    { provide: NOTIFICATION_PUBLISHER, useExisting: PublishNotificationUseCase },
  ],
  exports: [NOTIFICATION_PUBLISHER, NOTIFICATION_REPOSITORY],
})
export class NotificationModule {}
