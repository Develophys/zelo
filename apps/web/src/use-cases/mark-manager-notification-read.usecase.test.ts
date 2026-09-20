import { describe, expect, it } from "vitest";
import { MarkManagerNotificationReadUseCase } from "./mark-manager-notification-read.usecase";
import type { ManagerNotificationsPage, ManagerNotificationsPort } from "@/ports/manager-notifications.port";

class FakeManagerNotificationsPort implements ManagerNotificationsPort {
  markReadCalls: { id: string }[] = [];
  markAllReadCalls = 0;

  async fetchPage(): Promise<ManagerNotificationsPage> {
    return { items: [], nextCursor: null, total: 0 };
  }

  async fetchUnreadCount(): Promise<number> {
    return 0;
  }

  async markRead(id: string): Promise<void> {
    this.markReadCalls.push({ id });
  }

  async markAllRead(): Promise<void> {
    this.markAllReadCalls += 1;
  }
}

describe("MarkManagerNotificationReadUseCase", () => {
  it("delegates execute() and executeAll() to the port with the given id", async () => {
    const port = new FakeManagerNotificationsPort();
    const useCase = new MarkManagerNotificationReadUseCase(port);

    await useCase.execute("n-1");
    await useCase.executeAll();

    expect(port.markReadCalls).toEqual([{ id: "n-1" }]);
    expect(port.markAllReadCalls).toBe(1);
  });
});
