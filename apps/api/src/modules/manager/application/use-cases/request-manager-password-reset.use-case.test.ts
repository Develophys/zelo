import { describe, expect, it } from "vitest";
import { RequestManagerPasswordResetUseCase } from "./request-manager-password-reset.use-case.ts";
import { SendManagerSetPasswordEmailUseCase } from "./send-manager-set-password-email.use-case.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "@/shared/email/email.port.js";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByEmail(email: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => r.email === email) ?? null;
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
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

function build() {
  const repository = new FakeManagerRepository();
  const emailPort = new FakeEmailPort();
  const notifications = new FakeNotificationPublisher();
  const sendSetPasswordEmail = new SendManagerSetPasswordEmailUseCase(repository, emailPort, notifications);
  const useCase = new RequestManagerPasswordResetUseCase(repository, sendSetPasswordEmail);
  return { useCase, repository, emailPort };
}

describe("RequestManagerPasswordResetUseCase", () => {
  it("sends the set-password email to an active manager found by email", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];

    await useCase.execute("ana@zelo-demo.local");

    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("password-reset");
  });

  it("does nothing, without throwing, when no manager has that email", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [];

    await expect(useCase.execute("nobody@zelo-demo.local")).resolves.toBeUndefined();

    expect(emailPort.lastSend).toBeNull();
    expect(repository.lastUpdate).toBeNull();
  });

  it("does nothing for a deactivated manager, so a paused account can't be used to re-enter", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: false },
    ];

    await useCase.execute("ana@zelo-demo.local");

    expect(emailPort.lastSend).toBeNull();
    expect(repository.lastUpdate).toBeNull();
  });
});
