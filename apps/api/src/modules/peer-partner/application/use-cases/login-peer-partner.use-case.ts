import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../ports/peer-partner-repository.port.ts";
import { INSTITUTION_REPOSITORY, type InstitutionRepository } from "@/modules/institution/application/ports/institution-repository.port.js";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import { PeerPartnerTokenService, type IssuedPeerPartnerToken } from "../services/peer-partner-token.service.ts";

export class InvalidPeerPartnerCredentialsError extends Error {}

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginPeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(INSTITUTION_REPOSITORY) private readonly institutionRepository: InstitutionRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
    @Inject(PeerPartnerTokenService) private readonly tokenService: PeerPartnerTokenService,
  ) {}

  async execute(email: string, password: string): Promise<IssuedPeerPartnerToken> {
    const peerPartner = await this.repository.findByEmail(email);

    const isValid = await this.passwordService.verify(password, peerPartner?.passwordHash ?? DUMMY_PASSWORD_HASH);
    const institution = peerPartner ? await this.institutionRepository.findById(peerPartner.institutionId) : null;
    if (!peerPartner || !peerPartner.passwordHash || !isValid || !peerPartner.isActive || !institution?.isActive) {
      throw new InvalidPeerPartnerCredentialsError();
    }

    return this.tokenService.issue(peerPartner.id, peerPartner.name, peerPartner.institutionId);
  }
}
