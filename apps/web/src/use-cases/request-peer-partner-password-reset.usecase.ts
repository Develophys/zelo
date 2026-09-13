import type { PeerPartnerAuthPort } from "@/ports/peer-partner-auth.port";

export class RequestPeerPartnerPasswordResetUseCase {
  constructor(private readonly authPort: PeerPartnerAuthPort) {}

  async execute(email: string): Promise<void> {
    return this.authPort.requestPasswordReset(email);
  }
}
