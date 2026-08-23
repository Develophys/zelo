import { describe, expect, it } from "vitest";
import { CreateManagerUseCase } from "./create-manager.use-case.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import type {
  CreateManagerParams, ManagerRepository, ManagerRow, ManagerSummaryRow
} from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public lastCreateParams: CreateManagerParams | null = null;
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<ManagerSummaryRow[]> {
    throw new Error("not used in this test");
  }
  async create(params: CreateManagerParams): Promise<{ id: string; name: string; email: string }> {
    this.lastCreateParams = params;
    return { id: "manager-new", name: params.name, email: params.email };
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
}

class FakeSectorRepository {
  public lastReassign: { institutionId: string; managerId: string; sectorIds: string[] } | null = null;
  public knownSectorIds = new Set<string>();
  async findByIdsInInstitution(_institutionId: string, sectorIds: string[]) {
    return sectorIds.filter((id) => this.knownSectorIds.has(id)).map((id) => ({ id }));
  }
  async reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]) {
    this.lastReassign = { institutionId, managerId, sectorIds };
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("CreateManagerUseCase", () => {
  it("creates a HOSPITAL_ADMIN manager with no password, generates a set-password token, and sends an invite email", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    const emailPort = new FakeEmailPort();
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, emailPort);

    const result = await useCase.execute({ institutionId: "institution-1", name: "Mauricio", email: "mauricio@zelo-demo.local", role: "HOSPITAL_ADMIN" });

    expect(result.manager).toEqual({ id: "manager-new", name: "Mauricio", email: "mauricio@zelo-demo.local" });
    expect(managerRepository.lastCreateParams).toEqual({
      name: "Mauricio",
      email: "mauricio@zelo-demo.local",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
      setPasswordToken: expect.any(String),
      setPasswordTokenExpiresAt: expect.any(Date),
    });
    expect(sectorRepository.lastReassign).toBeNull();
    expect(emailPort.lastSend?.to).toBe("mauricio@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
    expect(emailPort.lastSend?.params.name).toBe("Mauricio");
    expect(emailPort.lastSend?.params.setPasswordUrl).toContain(managerRepository.lastCreateParams!.setPasswordToken);
  });

  it("creates a SECTOR_MANAGER and assigns the given sectors, all belonging to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a", "sector-b"]);
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new FakeEmailPort());

    await useCase.execute({ institutionId: "institution-1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-b"] });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-new", sectorIds: ["sector-a", "sector-b"] });
  });

  it("throws SectorNotInInstitutionError when a sectorId doesn't belong to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a"]);
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new FakeEmailPort());

    await expect(
      useCase.execute({ institutionId: "institution-1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-unknown"] }),
    ).rejects.toThrow(SectorNotInInstitutionError);
  });
});
