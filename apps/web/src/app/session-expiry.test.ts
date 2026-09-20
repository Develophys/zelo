import { describe, expect, it } from "vitest";
import { UnauthorizedAdminError } from "@/ports/admin-institution.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { UnauthorizedPeerPartnerError } from "@/ports/peer-partner-auth.port";
import { sessionRoleOfError } from "./session-expiry";

describe("sessionRoleOfError", () => {
  it("maps each role's unauthorized error to its role", () => {
    expect(sessionRoleOfError(new UnauthorizedManagerError())).toBe("manager");
    expect(sessionRoleOfError(new UnauthorizedAdminError())).toBe("admin");
    expect(sessionRoleOfError(new UnauthorizedPeerPartnerError())).toBe("peerPartner");
  });

  it("returns null for any other error or value", () => {
    expect(sessionRoleOfError(new Error("boom"))).toBeNull();
    expect(sessionRoleOfError("nope")).toBeNull();
    expect(sessionRoleOfError(null)).toBeNull();
  });
});
