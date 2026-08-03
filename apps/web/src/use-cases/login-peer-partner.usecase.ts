import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

export class LoginPeerPartnerUseCase {
  constructor(private readonly peerPartnerAuthPort: PeerPartnerAuthPort) {}

  async execute(name: string, password: string): Promise<PeerPartnerLoginResult> {
    return this.peerPartnerAuthPort.login(name, password);
  }
}
