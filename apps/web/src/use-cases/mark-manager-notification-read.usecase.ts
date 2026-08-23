import type { ManagerNotificationsPort } from "@/ports/manager-notifications.port";

export class MarkManagerNotificationReadUseCase {
  constructor(private readonly port: ManagerNotificationsPort) {}

  async execute(token: string, id: string): Promise<void> {
    return this.port.markRead(token, id);
  }

  async executeAll(token: string): Promise<void> {
    return this.port.markAllRead(token);
  }
}
