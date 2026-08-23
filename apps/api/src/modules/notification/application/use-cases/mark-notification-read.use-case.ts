import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification-repository.port.ts";

export class NotificationNotFoundError extends Error {}

@Injectable()
export class MarkNotificationReadUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository) {}

  async execute(managerId: string, id: string): Promise<void> {
    const found = await this.repository.markRead(managerId, id);
    if (!found) throw new NotificationNotFoundError();
  }

  async executeAll(managerId: string): Promise<void> {
    await this.repository.markAllRead(managerId);
  }
}
