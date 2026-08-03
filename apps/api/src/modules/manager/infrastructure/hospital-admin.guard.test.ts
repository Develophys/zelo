import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import { HospitalAdminGuard } from "./hospital-admin.guard.ts";

function contextWithManager(manager: Request["manager"]): ExecutionContext {
  const request: Partial<Request> = { manager };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("HospitalAdminGuard", () => {
  const guard = new HospitalAdminGuard();

  it("allows a HOSPITAL_ADMIN manager through", () => {
    const context = contextWithManager({ id: "m-1", name: "Ana", institutionId: "i-1", role: "HOSPITAL_ADMIN" });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects a SECTOR_MANAGER with 403", () => {
    const context = contextWithManager({ id: "m-2", name: "Paulo", institutionId: "i-1", role: "SECTOR_MANAGER" });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
