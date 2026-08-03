import type { PeerPartnerAuthPort } from "@/ports/peer-partner-auth.port";

export class FinishPeerPartnerSetupUseCase {
  constructor(private readonly peerPartnerAuthPort: PeerPartnerAuthPort) {}

  async execute(token: string, password: string): Promise<void> {
    return this.peerPartnerAuthPort.finishSetup(token, password);
  }
}
