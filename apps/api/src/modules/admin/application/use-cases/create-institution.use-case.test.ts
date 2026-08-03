import { describe, expect, it } from "vitest";
import { CreateInstitutionUseCase } from "./create-institution.use-case.ts";
import { ManagerPasswordService } from "../../../manager/application/services/manager-password.service.ts";
import {
  DuplicateInstitutionOrManagerError,
  type AdminInstitutionRepository,
  type AdminInstitutionRow,
} from "../ports/admin-institution-repository.port.ts";

class FakeAdminInstitutionRepository implements AdminInstitutionRepository {
  public lastCreateParams: Parameters<AdminInstitutionRepository["createWithHospitalAdmin"]>[0] | null = null;
  public shouldThrowDuplicate = false;

  async createWithHospitalAdmin(
    params: Parameters<AdminInstitutionRepository["createWithHospitalAdmin"]>[0],
  ): ReturnType<AdminInstitutionRepository["createWithHospitalAdmin"]> {
    this.lastCreateParams = params;
    if (this.shouldThrowDuplicate) throw new DuplicateInstitutionOrManagerError();
    return {
      institution: { id: "institution-1", name: params.institutionName, inviteCode: params.inviteCode },
      hospitalAdmin: { id: "manager-1", name: params.hospitalAdminName },
    };
  }

  async findAll(): Promise<AdminInstitutionRow[]> {
    throw new Error("not used in this test");
  }
}

describe("CreateInstitutionUseCase", () => {
  // The hospital admin created here logs in through LoginManagerUseCase, which
  // verifies with ManagerPasswordService — so that is the service that must hash it.
  it("hashes the first hospital admin's temporary password with ManagerPasswordService, the one that will verify it at login", async () => {
    const repository = new FakeAdminInstitutionRepository();
    const passwordService = new ManagerPasswordService();
    const useCase = new CreateInstitutionUseCase(repository, passwordService);

    const result = await useCase.execute({
      institutionName: "Hospital Teste",
      inviteCode: "teste-2026",
      hospitalAdminName: "Mauricio",
    });

    expect(result.institution).toEqual({ id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026" });
    expect(result.hospitalAdmin).toEqual({ id: "manager-1", name: "Mauricio" });
    expect(result.temporaryPassword).toEqual(expect.any(String));

    const passedHash = repository.lastCreateParams!.hospitalAdminPasswordHash;
    expect(await passwordService.verify(result.temporaryPassword, passedHash)).toBe(true);
  });

  it("propagates DuplicateInstitutionOrManagerError from the repository", async () => {
    const repository = new FakeAdminInstitutionRepository();
    repository.shouldThrowDuplicate = true;
    const useCase = new CreateInstitutionUseCase(repository, new ManagerPasswordService());

    await expect(
      useCase.execute({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio" }),
    ).rejects.toThrow(DuplicateInstitutionOrManagerError);
  });
});
