import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../../../manager/application/ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import type { NotificationEvent, NotificationType } from "../ports/notification.port.ts";

const SECTOR_SCOPED: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "SECTOR_BECAME_VISIBLE",
  "SECTOR_RISK_THRESHOLD",
]);

@Injectable()
export class ResolveNotificationRecipientsUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  // The privacy rule, in one place: a recipient is either an active hospital
  // admin of the event's institution, or the active manager of the exact
  // sector the event names. There is no third path, which is what keeps a
  // notification from ever being wider than the data it cites.
  async execute(event: NotificationEvent): Promise<string[]> {
    if (!SECTOR_SCOPED.has(event.type)) {
      return this.managerRepository.findActiveHospitalAdminIds(event.institutionId);
    }

    if (!event.sectorId) return [];

    const sector = await this.sectorRepository.findById(event.sectorId);
    // A sector from another institution is not merely the wrong audience — it
    // means the event is malformed, so nobody hears about it.
    if (!sector || sector.institutionId !== event.institutionId) return [];

    const admins = await this.managerRepository.findActiveHospitalAdminIds(event.institutionId);
    const recipients = new Set(admins);
    if (sector.managerId) {
      const sectorManager = await this.managerRepository.findById(sector.managerId);
      if (sectorManager?.isActive) recipients.add(sector.managerId);
    }
    return [...recipients];
  }
}
