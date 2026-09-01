import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEM, NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";

describe("NAV_TABS", () => {
  it("defines exactly the five médico destinations, in order, with their routes", () => {
    expect(NAV_TABS.map((tab) => tab.id)).toEqual(["home", "checkin", "chat", "apoio", "you"]);
    expect(NAV_TABS.map((tab) => tab.label)).toEqual(["Início", "Check-in", "Conversar", "Apoio", "Você"]);
    expect(NAV_TABS.map((tab) => tab.route)).toEqual([routes.home, routes.assessment, routes.chat, routes.crisis, routes.you]);
  });

  // Reaching the crisis line used to require already being in trouble: a bad
  // score, a chat classifier firing, or a peer search failing. Someone who
  // opens the app *because* they are in crisis had no route at all.
  it("carries a standing route to the crisis screen, not one conditional on a score", () => {
    const apoio = NAV_TABS.find((tab) => tab.id === "apoio");
    expect(apoio?.route).toBe(routes.crisis);
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
