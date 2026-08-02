import { describe, expect, it } from "vitest";
import { CreateManagerUseCase } from "./create-manager.use-case.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import type { CreateManagerParams, ManagerRepository, ManagerRow, ManagerSummaryRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public lastCreateParams: CreateManagerParams | null = null;
  async findByName(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<ManagerSummaryRow[]> {
    throw new Error("not used in this test");
  }
  async create(params: CreateManagerParams): Promise<{ id: string; name: string }> {
    this.lastCreateParams = params;
    return { id: "manager-new", name: params.name };
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

class FakeSectorRepository {
  public lastReassign: { institutionId: string; managerId: string; sectorIds: string[] } | null = null;
  public knownSectorIds = new Set<string>();
  async findByIdsInInstitution(institutionId: string, sectorIds: string[]) {
    return sectorIds.filter((id) => this.knownSectorIds.has(id)).map((id) => ({ id }));
  }
  async reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]) {
    this.lastReassign = { institutionId, managerId, sectorIds };
  }
}

describe("CreateManagerUseCase", () => {
  it("creates a HOSPITAL_ADMIN manager without touching sector assignment", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new ManagerPasswordService());

    const result = await useCase.execute({ institutionId: "institution-1", name: "Mauricio", role: "HOSPITAL_ADMIN" });

    expect(result.manager).toEqual({ id: "manager-new", name: "Mauricio" });
    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(managerRepository.lastCreateParams).toEqual({
      name: "Mauricio",
      passwordHash: expect.any(String),
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
    });
    expect(sectorRepository.lastReassign).toBeNull();
  });

  it("creates a SECTOR_MANAGER and assigns the given sectors, all belonging to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a", "sector-b"]);
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new ManagerPasswordService());

    await useCase.execute({ institutionId: "institution-1", name: "Paulo", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-b"] });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-new", sectorIds: ["sector-a", "sector-b"] });
  });

  it("throws SectorNotInInstitutionError when a sectorId doesn't belong to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a"]);
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new ManagerPasswordService());

    await expect(
      useCase.execute({ institutionId: "institution-1", name: "Paulo", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-unknown"] }),
    ).rejects.toThrow(SectorNotInInstitutionError);
  });
});
