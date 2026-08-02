import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { ManagerTokenService } from "./manager-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("ManagerTokenService", () => {
  it("issues a token (echoing role in the plaintext response) that verify() decodes back to the same manager id/name/institutionId/role", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token, expiresAt, role } = service.issue("manager-1", "Ana Konder", "institution-1", "HOSPITAL_ADMIN");

    expect(role).toBe("HOSPITAL_ADMIN");
    expect(service.verify(token)).toEqual({
      managerId: "manager-1",
      managerName: "Ana Konder",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
    });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("round-trips a SECTOR_MANAGER role correctly", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("manager-2", "Paulo Reis", "institution-1", "SECTOR_MANAGER");

    expect(service.verify(token)).toEqual({
      managerId: "manager-2",
      managerName: "Paulo Reis",
      institutionId: "institution-1",
      role: "SECTOR_MANAGER",
    });
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new ManagerTokenService(fakeConfig("secret-a"));
    const verifier = new ManagerTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue("manager-1", "Ana Konder", "institution-1", "HOSPITAL_ADMIN");

    expect(verifier.verify(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));

    expect(service.verify("not-a-valid-token")).toBeNull();
    expect(service.verify("")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("manager-1", "Ana Konder", "institution-1", "HOSPITAL_ADMIN");

    vi.advanceTimersByTime(9 * 60 * 60 * 1000);
    expect(service.verify(token)).toBeNull();

    vi.useRealTimers();
  });
});
