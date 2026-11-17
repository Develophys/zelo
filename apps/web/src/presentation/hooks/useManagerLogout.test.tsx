import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useManagerLogout } from "./useManagerLogout";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  queryClient.setQueryData(["manager-signals"], { previous: "session" });
  return { ...renderHook(() => useManagerLogout(), { wrapper }), queryClient };
}

describe("useManagerLogout", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
  });

  it("asks the API to end the session, then clears the local session and the query cache", async () => {
    const logout = vi.spyOn(container.logoutManagerUseCase, "execute").mockResolvedValue(undefined);
    const { result, queryClient } = renderWithClient();

    result.current.mutate();

    await waitFor(() => expect(useManagerSessionStore.getState().loggedIn).toBe(false));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: false, role: null, name: null });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("still clears the local session and the query cache when the request fails, since the cookie expires on its own", async () => {
    vi.spyOn(container.logoutManagerUseCase, "execute").mockRejectedValue(new Error("network down"));
    const { result, queryClient } = renderWithClient();

    result.current.mutate();

    await waitFor(() => expect(useManagerSessionStore.getState().loggedIn).toBe(false));
    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: false, role: null, name: null });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
