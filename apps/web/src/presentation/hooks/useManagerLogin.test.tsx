import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useManagerLogin } from "./useManagerLogin";
import * as container from "@/app/container";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";
import { useManagerSessionStore } from "@/stores/manager-session.store";

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { ...renderHook(() => useManagerLogin(), { wrapper }), queryClient };
}

describe("useManagerLogin", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({ loggedIn: false, role: null, name: null });
  });

  it("records the role and name and marks the manager logged in", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockResolvedValue({ role: "SECTOR_MANAGER", name: "Paulo Reis" });
    const { result } = renderWithClient();

    result.current.mutate({ email: "paulo@zelo-demo.local", password: "senha-correta" });

    await waitFor(() => {
      expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: true, role: "SECTOR_MANAGER", name: "Paulo Reis" });
    });
  });

  it("clears the query cache, so whoever logged in before cannot leave their data on screen for the next person", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockResolvedValue({ role: "HOSPITAL_ADMIN", name: "Ana" });
    const { result, queryClient } = renderWithClient();
    queryClient.setQueryData(["manager-signals"], { previous: "session" });

    result.current.mutate({ email: "ana@zelo-demo.local", password: "senha-correta" });

    await waitFor(() => expect(useManagerSessionStore.getState().loggedIn).toBe(true));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("leaves the session and the cache alone when the credentials are refused", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockRejectedValue(new InvalidManagerCredentialsError());
    const { result, queryClient } = renderWithClient();
    queryClient.setQueryData(["manager-signals"], { kept: true });

    result.current.mutate({ email: "ana@zelo-demo.local", password: "errada" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useManagerSessionStore.getState().loggedIn).toBe(false);
    expect(queryClient.getQueryData(["manager-signals"])).toEqual({ kept: true });
  });
});
