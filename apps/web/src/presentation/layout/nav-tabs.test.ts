import { describe, expect, it } from "vitest";
import { NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";

describe("NAV_TABS", () => {
  it("defines exactly the four médico destinations, in order, with their routes", () => {
    expect(NAV_TABS.map((tab) => tab.id)).toEqual(["home", "checkin", "chat", "you"]);
    expect(NAV_TABS.map((tab) => tab.label)).toEqual(["Início", "Check-in", "Conversar", "Você"]);
    expect(NAV_TABS.map((tab) => tab.route)).toEqual([routes.home, routes.assessment, routes.chat, routes.you]);
  });
});
