import { describe, expect, it } from "vitest";
import { DeletePeerPartnerUseCase } from "./delete-peer-partner.use-case.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "@/modules/peer-partner/application/ports/peer-partner-repository.port.js";

const PEER: PeerPartnerRow = {
  id: "peer-1",
  name: "Dra. Ana",
  email: "ana@zelo-demo.local",
  passwordHash: "hash",
  setPasswordTokenExpiresAt: null,
  institutionId: "institution-1",
  specialty: "Clínica médica",
  isActive: true,
};

function build(peer: PeerPartnerRow | null = PEER) {
  const deleted: string[] = [];
  const repository = {
    findById: async () => peer,
    delete: async (id: string) => {
      deleted.push(id);
    },
  } as unknown as PeerPartnerRepository;
  return { useCase: new DeletePeerPartnerUseCase(repository), deleted };
}

const input = { institutionId: "institution-1", peerPartnerId: "peer-1" };

describe("DeletePeerPartnerUseCase", () => {
  // Nothing in the schema references PeerPartner, so this delete has no
  // dependents to guard — the only check is that it is ours.
  it("deletes a peer partner", async () => {
    const { useCase, deleted } = build();
    await useCase.execute(input);
    expect(deleted).toEqual(["peer-1"]);
  });

  it("refuses a peer partner from another institution as not found", async () => {
    const { useCase, deleted } = build({ ...PEER, institutionId: "institution-2" });
    await expect(useCase.execute(input)).rejects.toThrow(PeerPartnerNotFoundError);
    expect(deleted).toEqual([]);
  });

  it("refuses an unknown peer partner", async () => {
    const { useCase } = build(null);
    await expect(useCase.execute(input)).rejects.toThrow(PeerPartnerNotFoundError);
  });
});
