import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginManagerUseCase, InvalidManagerCredentialsError } from "./login-manager.use-case.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService } from "../services/manager-token.service.ts";
import type { ManagerRepository, ManagerRow } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  async findByEmail(email: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
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

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginManagerUseCase", () => {
  it("issues a token carrying the manager's institutionId and role when the email and password match", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("ana@zelo-demo.local", "correct-password");

    expect(result.role).toBe("HOSPITAL_ADMIN");
    expect(tokenService.verify(result.token)).toEqual({
      managerId: "manager-1",
      managerName: "Ana Konder",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
    });
  });

  it("throws InvalidManagerCredentialsError when the email is unknown", async () => {
    const passwordService = new ManagerPasswordService();
    const repository = new FakeManagerRepository();
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError when the password is wrong", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError for a correct password on a deactivated manager, same as a wrong password (no disclosure of deactivation)", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: false },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "correct-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError for a manager whose invite hasn't been completed yet (passwordHash is null), same as any other failure", async () => {
    const passwordService = new ManagerPasswordService();
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("pays the same password-verification cost for an unknown email as for a known one", async () => {
    const passwordService = new ManagerPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    verifySpy.mockClear();

    await expect(useCase.execute("ana@zelo-demo.local", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
