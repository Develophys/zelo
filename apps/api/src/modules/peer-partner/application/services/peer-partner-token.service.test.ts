import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { PeerPartnerTokenService } from "./peer-partner-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("PeerPartnerTokenService", () => {
  it("issues a token that verify() decodes back to the same id/name/institutionId", () => {
    const service = new PeerPartnerTokenService(fakeConfig("test-secret"));
    const { token, expiresAt } = service.issue("peer-1", "Dra. Ana", "institution-1");

    expect(service.verify(token)).toEqual({
      peerPartnerId: "peer-1",
      peerPartnerName: "Dra. Ana",
      institutionId: "institution-1",
    });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns the peer partner's name alongside the token, so the client isn't left decoding it to greet them", () => {
    const service = new PeerPartnerTokenService(fakeConfig("test-secret"));
    const { peerPartnerName } = service.issue("peer-1", "Dra. Ana", "institution-1");

    expect(peerPartnerName).toBe("Dra. Ana");
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new PeerPartnerTokenService(fakeConfig("secret-a"));
    const verifier = new PeerPartnerTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue("peer-1", "Dra. Ana", "institution-1");

    expect(verifier.verify(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    const service = new PeerPartnerTokenService(fakeConfig("test-secret"));
    expect(service.verify("not-a-valid-token")).toBeNull();
    expect(service.verify("")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const service = new PeerPartnerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("peer-1", "Dra. Ana", "institution-1");

    vi.advanceTimersByTime(9 * 60 * 60 * 1000);
    expect(service.verify(token)).toBeNull();

    vi.useRealTimers();
  });
});
