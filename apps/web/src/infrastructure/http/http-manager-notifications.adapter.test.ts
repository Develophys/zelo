import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpManagerNotificationsAdapter } from "./http-manager-notifications.adapter";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

const PAGE = {
  items: [
    {
      id: "n-1",
      type: "INVITE_ACCEPTED",
      payload: { kind: "manager", name: "Paulo" },
      sectorName: null,
      readAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    },
  ],
  nextCursor: null,
  total: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpManagerNotificationsAdapter", () => {
  it("sends the bearer token and parses the page", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(PAGE), { status: 200 }));

    const page = await new HttpManagerNotificationsAdapter().fetchPage("token", {});

    expect(page.items[0]!.id).toBe("n-1");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/manager/notifications");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("passes the cursor and limit through as query parameters", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(PAGE), { status: 200 }));

    await new HttpManagerNotificationsAdapter().fetchPage("token", { cursor: "n-9", limit: 25 });

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("cursor=n-9");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("limit=25");
  });

  it("omits the cursor parameter entirely on the first page", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(PAGE), { status: 200 }));

    await new HttpManagerNotificationsAdapter().fetchPage("token", { cursor: null });

    expect(String(fetchSpy.mock.calls[0]![0])).not.toContain("cursor=");
  });

  it("raises UnauthorizedManagerError on a 401, so the session guard can react", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    await expect(new HttpManagerNotificationsAdapter().fetchPage("token", {})).rejects.toThrow(
      UnauthorizedManagerError,
    );
  });

  it("reads the unread count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ count: 7 }), { status: 200 }),
    );

    expect(await new HttpManagerNotificationsAdapter().fetchUnreadCount("token")).toBe(7);
  });

  it("marks one notification read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await new HttpManagerNotificationsAdapter().markRead("token", "n-1");

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/manager/notifications/n-1/read");
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("PATCH");
  });

  it("marks everything read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await new HttpManagerNotificationsAdapter().markAllRead("token");

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/manager/notifications/read-all");
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("POST");
  });
});
