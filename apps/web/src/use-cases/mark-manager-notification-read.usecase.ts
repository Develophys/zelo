import type { ManagerNotificationsPort } from "@/ports/manager-notifications.port";

export class MarkManagerNotificationReadUseCase {
  constructor(private readonly port: ManagerNotificationsPort) {}

  async execute(id: string): Promise<void> {
    return this.port.markRead(id);
  }

  async executeAll(): Promise<void> {
    return this.port.markAllRead();
  }
}
