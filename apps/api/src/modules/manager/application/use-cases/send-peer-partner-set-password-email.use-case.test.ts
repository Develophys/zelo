import { describe, expect, it } from "vitest";
import { SendPeerPartnerSetPasswordEmailUseCase } from "./send-peer-partner-set-password-email.use-case.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import type { PeerPartnerRepository, PeerPartnerRow, UpdatePeerPartnerParams } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";

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
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("SendPeerPartnerSetPasswordEmailUseCase", () => {
  it("throws PeerPartnerNotFoundError when the peer partner doesn't belong to the given institution", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-other", specialty: "Clínica médica", isActive: true }];
    const useCase = new SendPeerPartnerSetPasswordEmailUseCase(repository, new FakeEmailPort());

    await expect(useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" })).rejects.toThrow(PeerPartnerNotFoundError);
  });

  it("sends the invite-flavored email when the peer partner has no password yet", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const emailPort = new FakeEmailPort();
    const useCase = new SendPeerPartnerSetPasswordEmailUseCase(repository, emailPort);

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });

  it("sends the password-reset-flavored email when the peer partner already has a password", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: "existing-hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const emailPort = new FakeEmailPort();
    const useCase = new SendPeerPartnerSetPasswordEmailUseCase(repository, emailPort);

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(emailPort.lastSend?.template).toBe("password-reset");
  });
});
