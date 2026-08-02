import { describe, expect, it, beforeEach } from "vitest";
import { useAdminSessionStore } from "./admin-session.store";

describe("useAdminSessionStore", () => {
  beforeEach(() => {
    useAdminSessionStore.getState().clearSession();
  });

  it("isValid() is false with no session", () => {
    expect(useAdminSessionStore.getState().isValid()).toBe(false);
  });

  it("isValid() is true after setSession with a future expiry", () => {
    useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
    expect(useAdminSessionStore.getState().isValid()).toBe(true);
  });

  it("isValid() is false after clearSession", () => {
    useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
    useAdminSessionStore.getState().clearSession();
    expect(useAdminSessionStore.getState().isValid()).toBe(false);
  });
});
