import { describe, expect, it } from "vitest";
import { MarkManagerNotificationReadUseCase } from "./mark-manager-notification-read.usecase";
import type { ManagerNotificationsPage, ManagerNotificationsPort } from "@/ports/manager-notifications.port";

class FakeManagerNotificationsPort implements ManagerNotificationsPort {
  markReadCalls: { token: string; id: string }[] = [];
  markAllReadCalls: string[] = [];

  async fetchPage(): Promise<ManagerNotificationsPage> {
    return { items: [], nextCursor: null, total: 0 };
  }

  async fetchUnreadCount(): Promise<number> {
    return 0;
  }

  async markRead(token: string, id: string): Promise<void> {
    this.markReadCalls.push({ token, id });
  }

  async markAllRead(token: string): Promise<void> {
    this.markAllReadCalls.push(token);
  }
}

describe("MarkManagerNotificationReadUseCase", () => {
  it("delegates execute() and executeAll() to the port with the given token and id", async () => {
    const port = new FakeManagerNotificationsPort();
    const useCase = new MarkManagerNotificationReadUseCase(port);

    await useCase.execute("valid-token", "n-1");
    await useCase.executeAll("valid-token");

    expect(port.markReadCalls).toEqual([{ token: "valid-token", id: "n-1" }]);
    expect(port.markAllReadCalls).toEqual(["valid-token"]);
  });
});
