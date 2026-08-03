import { describe, expect, it } from "vitest";
import { ResetPeerPartnerPasswordUseCase } from "./reset-peer-partner-password.use-case.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";
import { PeerPartnerPasswordService } from "../../../peer-partner/application/services/peer-partner-password.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow, UpdatePeerPartnerParams } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  lastUpdate: { id: string; patch: UpdatePeerPartnerParams } | null = null;
  async findByName(): Promise<PeerPartnerRow | null> {
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

describe("ResetPeerPartnerPasswordUseCase", () => {
  it("throws PeerPartnerNotFoundError when the peer partner doesn't belong to the given institution", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "hash", institutionId: "institution-other", specialty: "Clínica médica", isActive: true }];
    const useCase = new ResetPeerPartnerPasswordUseCase(repository, new PeerPartnerPasswordService());

    await expect(useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" })).rejects.toThrow(PeerPartnerNotFoundError);
  });

  it("generates and hashes a new temporary password", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "old-hash", institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const passwordService = new PeerPartnerPasswordService();
    const useCase = new ResetPeerPartnerPasswordUseCase(repository, passwordService);

    const result = await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(result.temporaryPassword).toEqual(expect.any(String));
    const newHash = repository.lastUpdate!.patch.passwordHash!;
    expect(await passwordService.verify(result.temporaryPassword, newHash)).toBe(true);
  });
});
