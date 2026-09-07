import { describe, expect, it, beforeEach } from "vitest";
import { useConsentStore } from "./consent.store";

describe("useConsentStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useConsentStore.setState({ hasConsented: false, consentedAt: null, aggregateOptIn: true });
  });

  it("starts with no consent", () => {
    expect(useConsentStore.getState().hasConsented).toBe(false);
    expect(useConsentStore.getState().consentedAt).toBeNull();
  });

  it("grant() sets hasConsented and a timestamp, persisted to localStorage", () => {
    useConsentStore.getState().grant();
    const state = useConsentStore.getState();
    expect(state.hasConsented).toBe(true);
    expect(state.consentedAt).not.toBeNull();

    const persisted = JSON.parse(localStorage.getItem("zelo.consent")!);
    expect(persisted.state.hasConsented).toBe(true);
  });

  it("revoke() clears consent", () => {
    useConsentStore.getState().grant();
    useConsentStore.getState().revoke();
    expect(useConsentStore.getState().hasConsented).toBe(false);
    expect(useConsentStore.getState().consentedAt).toBeNull();
  });

  it("grant() defaults aggregateOptIn to true when called with no argument", () => {
    useConsentStore.getState().grant();
    expect(useConsentStore.getState().aggregateOptIn).toBe(true);
  });

  it("grant(false) records the médico declining the aggregate signal", () => {
    useConsentStore.getState().grant(false);
    const state = useConsentStore.getState();
    expect(state.hasConsented).toBe(true);
    expect(state.aggregateOptIn).toBe(false);

    const persisted = JSON.parse(localStorage.getItem("zelo.consent")!);
    expect(persisted.state.aggregateOptIn).toBe(false);
  });

  it("setAggregateOptIn() changes the choice later without touching hasConsented", () => {
    useConsentStore.getState().grant();
    useConsentStore.getState().setAggregateOptIn(false);
    const state = useConsentStore.getState();
    expect(state.aggregateOptIn).toBe(false);
    expect(state.hasConsented).toBe(true);
  });

  it("a médico who consented before the aggregate toggle existed stays opted in", () => {
    localStorage.setItem(
      "zelo.consent",
      JSON.stringify({ state: { hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" }, version: 0 }),
    );
    useConsentStore.persist.rehydrate();
    expect(useConsentStore.getState().aggregateOptIn).toBe(true);
  });
});
