// apps/web/src/presentation/layout/peer-partner-nav.test.ts
import { describe, expect, it } from "vitest";
import { PEER_PARTNER_NAV } from "./peer-partner-nav";
import { routes } from "@/presentation/lib/routes";

describe("PEER_PARTNER_NAV", () => {
  it("defines Início and Configurações, in order, with distinct hotkeys and their routes", () => {
    expect(PEER_PARTNER_NAV.map((item) => item.label)).toEqual(["Início", "Configurações"]);
    expect(PEER_PARTNER_NAV.map((item) => item.route)).toEqual([
      routes.peerPartnerInbox,
      routes.peerPartnerSettings,
    ]);
    const hotkeys = PEER_PARTNER_NAV.map((item) => item.hotkey);
    expect(hotkeys).toEqual(["i", "c"]);
    expect(new Set(hotkeys).size).toBe(2);
  });
});
