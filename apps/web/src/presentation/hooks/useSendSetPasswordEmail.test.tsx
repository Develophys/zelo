import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useSendManagerSetPasswordEmail } from "./useSendManagerSetPasswordEmail";
import { useSendPeerPartnerSetPasswordEmail } from "./useSendPeerPartnerSetPasswordEmail";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

function renderWithClient<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { ...renderHook(hook, { wrapper }), invalidate };
}

describe("resending a set-password invite", () => {
  beforeEach(() => {
    useManagerSessionStore.setState({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  // Resending issues a fresh token server-side, which moves the account's
  // status pill from "Convite expirado" back to "Convite pendente". Without
  // this invalidation the table keeps showing the stale pill until the page is
  // reloaded, so the admin cannot tell the resend worked.
  it("refetches the managers list, so the status pill reflects the new invite without a reload", async () => {
    vi.spyOn(container.sendManagerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const { result, invalidate } = renderWithClient(() => useSendManagerSetPasswordEmail());

    result.current.mutate("manager-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-managers"] });
  });

  it("refetches the peer partners list for the same reason", async () => {
    vi.spyOn(container.sendPeerPartnerSetPasswordEmailUseCase, "execute").mockResolvedValue(
      undefined,
    );
    const { result, invalidate } = renderWithClient(() => useSendPeerPartnerSetPasswordEmail());

    result.current.mutate("peer-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-peer-partners"] });
  });

  it("leaves the list alone when the resend fails, rather than hiding the failure behind a refetch", async () => {
    vi.spyOn(container.sendManagerSetPasswordEmailUseCase, "execute").mockRejectedValue(
      new Error("boom"),
    );
    const { result, invalidate } = renderWithClient(() => useSendManagerSetPasswordEmail());

    result.current.mutate("manager-1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["admin-managers"] });
  });
});
