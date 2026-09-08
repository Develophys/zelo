import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";
import { PeerPartnerLoginResultSchema, InvalidPeerPartnerCredentialsError, InvalidOrExpiredPeerPartnerSetupTokenError } from "@/ports/peer-partner-auth.port";
import { API_BASE_URL } from './api-base-url';


export class HttpPeerPartnerAuthAdapter implements PeerPartnerAuthPort {
  async login(email: string, password: string): Promise<PeerPartnerLoginResult> {
    const response = await fetch(`${API_BASE_URL}/peer-partner/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) {
      throw new InvalidPeerPartnerCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`peer partner login failed with status ${response.status}`);
    }

    return PeerPartnerLoginResultSchema.parse(await response.json());
  }

  async finishSetup(token: string, password: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/peer-partner/finish-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (response.status === 401) {
      throw new InvalidOrExpiredPeerPartnerSetupTokenError();
    }
    if (!response.ok) {
      throw new Error(`peer partner finish-setup failed with status ${response.status}`);
    }
  }
}
