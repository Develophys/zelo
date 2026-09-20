import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../application/ports/peer-partner-repository.port.ts";
import { readSessionToken } from "@/shared/http/session-cookie.js";

@Injectable()
export class PeerPartnerAuthGuard implements CanActivate {
  constructor(
    @Inject(PeerPartnerTokenService) private readonly tokenService: PeerPartnerTokenService,
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionToken(request, "peerPartner");
    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    const peerPartner = await this.peerPartnerRepository.findById(decoded.peerPartnerId);
    if (!peerPartner || !peerPartner.isActive) {
      throw new UnauthorizedException();
    }

    request.peerPartner = {
      id: peerPartner.id,
      name: peerPartner.name,
      institutionId: peerPartner.institutionId,
      specialty: peerPartner.specialty,
    };
    return true;
  }
}
