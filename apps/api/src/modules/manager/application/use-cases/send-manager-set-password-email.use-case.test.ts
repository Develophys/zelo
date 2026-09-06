import { describe, expect, it } from "vitest";
import { SendManagerSetPasswordEmailUseCase } from "./send-manager-set-password-email.use-case.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";
import { EmailDeliveryError, type EmailPort, type EmailTemplate, type SendEmailParams } from "@/shared/email/email.port.js";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

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
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

class FakeEmailPort implements EmailPort {
  lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  shouldThrow: Error | null = null;
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
  const repository = new FakeManagerRepository();
  const emailPort = new FakeEmailPort();
  const notifications = new FakeNotificationPublisher();
  const useCase = new SendManagerSetPasswordEmailUseCase(repository, emailPort, notifications);
  return { useCase, repository, emailPort, notifications };
}

describe("SendManagerSetPasswordEmailUseCase", () => {
  it("throws ManagerNotFoundError when the manager doesn't belong to the given institution", async () => {
    const { useCase, repository } = build();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-other", role: "HOSPITAL_ADMIN", isActive: true }];

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1" })).rejects.toThrow(ManagerNotFoundError);
  });

  it("sends the invite-flavored email and a fresh token when the manager has no password yet", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(repository.lastUpdate?.id).toBe("manager-1");
    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(repository.lastUpdate?.patch.setPasswordTokenExpiresAt).toBeInstanceOf(Date);
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");

    // The URL carries the raw token; the repository only ever sees its hash.
    const rawToken = emailPort.lastSend!.params.setPasswordUrl.split("/").pop()!;
    expect(repository.lastUpdate!.patch.setPasswordToken).toBe(hashSetPasswordToken(rawToken));
    expect(repository.lastUpdate!.patch.setPasswordToken).not.toBe(rawToken);
  });

  it("sends the password-reset-flavored email when the manager already has a password", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: "existing-hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(emailPort.lastSend?.template).toBe("password-reset");
  });

  it("still rotates the token when the invite email cannot be sent, and says so", async () => {
    const { useCase, repository, notifications, emailPort } = build();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];
    emailPort.shouldThrow = new EmailDeliveryError("domain not verified");

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
    expect(notifications.events[0]!.payload).toMatchObject({
      kind: "manager",
      id: "manager-1",
      name: "Ana Konder",
      email: "ana@zelo-demo.local",
    });
  });

  it("says nothing about email when the invite went out", async () => {
    const { useCase, repository, notifications } = build();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(notifications.events).toEqual([]);
  });

  it("still rotates the token when the invite email fails over the network, and says so", async () => {
    // A raw network rejection never reaches the use case directly — the real
    // ResendEmailAdapter normalizes it into EmailDeliveryError before it gets
    // here. This models that already-normalized failure.
    const { useCase, repository, notifications, emailPort } = build();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];
    emailPort.shouldThrow = new EmailDeliveryError("socket hang up");

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
  });

  it("does not swallow a non-delivery error from the email port", async () => {
    const { useCase, repository, notifications, emailPort } = build();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];
    emailPort.shouldThrow = new TypeError("Cannot read properties of undefined (reading 'name')");

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1" })).rejects.toThrow(TypeError);

    expect(notifications.events).toEqual([]);
  });
});
