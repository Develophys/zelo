import { describe, expect, it } from "vitest";
import { ListManagerNotificationsUseCase } from "./list-manager-notifications.usecase";
import type { ManagerNotificationsPage, ManagerNotificationsPort } from "@/ports/manager-notifications.port";

const PAGE: ManagerNotificationsPage = { items: [], nextCursor: null, total: 0 };

class FakeManagerNotificationsPort implements ManagerNotificationsPort {
  fetchPageCalls: { token: string; query: { cursor?: string | null; limit?: number } }[] = [];
  fetchUnreadCountCalls: string[] = [];

  async fetchPage(
    token: string,
    query: { cursor?: string | null; limit?: number },
  ): Promise<ManagerNotificationsPage> {
    this.fetchPageCalls.push({ token, query });
    return PAGE;
  }

  async fetchUnreadCount(token: string): Promise<number> {
    this.fetchUnreadCountCalls.push(token);
    return 3;
  }

  async markRead(): Promise<void> {}
  async markAllRead(): Promise<void> {}
}

describe("ListManagerNotificationsUseCase", () => {
  it("delegates execute() and unreadCount() to the port with the given token and query", async () => {
    const port = new FakeManagerNotificationsPort();
    const useCase = new ListManagerNotificationsUseCase(port);

    const page = await useCase.execute("valid-token", { cursor: "n-9", limit: 25 });
    const count = await useCase.unreadCount("valid-token");

    expect(page).toBe(PAGE);
    expect(port.fetchPageCalls).toEqual([{ token: "valid-token", query: { cursor: "n-9", limit: 25 } }]);
    expect(count).toBe(3);
    expect(port.fetchUnreadCountCalls).toEqual(["valid-token"]);
  });
});
