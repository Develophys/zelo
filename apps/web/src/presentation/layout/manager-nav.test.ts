import { describe, expect, it } from "vitest";
import {
  MANAGER_ADMIN_NAV,
  MANAGER_METHODOLOGY_NAV,
  MANAGER_PRIMARY_NAV,
  MANAGER_SETTINGS_NAV,
} from "./manager-nav";

describe("manager nav hotkeys", () => {
  it("assigns a distinct single-letter hotkey to each of the three primary destinations", () => {
    const hotkeys = MANAGER_PRIMARY_NAV.map((item) => item.hotkey);
    expect(hotkeys).toEqual(["t", "n", "h"]);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
  });

  it("assigns Metodologia a hotkey that does not collide with the primary group", () => {
    expect(MANAGER_METHODOLOGY_NAV.hotkey).toBe("m");
  });

  it("assigns each admin destination a distinct hotkey, none colliding with the rest of the nav", () => {
    const hotkeys = MANAGER_ADMIN_NAV.map((item) => item.hotkey);
    expect(hotkeys).toEqual(["g", "s", "p"]);
    const reserved = new Set(["t", "n", "h", "m", ...hotkeys, "c"]);
    expect(reserved.size).toBe(8);
  });

  it("assigns Configurações a hotkey that does not collide with anything else in the nav", () => {
    expect(MANAGER_SETTINGS_NAV.hotkey).toBe("c");
  });
});
