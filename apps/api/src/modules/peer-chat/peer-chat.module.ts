import { Module } from "@nestjs/common";
import { PeerChatGateway } from "./infrastructure/peer-chat.gateway.ts";
import { PeerPresenceService } from "./application/services/peer-presence.service.ts";
import { PeerMatchRegistry } from "./application/services/peer-match-registry.service.ts";
import { PeerPartnerModule } from "../peer-partner/peer-partner.module.ts";

@Module({
  imports: [PeerPartnerModule],
  providers: [PeerChatGateway, PeerPresenceService, PeerMatchRegistry],
  exports: [PeerChatGateway],
})
export class PeerChatModule {}
