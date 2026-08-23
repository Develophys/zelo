import { describe, expect, it } from "vitest";
import { SendManagerSetPasswordEmailUseCase } from "./send-manager-set-password-email.use-case.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
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
  async findActiveHospitalAdminIds(): Promise<never> {
    throw new Error("not used in this test");
  }
}

class FakeEmailPort implements EmailPort {
  lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("SendManagerSetPasswordEmailUseCase", () => {
  it("throws ManagerNotFoundError when the manager doesn't belong to the given institution", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-other", role: "HOSPITAL_ADMIN", isActive: true }];
    const useCase = new SendManagerSetPasswordEmailUseCase(repository, new FakeEmailPort());

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1" })).rejects.toThrow(ManagerNotFoundError);
  });

  it("sends the invite-flavored email and a fresh token when the manager has no password yet", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];
    const emailPort = new FakeEmailPort();
    const useCase = new SendManagerSetPasswordEmailUseCase(repository, emailPort);

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(repository.lastUpdate?.id).toBe("manager-1");
    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(repository.lastUpdate?.patch.setPasswordTokenExpiresAt).toBeInstanceOf(Date);
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
    expect(emailPort.lastSend?.params.setPasswordUrl).toContain(repository.lastUpdate!.patch.setPasswordToken);
  });

  it("sends the password-reset-flavored email when the manager already has a password", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: "existing-hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];
    const emailPort = new FakeEmailPort();
    const useCase = new SendManagerSetPasswordEmailUseCase(repository, emailPort);

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(emailPort.lastSend?.template).toBe("password-reset");
  });
});
