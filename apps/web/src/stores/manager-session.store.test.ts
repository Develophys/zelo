import { beforeEach, describe, expect, it } from "vitest";
import { useManagerSessionStore } from "./manager-session.store";

describe("manager session store", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({ loggedIn: false, role: null, name: null });
  });

  it("starts logged out", () => {
    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: false, role: null, name: null });
  });

  it("setSession records the role and name and marks the person logged in", () => {
    useManagerSessionStore.getState().setSession("HOSPITAL_ADMIN", "Ana");

    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
  });

  it("clearSession returns to logged out", () => {
    useManagerSessionStore.getState().setSession("HOSPITAL_ADMIN", "Ana");

    useManagerSessionStore.getState().clearSession();

    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: false, role: null, name: null });
  });

  it("holds no token, no expiry and nothing that authenticates", () => {
    const state = useManagerSessionStore.getState() as unknown as Record<string, unknown>;

    expect(state).not.toHaveProperty("token");
    expect(state).not.toHaveProperty("expiresAt");
  });

  it("drops a token left in sessionStorage by an older version of the app when it rehydrates", async () => {
    sessionStorage.setItem(
      "zelo.manager-session",
      JSON.stringify({ state: { token: "leaked.token", expiresAt: "2099-01-01T00:00:00.000Z", role: "HOSPITAL_ADMIN", name: "Ana" }, version: 0 }),
    );

    await useManagerSessionStore.persist.rehydrate();

    const state = useManagerSessionStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("token");
    expect(state.loggedIn).toBe(false);
    expect(sessionStorage.getItem("zelo.manager-session")).not.toContain("leaked.token");
  });
});
