import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { AdminTokenService } from "./admin-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("AdminTokenService", () => {
  it("issues a token that verify() decodes back to the same admin id/name", () => {
    const service = new AdminTokenService(fakeConfig("test-secret"));
    const { token, expiresAt } = service.issue("admin-1", "Zelo Ops");

    expect(service.verify(token)).toEqual({ adminId: "admin-1", adminName: "Zelo Ops" });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new AdminTokenService(fakeConfig("secret-a"));
    const verifier = new AdminTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue("admin-1", "Zelo Ops");

    expect(verifier.verify(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    const service = new AdminTokenService(fakeConfig("test-secret"));
    expect(service.verify("not-a-valid-token")).toBeNull();
    expect(service.verify("")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const service = new AdminTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("admin-1", "Zelo Ops");

    vi.advanceTimersByTime(9 * 60 * 60 * 1000);
    expect(service.verify(token)).toBeNull();

    vi.useRealTimers();
  });
});
