import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionCache, registerSessionCacheClear } from "./session-cache";

describe("session cache", () => {
  afterEach(() => {
    registerSessionCacheClear(() => {});
  });

  it("does nothing, and does not throw, before a clear function is registered", () => {
    expect(() => clearSessionCache()).not.toThrow();
  });

  it("calls the registered clear function once per call", () => {
    const clear = vi.fn();
    registerSessionCacheClear(clear);

    clearSessionCache();
    expect(clear).toHaveBeenCalledTimes(1);

    clearSessionCache();
    expect(clear).toHaveBeenCalledTimes(2);
  });
});
