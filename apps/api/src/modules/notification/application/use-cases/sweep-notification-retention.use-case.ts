import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification-repository.port.ts";
import { RETENTION_DAYS } from "../thresholds.ts";

@Injectable()
export class SweepNotificationRetentionUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository) {}

  // Only read rows are purged. An unread notification is an unfinished task, and
  // its age is not a reason to hide it.
  async execute(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    return this.repository.deleteReadOlderThan(cutoff);
  }
}
