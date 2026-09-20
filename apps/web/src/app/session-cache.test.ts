import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { clearSessionCache, registerSessionCache, resetSessionCache } from "./session-cache";

describe("session cache", () => {
  afterEach(() => {
    registerSessionCache({ clear: () => {}, reset: () => {} });
  });

  it("does nothing, and does not throw, before a cache is registered", () => {
    expect(() => clearSessionCache()).not.toThrow();
    expect(() => resetSessionCache()).not.toThrow();
  });

  it("clearSessionCache calls only the registered clear, once per call", () => {
    const clear = vi.fn();
    const reset = vi.fn();
    registerSessionCache({ clear, reset });

    clearSessionCache();
    expect(clear).toHaveBeenCalledTimes(1);

    clearSessionCache();
    expect(clear).toHaveBeenCalledTimes(2);
    expect(reset).not.toHaveBeenCalled();
  });

  it("resetSessionCache calls only the registered reset, once per call", () => {
    const clear = vi.fn();
    const reset = vi.fn();
    registerSessionCache({ clear, reset });

    resetSessionCache();
    expect(reset).toHaveBeenCalledTimes(1);

    resetSessionCache();
    expect(reset).toHaveBeenCalledTimes(2);
    expect(clear).not.toHaveBeenCalled();
  });

  it("a reset refetches a query a mounted observer is watching, so the page swaps to the new person's data", async () => {
    const client = new QueryClient();
    let served = "A";
    const observer = new QueryObserver(client, {
      queryKey: ["k"],
      queryFn: () => Promise.resolve(served),
    });
    const unsubscribe = observer.subscribe(() => {});
    registerSessionCache({ clear: () => client.clear(), reset: () => void client.resetQueries() });

    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("A"));

      served = "B";
      resetSessionCache();

      await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("B"));
    } finally {
      unsubscribe();
      client.clear();
    }
  });
});
