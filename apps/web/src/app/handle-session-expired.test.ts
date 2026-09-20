import { describe, expect, it, vi } from "vitest";
import { handleSessionExpired } from "./handle-session-expired";

function deps(currentPath: string) {
  return { clearSession: vi.fn(), currentPath: () => currentPath, navigate: vi.fn() };
}

describe("handleSessionExpired", () => {
  it("clears the role's session and sends the person to that role's login with the expired reason", () => {
    const d = deps("/manager");

    handleSessionExpired("manager", d);

    expect(d.clearSession).toHaveBeenCalledWith("manager");
    expect(d.navigate).toHaveBeenCalledWith("/manager/login", { replace: true, state: { reason: "expired" } });
  });

  it.each([
    ["admin", "/admin/login"],
    ["peerPartner", "/peer/login"],
  ] as const)("uses the %s login route", (role, loginRoute) => {
    const d = deps("/somewhere");

    handleSessionExpired(role, d);

    expect(d.navigate).toHaveBeenCalledWith(loginRoute, { replace: true, state: { reason: "expired" } });
  });

  it("does not navigate a second time when several requests fail at once and the login page is already showing", () => {
    const d = deps("/manager/login");

    handleSessionExpired("manager", d);

    expect(d.clearSession).toHaveBeenCalledWith("manager");
    expect(d.navigate).not.toHaveBeenCalled();
  });
});
