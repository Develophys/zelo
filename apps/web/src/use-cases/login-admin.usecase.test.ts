import { describe, expect, it } from "vitest";
import { LoginAdminUseCase } from "./login-admin.usecase";
import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";

class FakeAdminAuthAdapter implements AdminAuthPort {
  constructor(private readonly result: AdminLoginResult) {}
  async login(): Promise<AdminLoginResult> {
    return this.result;
  }
}

describe("LoginAdminUseCase", () => {
  it("delegates to the port and returns its result", async () => {
    const port = new FakeAdminAuthAdapter({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z" });
    const useCase = new LoginAdminUseCase(port);

    const result = await useCase.execute("Zelo Ops", "password");

    expect(result).toEqual({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z" });
  });
});
