import { describe, expect, it } from "vitest";
import { CreateManagerUseCase } from "./create-manager.use-case.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import { EmailDeliveryError, type EmailPort, type EmailTemplate, type SendEmailParams } from "../../../../shared/email/email.port.ts";
import type {
  CreateManagerParams, ManagerRepository, ManagerRow, ManagerSummaryRow
} from "../ports/manager-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public created: Array<{ id: string; name: string; email: string }> = [];
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
    const manager = { id: "manager-new", name: params.name, email: params.email };
    this.created.push(manager);
    return manager;
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
  public shouldThrow: Error | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    if (this.shouldThrow) {
      throw this.shouldThrow;
    }
    this.lastSend = { to, template, params };
  }
}

class FakeNotificationPublisher implements NotificationPublisher {
  public events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

function build() {
  const managerRepository = new FakeManagerRepository();
  const sectorRepository = new FakeSectorRepository();
  const emailPort = new FakeEmailPort();
  const notifications = new FakeNotificationPublisher();
  const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, emailPort, notifications);
  return { useCase, managerRepository, sectorRepository, emailPort, notifications };
}

describe("CreateManagerUseCase", () => {
  it("creates a HOSPITAL_ADMIN manager with no password, generates a set-password token, and sends an invite email", async () => {
    const { useCase, managerRepository, sectorRepository, emailPort } = build();

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
    const { useCase, sectorRepository } = build();
    sectorRepository.knownSectorIds = new Set(["sector-a", "sector-b"]);

    await useCase.execute({ institutionId: "institution-1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-b"] });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-new", sectorIds: ["sector-a", "sector-b"] });
  });

  it("throws SectorNotInInstitutionError when a sectorId doesn't belong to the institution", async () => {
    const { useCase, sectorRepository } = build();
    sectorRepository.knownSectorIds = new Set(["sector-a"]);

    await expect(
      useCase.execute({ institutionId: "institution-1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-unknown"] }),
    ).rejects.toThrow(SectorNotInInstitutionError);
  });

  it("still creates the manager when the invite email cannot be sent, and says so", async () => {
    const { useCase, managerRepository, notifications, emailPort } = build();
    emailPort.shouldThrow = new EmailDeliveryError("domain not verified");

    const result = await useCase.execute({
      name: "Paulo",
      email: "paulo@zelo-demo.local",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
      sectorIds: [],
    });

    expect(result.manager.email).toBe("paulo@zelo-demo.local");
    expect(managerRepository.created).toHaveLength(1);
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
    expect(notifications.events[0]!.payload).toMatchObject({
      kind: "manager",
      name: "Paulo",
      email: "paulo@zelo-demo.local",
    });
  });

  it("says nothing about email when the invite went out", async () => {
    const { useCase, notifications } = build();

    await useCase.execute({
      name: "Paulo",
      email: "paulo@zelo-demo.local",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
      sectorIds: [],
    });

    expect(notifications.events).toEqual([]);
  });

  it("still creates the manager when the invite email fails over the network, and says so", async () => {
    // A raw network rejection never reaches the use case directly — the real
    // ResendEmailAdapter normalizes it into EmailDeliveryError before it gets
    // here. This models that already-normalized failure.
    const { useCase, managerRepository, notifications, emailPort } = build();
    emailPort.shouldThrow = new EmailDeliveryError("socket hang up");

    const result = await useCase.execute({
      name: "Paulo",
      email: "paulo@zelo-demo.local",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
      sectorIds: [],
    });

    expect(result.manager.email).toBe("paulo@zelo-demo.local");
    expect(managerRepository.created).toHaveLength(1);
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
  });

  it("does not swallow a non-delivery error from the email port", async () => {
    const { useCase, notifications, emailPort } = build();
    emailPort.shouldThrow = new TypeError("Cannot read properties of undefined (reading 'name')");

    await expect(
      useCase.execute({
        name: "Paulo",
        email: "paulo@zelo-demo.local",
        institutionId: "institution-1",
        role: "HOSPITAL_ADMIN",
        sectorIds: [],
      }),
    ).rejects.toThrow(TypeError);

    expect(notifications.events).toEqual([]);
  });
});
