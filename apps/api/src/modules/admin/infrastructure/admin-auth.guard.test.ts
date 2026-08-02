import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { AdminAuthGuard } from "./admin-auth.guard.ts";
import { AdminTokenService } from "../application/services/admin-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWithHeader(authorization: string | undefined): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { authorization } as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

describe("AdminAuthGuard", () => {
  const tokenService = new AdminTokenService(fakeConfig("test-secret"));
  const guard = new AdminAuthGuard(tokenService);

  it("allows a request with a valid Bearer token and attaches the decoded admin to the request", () => {
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.admin).toEqual({ id: "admin-1", name: "Zelo Ops" });
  });

  it("rejects a request with no Authorization header", () => {
    const { context } = contextWithHeader(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a request with a malformed or tampered token", () => {
    const { context } = contextWithHeader("Bearer not-a-real-token");
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
