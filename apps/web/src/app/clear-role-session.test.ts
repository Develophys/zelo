import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearRoleSession } from "./clear-role-session";
import type { SessionRole } from "./session-expiry";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

const EXPIRES_AT = "2999-01-01T00:00:00.000Z";

const SIGNED_IN = {
  manager: { loggedIn: true, role: "SECTOR_MANAGER", name: "Ana" },
  admin: { token: "a-token", expiresAt: EXPIRES_AT },
  peerPartner: { token: "p-token", expiresAt: EXPIRES_AT, peerPartnerName: "Bia" },
} as const;

const CLEARED = {
  manager: { loggedIn: false, role: null, name: null },
  admin: { token: null, expiresAt: null },
  peerPartner: { token: null, expiresAt: null, peerPartnerName: null },
} as const;

const ROLES: SessionRole[] = ["manager", "admin", "peerPartner"];

function expectStores(cleared: SessionRole) {
  const pick = <Role extends SessionRole>(role: Role) => (role === cleared ? CLEARED[role] : SIGNED_IN[role]);

  expect(useManagerSessionStore.getState()).toMatchObject(pick("manager"));
  expect(useAdminSessionStore.getState()).toMatchObject(pick("admin"));
  expect(usePeerPartnerSessionStore.getState()).toMatchObject(pick("peerPartner"));
}

describe("clearRoleSession", () => {
  beforeEach(() => {
    useManagerSessionStore.setState(SIGNED_IN.manager);
    useAdminSessionStore.setState(SIGNED_IN.admin);
    usePeerPartnerSessionStore.setState(SIGNED_IN.peerPartner);
  });

  afterEach(() => {
    useManagerSessionStore.getState().clearSession();
    useAdminSessionStore.getState().clearSession();
    usePeerPartnerSessionStore.getState().clearSession();
  });

  it.each(ROLES)("clears the %s session and leaves the other two exactly as they were", (role) => {
    clearRoleSession(role);

    expectStores(role);
  });
});
