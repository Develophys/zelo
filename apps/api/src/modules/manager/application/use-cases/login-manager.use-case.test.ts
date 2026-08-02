import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginManagerUseCase, InvalidManagerCredentialsError } from "./login-manager.use-case.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService } from "../services/manager-token.service.ts";
import type { ManagerRepository, ManagerRow } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  constructor(private readonly rows: ManagerRow[]) {}
  async findByName(name: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginManagerUseCase", () => {
  it("issues a token when the name and password match a stored manager", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository([{ id: "manager-1", name: "Ana Konder", passwordHash }]);
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("Ana Konder", "correct-password");

    expect(result.token).toEqual(expect.any(String));
    expect(result.expiresAt).toEqual(expect.any(String));
    expect(tokenService.verify(result.token)).toEqual({ managerId: "manager-1", managerName: "Ana Konder" });
  });

  it("throws InvalidManagerCredentialsError when the name is unknown", async () => {
    const passwordService = new ManagerPasswordService();
    const repository = new FakeManagerRepository([]);
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown Person", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError when the password is wrong", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository([{ id: "manager-1", name: "Ana Konder", passwordHash }]);
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Ana Konder", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("pays the same password-verification cost for an unknown name as for a known one (no timing side channel to enumerate manager names)", async () => {
    const passwordService = new ManagerPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository([{ id: "manager-1", name: "Ana Konder", passwordHash }]);
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown Person", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    verifySpy.mockClear();

    await expect(useCase.execute("Ana Konder", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
