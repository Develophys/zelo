import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginAdminUseCase, InvalidAdminCredentialsError } from "./login-admin.use-case.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
import { AdminTokenService } from "../services/admin-token.service.ts";
import type { AdminRepository, AdminRow } from "../ports/admin-repository.port.ts";

class FakeAdminRepository implements AdminRepository {
  constructor(private readonly rows: AdminRow[]) {}
  async findByName(name: string): Promise<AdminRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginAdminUseCase", () => {
  it("issues a token when the name and password match", async () => {
    const passwordService = new AdminPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("Zelo Ops", "correct-password");

    expect(tokenService.verify(result.token)).toEqual({ adminId: "admin-1", adminName: "Zelo Ops" });
  });

  it("throws InvalidAdminCredentialsError when the name is unknown", async () => {
    const passwordService = new AdminPasswordService();
    const repository = new FakeAdminRepository([]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown", "any-password")).rejects.toThrow(InvalidAdminCredentialsError);
  });

  it("throws InvalidAdminCredentialsError when the password is wrong", async () => {
    const passwordService = new AdminPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Zelo Ops", "wrong-password")).rejects.toThrow(InvalidAdminCredentialsError);
  });

  it("pays the same password-verification cost for an unknown name as for a known one", async () => {
    const passwordService = new AdminPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown", "any-password")).rejects.toThrow(InvalidAdminCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
