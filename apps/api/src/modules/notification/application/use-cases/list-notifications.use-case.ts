import { Inject, Injectable } from "@nestjs/common";
import {
  NOTIFICATION_REPOSITORY,
  type NotificationPage,
  type NotificationRepository,
} from "../ports/notification-repository.port.ts";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

@Injectable()
export class ListNotificationsUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository) {}

  async execute(managerId: string, query: { cursor: string | null; limit: number }): Promise<NotificationPage> {
    return this.repository.findPage(managerId, query);
  }

  async unreadCount(managerId: string): Promise<number> {
    return this.repository.countUnread(managerId);
  }
}
