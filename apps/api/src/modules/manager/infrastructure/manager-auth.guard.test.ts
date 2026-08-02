import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWithHeader(authorization: string | undefined): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { authorization } as Request["headers"] };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe("ManagerAuthGuard", () => {
  const tokenService = new ManagerTokenService(fakeConfig("test-secret"));
  const guard = new ManagerAuthGuard(tokenService);

  it("allows a request with a valid Bearer token and attaches the decoded manager to the request", () => {
    const { token } = tokenService.issue("manager-1", "Ana Konder");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.manager).toEqual({ id: "manager-1", name: "Ana Konder" });
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
