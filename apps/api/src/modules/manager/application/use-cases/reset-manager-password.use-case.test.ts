import { describe, expect, it } from "vitest";
import { ResetManagerPasswordUseCase } from "./reset-manager-password.use-case.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  public lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByName(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    this.lastUpdate = { id, patch };
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

describe("ResetManagerPasswordUseCase", () => {
  it("throws ManagerNotFoundError when the manager doesn't belong to the given institution", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [{ id: "manager-1", name: "Ana", passwordHash: "hash", institutionId: "institution-other", role: "SECTOR_MANAGER", isActive: true }];
    const useCase = new ResetManagerPasswordUseCase(managerRepository, new ManagerPasswordService());

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1" })).rejects.toThrow(ManagerNotFoundError);
  });

  it("generates and hashes a new temporary password", async () => {
    const managerRepository = new FakeManagerRepository();
    managerRepository.rows = [{ id: "manager-1", name: "Ana", passwordHash: "old-hash", institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true }];
    const passwordService = new ManagerPasswordService();
    const useCase = new ResetManagerPasswordUseCase(managerRepository, passwordService);

    const result = await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(result.temporaryPassword).toEqual(expect.any(String));
    const newHash = managerRepository.lastUpdate!.patch.passwordHash!;
    expect(await passwordService.verify(result.temporaryPassword, newHash)).toBe(true);
  });
});
