import { describe, expect, it } from "vitest";
import { shouldTriggerPendingManagerInvite } from "./should-trigger-pending-manager-invite.ts";

function pendingSectorManager() {
  return { role: "SECTOR_MANAGER" as const, passwordHash: null, setPasswordTokenExpiresAt: null };
}

describe("shouldTriggerPendingManagerInvite", () => {
  it("is true for a never-invited SECTOR_MANAGER who is about to get a sector", () => {
    expect(shouldTriggerPendingManagerInvite(pendingSectorManager(), true)).toBe(true);
  });

  it("is false when no sector is being linked", () => {
    expect(shouldTriggerPendingManagerInvite(pendingSectorManager(), false)).toBe(false);
  });

  it("is false for a HOSPITAL_ADMIN", () => {
    expect(shouldTriggerPendingManagerInvite({ ...pendingSectorManager(), role: "HOSPITAL_ADMIN" }, true)).toBe(false);
  });

  it("is false once the manager already has a password", () => {
    expect(shouldTriggerPendingManagerInvite({ ...pendingSectorManager(), passwordHash: "hash" }, true)).toBe(false);
  });

  it("is false when an invite was already sent (token expiry already set, even if expired)", () => {
    expect(
      shouldTriggerPendingManagerInvite({ ...pendingSectorManager(), setPasswordTokenExpiresAt: new Date("2000-01-01") }, true),
    ).toBe(false);
  });
});
