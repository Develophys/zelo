import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useManagerNotifications, useManagerUnreadCount } from "./useManagerNotifications";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { ManagerNotificationsPage } from "@/ports/manager-notifications.port";

const PAGE: ManagerNotificationsPage = {
  items: [
    {
      id: "n-1",
      type: "INVITE_ACCEPTED",
      payload: { kind: "manager", name: "Paulo" },
      sectorName: null,
      readAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    },
    {
      id: "n-2",
      type: "INVITE_EXPIRED",
      payload: {},
      sectorName: null,
      readAt: "2026-08-19T10:00:00.000Z",
      createdAt: "2026-08-19T10:00:00.000Z",
    },
  ],
  nextCursor: null,
  total: 2,
};

// The badge (useManagerUnreadCount) and the list (useManagerNotifications) are
// rendered together on the same panel screen and share the query cache, so the
// tests exercise both hooks under one QueryClientProvider — same as the real page.
function renderCombined() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return renderHook(
    () => ({
      list: useManagerNotifications(),
      unreadCount: useManagerUnreadCount(),
    }),
    { wrapper },
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useManagerNotifications", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      role: "SECTOR_MANAGER",
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue(PAGE);
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flips the row and decrements the badge before the mark-read round trip settles", async () => {
    const markReadCall = deferred<void>();
    const markReadSpy = vi
      .spyOn(container.markManagerNotificationReadUseCase, "execute")
      .mockReturnValue(markReadCall.promise);

    const { result } = renderCombined();

    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    act(() => {
      result.current.list.markRead("n-1");
    });

    // The optimistic write lands in onMutate, which finishes before the mutationFn
    // (the mocked port call) is even invoked — so once the spy has been called, the
    // cache is already flipped, and the round trip is still pending.
    await waitFor(() => expect(markReadSpy).toHaveBeenCalled());

    expect(result.current.list.notifications.find((item) => item.id === "n-1")?.readAt).not.toBeNull();
    expect(result.current.unreadCount).toBe(0);

    markReadCall.resolve();
    await waitFor(() => expect(result.current.list.notifications.find((item) => item.id === "n-1")?.readAt).not.toBeNull());
  });

  it("restores both the row and the badge when the mark-read round trip fails", async () => {
    vi.spyOn(container.markManagerNotificationReadUseCase, "execute").mockRejectedValue(new Error("network down"));

    const { result } = renderCombined();

    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    act(() => {
      result.current.list.markRead("n-1");
    });

    await waitFor(() => {
      expect(result.current.list.notifications.find((item) => item.id === "n-1")?.readAt).toBeNull();
    });
    expect(result.current.unreadCount).toBe(1);
  });

  it("does not decrement the badge when marking an already-read row (regression: no double-counting)", async () => {
    const markReadCall = deferred<void>();
    const markReadSpy = vi
      .spyOn(container.markManagerNotificationReadUseCase, "execute")
      .mockReturnValue(markReadCall.promise);

    const { result } = renderCombined();

    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    act(() => {
      result.current.list.markRead("n-2"); // n-2 is already read
    });

    await waitFor(() => expect(markReadSpy).toHaveBeenCalled());

    expect(result.current.unreadCount).toBe(1);

    markReadCall.resolve();
  });

  it("never lets the badge count go below zero", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);
    const markReadCall = deferred<void>();
    const markReadSpy = vi
      .spyOn(container.markManagerNotificationReadUseCase, "execute")
      .mockReturnValue(markReadCall.promise);

    const { result } = renderCombined();

    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    await waitFor(() => expect(result.current.unreadCount).toBe(0));

    act(() => {
      result.current.list.markRead("n-1"); // unread row, but the badge is already at 0
    });

    await waitFor(() => expect(markReadSpy).toHaveBeenCalled());

    expect(result.current.unreadCount).toBe(0);

    markReadCall.resolve();
  });
});
