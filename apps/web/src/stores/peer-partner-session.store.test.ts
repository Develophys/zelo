import { describe, expect, it, beforeEach } from "vitest";
import { usePeerPartnerSessionStore } from "./peer-partner-session.store";

describe("usePeerPartnerSessionStore", () => {
  beforeEach(() => {
    usePeerPartnerSessionStore.getState().clearSession();
  });

  it("isValid() is false with no session", () => {
    expect(usePeerPartnerSessionStore.getState().isValid()).toBe(false);
  });

  it("isValid() is true after setSession with a future expiry", () => {
    usePeerPartnerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "Dra. Ana");
    expect(usePeerPartnerSessionStore.getState().isValid()).toBe(true);
  });

  it("isValid() is false after clearSession", () => {
    usePeerPartnerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "Dra. Ana");
    usePeerPartnerSessionStore.getState().clearSession();
    expect(usePeerPartnerSessionStore.getState().isValid()).toBe(false);
  });

  it("carries the peer partner's name through setSession, clearing it on logout", () => {
    usePeerPartnerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "Dra. Ana");
    expect(usePeerPartnerSessionStore.getState().peerPartnerName).toBe("Dra. Ana");

    usePeerPartnerSessionStore.getState().clearSession();
    expect(usePeerPartnerSessionStore.getState().peerPartnerName).toBeNull();
  });
});
