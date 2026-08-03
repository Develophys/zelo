import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";

declare global {
  namespace Express {
    interface Request {
      peerPartner?: { id: string; name: string; institutionId: string };
    }
  }
}

@Injectable()
export class PeerPartnerAuthGuard implements CanActivate {
  constructor(@Inject(PeerPartnerTokenService) private readonly tokenService: PeerPartnerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    request.peerPartner = { id: decoded.peerPartnerId, name: decoded.peerPartnerName, institutionId: decoded.institutionId };
    return true;
  }
}
