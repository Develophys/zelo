import { describe, expect, it } from "vitest";
import { RequestPeerPartnerPasswordResetUseCase } from "./request-peer-partner-password-reset.use-case.ts";
import { EmailDeliveryError, type EmailPort, type EmailTemplate, type SendEmailParams } from "@/shared/email/email.port.js";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";
import type { PeerPartnerRepository, PeerPartnerRow, UpdatePeerPartnerParams } from "../ports/peer-partner-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  lastUpdate: { id: string; patch: UpdatePeerPartnerParams } | null = null;
  async findByEmail(email: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => r.email === email) ?? null;
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    this.lastUpdate = { id, patch };
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
    if (this.shouldThrow) throw this.shouldThrow;
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
  const repository = new FakePeerPartnerRepository();
  const emailPort = new FakeEmailPort();
  const notifications = new FakeNotificationPublisher();
  const useCase = new RequestPeerPartnerPasswordResetUseCase(repository, emailPort, notifications);
  return { useCase, repository, emailPort, notifications };
}

describe("RequestPeerPartnerPasswordResetUseCase", () => {
  it("rotates the token and sends the password-reset email to an active peer partner found by email", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [
      { id: "peer-1", name: "Bia", email: "bia@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true },
    ];

    await useCase.execute("bia@zelo-demo.local");

    expect(emailPort.lastSend?.to).toBe("bia@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("password-reset");
    const rawToken = emailPort.lastSend!.params.setPasswordUrl.split("/").pop()!;
    expect(repository.lastUpdate!.patch.setPasswordToken).toBe(hashSetPasswordToken(rawToken));
  });

  it("sends the invite-flavored email when the peer partner has no password yet", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [
      { id: "peer-1", name: "Bia", email: "bia@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true },
    ];

    await useCase.execute("bia@zelo-demo.local");

    expect(emailPort.lastSend?.template).toBe("invite");
  });

  it("does nothing, without throwing, when no peer partner has that email", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [];

    await expect(useCase.execute("nobody@zelo-demo.local")).resolves.toBeUndefined();

    expect(emailPort.lastSend).toBeNull();
    expect(repository.lastUpdate).toBeNull();
  });

  it("does nothing for a deactivated peer partner", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [
      { id: "peer-1", name: "Bia", email: "bia@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: false },
    ];

    await useCase.execute("bia@zelo-demo.local");

    expect(emailPort.lastSend).toBeNull();
  });

  it("still rotates the token when the email fails to send, and records why", async () => {
    const { useCase, repository, notifications, emailPort } = build();
    repository.rows = [
      { id: "peer-1", name: "Bia", email: "bia@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true },
    ];
    emailPort.shouldThrow = new EmailDeliveryError("domain not verified");

    await useCase.execute("bia@zelo-demo.local");

    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
  });
});
