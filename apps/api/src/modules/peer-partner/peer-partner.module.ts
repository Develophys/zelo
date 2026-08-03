import { Module } from "@nestjs/common";
import { PeerPartnerController } from "./infrastructure/peer-partner.controller.ts";
import { PeerPartnerAuthGuard } from "./infrastructure/peer-partner-auth.guard.ts";
import { PrismaPeerPartnerRepository } from "./infrastructure/persistence/prisma-peer-partner.repository.ts";
import { LoginPeerPartnerUseCase } from "./application/use-cases/login-peer-partner.use-case.ts";
import { PeerPartnerTokenService } from "./application/services/peer-partner-token.service.ts";
import { PeerPartnerPasswordService } from "./application/services/peer-partner-password.service.ts";
import { PEER_PARTNER_REPOSITORY } from "./application/ports/peer-partner-repository.port.ts";
import { EmailModule } from "../../shared/email/email.module.ts";

@Module({
  imports: [EmailModule],
  controllers: [PeerPartnerController],
  providers: [
    LoginPeerPartnerUseCase,
    PeerPartnerTokenService,
    PeerPartnerPasswordService,
    PeerPartnerAuthGuard,
    { provide: PEER_PARTNER_REPOSITORY, useClass: PrismaPeerPartnerRepository },
  ],
  exports: [PEER_PARTNER_REPOSITORY, PeerPartnerTokenService, PeerPartnerAuthGuard, PeerPartnerPasswordService],
})
export class PeerPartnerModule {}
