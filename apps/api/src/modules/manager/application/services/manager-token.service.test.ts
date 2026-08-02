import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { ManagerTokenService } from "./manager-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("ManagerTokenService", () => {
  it("issues a token that verify() decodes back to the same manager id/name", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token, expiresAt } = service.issue("manager-1", "Ana Konder");

    expect(service.verify(token)).toEqual({ managerId: "manager-1", managerName: "Ana Konder" });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("round-trips a manager name containing a period without breaking parsing", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("manager-1", "Dr. Ana Konder");

    expect(service.verify(token)).toEqual({ managerId: "manager-1", managerName: "Dr. Ana Konder" });
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new ManagerTokenService(fakeConfig("secret-a"));
    const verifier = new ManagerTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue("manager-1", "Ana Konder");

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
    const { token } = service.issue("manager-1", "Ana Konder");

    vi.advanceTimersByTime(9 * 60 * 60 * 1000); // 9h, past the 8h expiry
    expect(service.verify(token)).toBeNull();

    vi.useRealTimers();
  });
});
