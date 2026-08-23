import { describe, expect, it } from "vitest";
import { SendPeerPartnerSetPasswordEmailUseCase } from "./send-peer-partner-set-password-email.use-case.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";
import { EmailDeliveryError, type EmailPort, type EmailTemplate, type SendEmailParams } from "../../../../shared/email/email.port.ts";
import type { PeerPartnerRepository, PeerPartnerRow, UpdatePeerPartnerParams } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  lastUpdate: { id: string; patch: UpdatePeerPartnerParams } | null = null;
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
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
  const repository = new FakePeerPartnerRepository();
  const emailPort = new FakeEmailPort();
  const notifications = new FakeNotificationPublisher();
  const useCase = new SendPeerPartnerSetPasswordEmailUseCase(repository, emailPort, notifications);
  return { useCase, repository, emailPort, notifications };
}

describe("SendPeerPartnerSetPasswordEmailUseCase", () => {
  it("throws PeerPartnerNotFoundError when the peer partner doesn't belong to the given institution", async () => {
    const { useCase, repository } = build();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-other", specialty: "Clínica médica", isActive: true }];

    await expect(useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" })).rejects.toThrow(PeerPartnerNotFoundError);
  });

  it("sends the invite-flavored email when the peer partner has no password yet", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });

  it("sends the password-reset-flavored email when the peer partner already has a password", async () => {
    const { useCase, repository, emailPort } = build();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: "existing-hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(emailPort.lastSend?.template).toBe("password-reset");
  });

  it("still rotates the token when the invite email cannot be sent, and says so", async () => {
    const { useCase, repository, notifications, emailPort } = build();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    emailPort.shouldThrow = new EmailDeliveryError("domain not verified");

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
    expect(notifications.events[0]!.payload).toMatchObject({
      kind: "peer-partner",
      name: "Dra. Ana",
      email: "ana@zelo-demo.local",
    });
  });

  it("says nothing about email when the invite went out", async () => {
    const { useCase, repository, notifications } = build();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(notifications.events).toEqual([]);
  });

  it("still rotates the token when the invite email fails over the network, and says so", async () => {
    // A raw network rejection never reaches the use case directly — the real
    // ResendEmailAdapter normalizes it into EmailDeliveryError before it gets
    // here. This models that already-normalized failure.
    const { useCase, repository, notifications, emailPort } = build();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    emailPort.shouldThrow = new EmailDeliveryError("socket hang up");

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
  });

  it("does not swallow a non-delivery error from the email port", async () => {
    const { useCase, repository, notifications, emailPort } = build();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    emailPort.shouldThrow = new TypeError("Cannot read properties of undefined (reading 'name')");

    await expect(useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" })).rejects.toThrow(TypeError);

    expect(notifications.events).toEqual([]);
  });
});
