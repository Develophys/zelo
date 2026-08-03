import { describe, expect, it } from "vitest";
import { CreateInstitutionUseCase } from "./create-institution.use-case.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
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
      hospitalAdmin: { id: "manager-1", name: params.hospitalAdminName, email: params.hospitalAdminEmail },
    };
  }

  async findAll(): Promise<AdminInstitutionRow[]> {
    throw new Error("not used in this test");
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("CreateInstitutionUseCase", () => {
  it("creates the institution and its first hospital admin with a set-password token, sending an invite email", async () => {
    const repository = new FakeAdminInstitutionRepository();
    const emailPort = new FakeEmailPort();
    const useCase = new CreateInstitutionUseCase(repository, emailPort);

    const result = await useCase.execute({
      institutionName: "Hospital Teste",
      inviteCode: "teste-2026",
      hospitalAdminName: "Mauricio",
      hospitalAdminEmail: "mauricio@zelo-demo.local",
    });

    expect(result.institution).toEqual({ id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026" });
    expect(result.hospitalAdmin).toEqual({ id: "manager-1", name: "Mauricio", email: "mauricio@zelo-demo.local" });
    expect(repository.lastCreateParams!.setPasswordToken).toEqual(expect.any(String));
    expect(repository.lastCreateParams!.setPasswordTokenExpiresAt).toBeInstanceOf(Date);
    expect(emailPort.lastSend?.to).toBe("mauricio@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
    expect(emailPort.lastSend?.params.setPasswordUrl).toContain(repository.lastCreateParams!.setPasswordToken);
  });

  it("propagates DuplicateInstitutionOrManagerError from the repository", async () => {
    const repository = new FakeAdminInstitutionRepository();
    repository.shouldThrowDuplicate = true;
    const useCase = new CreateInstitutionUseCase(repository, new FakeEmailPort());

    await expect(
      useCase.execute({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio", hospitalAdminEmail: "mauricio@zelo-demo.local" }),
    ).rejects.toThrow(DuplicateInstitutionOrManagerError);
  });
});
