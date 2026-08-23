import { describe, expect, it } from "vitest";
import { routes } from "./routes";

describe("routes", () => {
  it("has a unique path for every key", () => {
    const values = Object.values(routes);
    expect(new Set(values).size).toBe(values.length);
  });

  it("every path is absolute (starts with /)", () => {
    for (const path of Object.values(routes)) {
      expect(path.startsWith("/")).toBe(true);
    }
  });

  it("matches the route table in routing-and-state.md", () => {
    expect(routes).toEqual({
      splash: "/",
      privacy: "/privacy",
      consent: "/consent",
      home: "/home",
      assessment: "/assessment",
      phq9: "/assessment/phq9",
      gad7: "/assessment/gad7",
      result: "/assessment/result",
      crisis: "/crisis",
      crisisConnect: "/crisis/connect",
      crisisLine: "/crisis/line",
      chat: "/chat",
      peers: "/peers",
      manager: "/manager",
      managerAdmin: "/manager/admin",
      managerAdminManagers: "/manager/admin/managers",
      managerAdminSectors: "/manager/admin/sectors",
      managerAdminPeers: "/manager/admin/peers",
      managerNotifications: "/manager/notifications",
      managerSettings: "/manager/settings",
      managerLogin: "/manager/login",
      managerFinishSetup: "/manager/finish-setup",
      you: "/you",
      managerHistory: "/manager/history",
      linkInstitution: "/you/link",
      adminLogin: "/admin/login",
      admin: "/admin",
      peerPartnerLogin: "/peer/login",
      peerPartnerFinishSetup: "/peer/finish-setup",
      peerPartnerInbox: "/peer",
    });
  });
});
