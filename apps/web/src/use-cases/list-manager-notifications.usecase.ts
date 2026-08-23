import type { ManagerNotificationsPage, ManagerNotificationsPort } from "@/ports/manager-notifications.port";

export class ListManagerNotificationsUseCase {
  constructor(private readonly port: ManagerNotificationsPort) {}

  async execute(token: string, query: { cursor?: string | null; limit?: number } = {}): Promise<ManagerNotificationsPage> {
    return this.port.fetchPage(token, query);
  }

  async unreadCount(token: string): Promise<number> {
    return this.port.fetchUnreadCount(token);
  }
}
