import { describe, expect, it } from "vitest";
import { CreatePeerPartnerUseCase } from "./create-peer-partner.use-case.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import type {
  CreatePeerPartnerParams, PeerPartnerRepository, PeerPartnerRow, PeerPartnerSummaryRow
} from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
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
    return { id: "peer-new", name: params.name, email: params.email };
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("CreatePeerPartnerUseCase", () => {
  it("creates a peer partner with no password, generates a set-password token, and sends an invite email", async () => {
    const repository = new FakePeerPartnerRepository();
    const emailPort = new FakeEmailPort();
    const useCase = new CreatePeerPartnerUseCase(repository, emailPort);

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
});
