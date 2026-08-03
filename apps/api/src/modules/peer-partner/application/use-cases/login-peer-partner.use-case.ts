import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../ports/peer-partner-repository.port.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import { PeerPartnerTokenService, type IssuedPeerPartnerToken } from "../services/peer-partner-token.service.ts";

export class InvalidPeerPartnerCredentialsError extends Error {}

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginPeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
    @Inject(PeerPartnerTokenService) private readonly tokenService: PeerPartnerTokenService,
  ) {}

  async execute(name: string, password: string): Promise<IssuedPeerPartnerToken> {
    const peerPartner = await this.repository.findByName(name);

    const isValid = await this.passwordService.verify(password, peerPartner?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!peerPartner || !isValid || !peerPartner.isActive) {
      throw new InvalidPeerPartnerCredentialsError();
    }

    return this.tokenService.issue(peerPartner.id, peerPartner.name, peerPartner.institutionId);
  }
}
