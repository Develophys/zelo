import { describe, expect, it } from "vitest";
import { AdminController } from "@/modules/admin/infrastructure/admin.controller.js";
import { ManagerController } from "@/modules/manager/infrastructure/manager.controller.js";
import { PeerPartnerController } from "@/modules/peer-partner/infrastructure/peer-partner.controller.js";
import { LOGIN_THROTTLE_KEY } from "./throttling.ts";

describe("login routes carry the login throttle", () => {
  it.each([
    ["POST /manager/login", ManagerController.prototype.login],
    ["POST /admin/login", AdminController.prototype.login],
    ["POST /peer-partner/login", PeerPartnerController.prototype.login],
  ])("%s", (_route, handler) => {
    expect(Reflect.getMetadata(LOGIN_THROTTLE_KEY, handler)).toBe(true);
  });
});
