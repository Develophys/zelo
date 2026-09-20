import type { ManagerNotificationsPage, ManagerNotificationsPort } from "@/ports/manager-notifications.port";

export class ListManagerNotificationsUseCase {
  constructor(private readonly port: ManagerNotificationsPort) {}

  async execute(query: { cursor?: string | null; limit?: number } = {}): Promise<ManagerNotificationsPage> {
    return this.port.fetchPage(query);
  }

  async unreadCount(): Promise<number> {
    return this.port.fetchUnreadCount();
  }
}
