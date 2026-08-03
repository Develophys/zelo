import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWithHeader(authorization: string | undefined): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { authorization } as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

describe("PeerPartnerAuthGuard", () => {
  const tokenService = new PeerPartnerTokenService(fakeConfig("test-secret"));
  const guard = new PeerPartnerAuthGuard(tokenService);

  it("allows a valid Bearer token and attaches the decoded peer partner to the request", () => {
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.peerPartner).toEqual({ id: "peer-1", name: "Dra. Ana", institutionId: "institution-1" });
  });

  it("rejects a request with no Authorization header", () => {
    const { context } = contextWithHeader(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a malformed or tampered token", () => {
    const { context } = contextWithHeader("Bearer not-a-real-token");
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
