import { describe, expect, it } from "vitest";
import { CreatePeerPartnerUseCase } from "./create-peer-partner.use-case.ts";
import { PeerPartnerPasswordService } from "@/modules/peer-partner/application/services/peer-partner-password.service.ts";
import type {
  CreatePeerPartnerParams, PeerPartnerRepository, PeerPartnerRow, PeerPartnerSummaryRow
} from "@/modules/peer-partner/application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  public lastCreateParams: CreatePeerPartnerParams | null = null;
  async findByName(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<PeerPartnerSummaryRow[]> {
    throw new Error("not used in this test");
  }
  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string }> {
    this.lastCreateParams = params;
    return { id: "peer-new", name: params.name };
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
}

describe("CreatePeerPartnerUseCase", () => {
  it("hashes a generated temporary password and returns it alongside the created row", async () => {
    const repository = new FakePeerPartnerRepository();
    const passwordService = new PeerPartnerPasswordService();
    const useCase = new CreatePeerPartnerUseCase(repository, passwordService);

    const result = await useCase.execute({ institutionId: "institution-1", name: "Dra. Ana", specialty: "Clínica médica" });

    expect(result.peerPartner).toEqual({ id: "peer-new", name: "Dra. Ana" });
    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(repository.lastCreateParams).toEqual({
      name: "Dra. Ana",
      passwordHash: expect.any(String),
      institutionId: "institution-1",
      specialty: "Clínica médica",
    });

    const isValid = await passwordService.verify(result.temporaryPassword, repository.lastCreateParams!.passwordHash);
    expect(isValid).toBe(true);
  });
});
