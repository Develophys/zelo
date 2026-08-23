import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEM, NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";

describe("NAV_TABS", () => {
  it("defines exactly the four médico destinations, in order, with their routes", () => {
    expect(NAV_TABS.map((tab) => tab.id)).toEqual(["home", "checkin", "chat", "you"]);
    expect(NAV_TABS.map((tab) => tab.label)).toEqual(["Início", "Check-in", "Conversar", "Você"]);
    expect(NAV_TABS.map((tab) => tab.route)).toEqual([routes.home, routes.assessment, routes.chat, routes.you]);
  });
});

describe("ADMIN_NAV_ITEM", () => {
  it("is a separate secondary destination pointing at the manager panel", () => {
    expect(ADMIN_NAV_ITEM.id).toBe("admin");
    expect(ADMIN_NAV_ITEM.label).toBe("Administração");
    expect(ADMIN_NAV_ITEM.route).toBe(routes.manager);
  });

  it("is not part of the primary destinations", () => {
    expect(NAV_TABS.map((tab) => tab.id)).not.toContain(ADMIN_NAV_ITEM.id);
  });
});
