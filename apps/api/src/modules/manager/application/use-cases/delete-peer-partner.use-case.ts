import { Inject, Injectable } from "@nestjs/common";
import {
  PEER_PARTNER_REPOSITORY,
  type PeerPartnerRepository,
} from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";

export interface DeletePeerPartnerInput {
  institutionId: string;
  peerPartnerId: string;
}

@Injectable()
export class DeletePeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
  ) {}

  async execute(input: DeletePeerPartnerInput): Promise<void> {
    const peerPartner = await this.repository.findById(input.peerPartnerId);
    if (!peerPartner || peerPartner.institutionId !== input.institutionId) {
      throw new PeerPartnerNotFoundError();
    }

    await this.repository.delete(input.peerPartnerId);
  }
}
