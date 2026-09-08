import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import type { ManagerRepository, ManagerRow } from "../application/ports/manager-repository.port.ts";
import type { InstitutionRepository, InstitutionRow } from "@/modules/institution/application/ports/institution-repository.port.js";

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
  async findActiveHospitalAdminIds(): Promise<never> {
    throw new Error("not used in this test");
  }
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

class FakeInstitutionRepository implements InstitutionRepository {
  public rows: InstitutionRow[] = [];
  async findByInviteCode(): Promise<InstitutionRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<InstitutionRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
}

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

function managerRow(overrides: Partial<ManagerRow> = {}): ManagerRow {
  return {
    id: "manager-1",
    name: "Ana Konder",
    email: "ana@zelo-demo.local",
    passwordHash: "hash",
    setPasswordTokenExpiresAt: null,
    institutionId: "institution-1",
    role: "SECTOR_MANAGER",
    isActive: true,
    ...overrides,
  };
}

function institutionRow(overrides: Partial<InstitutionRow> = {}): InstitutionRow {
  return {
    id: "institution-1",
    name: "Hospital São Lucas",
    inviteCode: "sao-lucas-2026",
    isActive: true,
    ...overrides,
  };
}

describe("ManagerAuthGuard", () => {
  const tokenService = new ManagerTokenService(fakeConfig("test-secret"));

  function buildGuard(rows: ManagerRow[], institutionRows: InstitutionRow[] = [institutionRow()]): ManagerAuthGuard {
    const repository = new FakeManagerRepository();
    repository.rows = rows;
    const institutionRepository = new FakeInstitutionRepository();
    institutionRepository.rows = institutionRows;
    return new ManagerAuthGuard(tokenService, repository, institutionRepository);
  }

  it("allows a request with a valid Bearer token and attaches the decoded manager, including role, to the request", async () => {
    const guard = buildGuard([managerRow()]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.manager).toEqual({ id: "manager-1", name: "Ana Konder", institutionId: "institution-1", role: "SECTOR_MANAGER" });
  });

  it("rejects a request with no Authorization header", async () => {
    const guard = buildGuard([managerRow()]);
    const { context } = contextWithHeader(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a request with a malformed or tampered token", async () => {
    const guard = buildGuard([managerRow()]);
    const { context } = contextWithHeader("Bearer not-a-real-token");
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose manager has since been deactivated", async () => {
    const guard = buildGuard([managerRow({ isActive: false })]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose manager row no longer exists", async () => {
    const guard = buildGuard([]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose institution has since been deactivated, killing the live session immediately", async () => {
    const guard = buildGuard([managerRow()], [institutionRow({ isActive: false })]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose institution no longer exists", async () => {
    const guard = buildGuard([managerRow()], []);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("attaches the manager's CURRENT role from the database, not the token's stale embedded role", async () => {
    const guard = buildGuard([managerRow({ role: "SECTOR_MANAGER" })]);
    // Token was issued while they were still a hospital admin.
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "HOSPITAL_ADMIN");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.manager!.role).toBe("SECTOR_MANAGER");
  });
});
