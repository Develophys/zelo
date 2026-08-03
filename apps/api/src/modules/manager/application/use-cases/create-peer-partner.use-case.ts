import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { PeerPartnerPasswordService } from "../../../peer-partner/application/services/peer-partner-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";

export interface CreatePeerPartnerInput {
  institutionId: string;
  name: string;
  specialty: string;
}

export interface CreatePeerPartnerResult {
  peerPartner: { id: string; name: string };
  temporaryPassword: string;
}

@Injectable()
export class CreatePeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
  ) {}

  async execute(input: CreatePeerPartnerInput): Promise<CreatePeerPartnerResult> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);

    const peerPartner = await this.repository.create({
      name: input.name,
      passwordHash,
      institutionId: input.institutionId,
      specialty: input.specialty,
    });

    return { peerPartner, temporaryPassword };
  }
}
