import { describe, expect, it } from "vitest";
import { CreatePeerPartnerUseCase } from "./create-peer-partner.use-case.ts";
import { EmailDeliveryError, type EmailPort, type EmailTemplate, type SendEmailParams } from "../../../../shared/email/email.port.ts";
import type {
  CreatePeerPartnerParams, PeerPartnerRepository, PeerPartnerRow, PeerPartnerSummaryRow
} from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  public created: Array<{ id: string; name: string; email: string }> = [];
  public lastCreateParams: CreatePeerPartnerParams | null = null;
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<PeerPartnerSummaryRow[]> {
    throw new Error("not used in this test");
  }
  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string; email: string }> {
    this.lastCreateParams = params;
    const peerPartner = { id: "peer-new", name: params.name, email: params.email };
    this.created.push(peerPartner);
    return peerPartner;
  }
  async update(): Promise<void> {
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
  const repository = new FakePeerPartnerRepository();
  const emailPort = new FakeEmailPort();
  const notifications = new FakeNotificationPublisher();
  const useCase = new CreatePeerPartnerUseCase(repository, emailPort, notifications);
  return { useCase, repository, emailPort, notifications };
}

describe("CreatePeerPartnerUseCase", () => {
  it("creates a peer partner with no password, generates a set-password token, and sends an invite email", async () => {
    const { useCase, repository, emailPort } = build();

    const result = await useCase.execute({ institutionId: "institution-1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Clínica médica" });

    expect(result.peerPartner).toEqual({ id: "peer-new", name: "Dra. Ana", email: "ana@zelo-demo.local" });
    expect(repository.lastCreateParams).toEqual({
      name: "Dra. Ana",
      email: "ana@zelo-demo.local",
      institutionId: "institution-1",
      specialty: "Clínica médica",
      setPasswordToken: expect.any(String),
      setPasswordTokenExpiresAt: expect.any(Date),
    });
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
    expect(emailPort.lastSend?.params.setPasswordUrl).toContain(repository.lastCreateParams!.setPasswordToken);
  });

  it("still creates the peer partner when the invite email cannot be sent, and says so", async () => {
    const { useCase, repository, notifications, emailPort } = build();
    emailPort.shouldThrow = new EmailDeliveryError("domain not verified");

    const result = await useCase.execute({ institutionId: "institution-1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Clínica médica" });

    expect(result.peerPartner.email).toBe("ana@zelo-demo.local");
    expect(repository.created).toHaveLength(1);
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
    expect(notifications.events[0]!.payload).toMatchObject({
      kind: "peer-partner",
      name: "Dra. Ana",
      email: "ana@zelo-demo.local",
    });
  });

  it("says nothing about email when the invite went out", async () => {
    const { useCase, notifications } = build();

    await useCase.execute({ institutionId: "institution-1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Clínica médica" });

    expect(notifications.events).toEqual([]);
  });

  it("still creates the peer partner when the invite email fails over the network, and says so", async () => {
    // A raw network rejection never reaches the use case directly — the real
    // ResendEmailAdapter normalizes it into EmailDeliveryError before it gets
    // here. This models that already-normalized failure.
    const { useCase, repository, notifications, emailPort } = build();
    emailPort.shouldThrow = new EmailDeliveryError("socket hang up");

    const result = await useCase.execute({ institutionId: "institution-1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Clínica médica" });

    expect(result.peerPartner.email).toBe("ana@zelo-demo.local");
    expect(repository.created).toHaveLength(1);
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("INVITE_EMAIL_FAILED");
  });

  it("does not swallow a non-delivery error from the email port", async () => {
    const { useCase, notifications, emailPort } = build();
    emailPort.shouldThrow = new TypeError("Cannot read properties of undefined (reading 'name')");

    await expect(
      useCase.execute({ institutionId: "institution-1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Clínica médica" }),
    ).rejects.toThrow(TypeError);

    expect(notifications.events).toEqual([]);
  });
});
