import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { AdminAuthGuard } from "./admin-auth.guard.ts";
import { AdminTokenService } from "../application/services/admin-token.service.ts";
import type { AdminRepository, AdminRow } from "../application/ports/admin-repository.port.ts";

class FakeAdminRepository implements AdminRepository {
  public rows: AdminRow[] = [];
  async findByEmail(): Promise<AdminRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<AdminRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWithHeader(authorization: string | undefined): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { authorization } as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

function contextWithCookie(cookie: string | undefined, authorization?: string): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { cookie, authorization } as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

function adminRow(overrides: Partial<AdminRow> = {}): AdminRow {
  return {
    id: "admin-1",
    name: "Zelo Ops",
    email: "ops@zelo-demo.local",
    passwordHash: "hash",
    isActive: true,
    ...overrides,
  };
}

describe("AdminAuthGuard", () => {
  const tokenService = new AdminTokenService(fakeConfig("test-secret"));

  function buildGuard(rows: AdminRow[]): AdminAuthGuard {
    const repository = new FakeAdminRepository();
    repository.rows = rows;
    return new AdminAuthGuard(tokenService, repository);
  }

  it("allows a request with a valid Bearer token and attaches the decoded admin to the request", async () => {
    const guard = buildGuard([adminRow()]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.admin).toEqual({ id: "admin-1", name: "Zelo Ops" });
  });

  it("rejects a request with no Authorization header", async () => {
    const guard = buildGuard([adminRow()]);
    const { context } = contextWithHeader(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a request with a malformed or tampered token", async () => {
    const guard = buildGuard([adminRow()]);
    const { context } = contextWithHeader("Bearer not-a-real-token");
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose admin has since been deactivated", async () => {
    const guard = buildGuard([adminRow({ isActive: false })]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose admin row no longer exists", async () => {
    const guard = buildGuard([]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("allows a request whose token is in the admin_session cookie and attaches the admin", async () => {
    const guard = buildGuard([adminRow()]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context, request } = contextWithCookie(`admin_session=${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.admin).toEqual({ id: "admin-1", name: "Zelo Ops" });
  });

  it("does not let a Bearer header rescue a cookie that is present but invalid", async () => {
    const guard = buildGuard([adminRow()]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithCookie("admin_session=forged.token", `Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("does not accept another role's cookie", async () => {
    const guard = buildGuard([adminRow()]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithCookie(`manager_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a cookie whose admin has since been deactivated", async () => {
    const guard = buildGuard([adminRow({ isActive: false })]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithCookie(`admin_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a cookie whose admin row no longer exists", async () => {
    const guard = buildGuard([]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithCookie(`admin_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
