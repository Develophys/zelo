import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { PeerPartnerPasswordService } from "../../../peer-partner/application/services/peer-partner-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";

export interface ResetPeerPartnerPasswordInput {
  institutionId: string;
  peerPartnerId: string;
}

@Injectable()
export class ResetPeerPartnerPasswordUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
  ) {}

  async execute(input: ResetPeerPartnerPasswordInput): Promise<{ temporaryPassword: string }> {
    const peerPartner = await this.repository.findById(input.peerPartnerId);
    if (!peerPartner || peerPartner.institutionId !== input.institutionId) {
      throw new PeerPartnerNotFoundError();
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.repository.update(input.peerPartnerId, { passwordHash });

    return { temporaryPassword };
  }
}
