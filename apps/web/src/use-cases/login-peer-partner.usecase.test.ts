import { describe, expect, it } from "vitest";
import { LoginPeerPartnerUseCase } from "./login-peer-partner.usecase";
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

class FakePeerPartnerAuthAdapter implements PeerPartnerAuthPort {
  constructor(private readonly result: PeerPartnerLoginResult) {}
  async login(): Promise<PeerPartnerLoginResult> {
    return this.result;
  }
}

describe("LoginPeerPartnerUseCase", () => {
  it("delegates to the port and returns its result", async () => {
    const port = new FakePeerPartnerAuthAdapter({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z" });
    const useCase = new LoginPeerPartnerUseCase(port);

    const result = await useCase.execute("Dra. Ana", "password");

    expect(result).toEqual({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z" });
  });
});
