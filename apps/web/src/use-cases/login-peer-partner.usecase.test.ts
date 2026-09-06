import { describe, expect, it } from "vitest";
import { LoginPeerPartnerUseCase } from "./login-peer-partner.usecase";
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

class FakePeerPartnerAuthAdapter implements PeerPartnerAuthPort {
  constructor(private readonly result: PeerPartnerLoginResult) {}
  async login(): Promise<PeerPartnerLoginResult> {
    return this.result;
  }
  async finishSetup(): Promise<void> {
    throw new Error("not used in this test");
  }
}

describe("LoginPeerPartnerUseCase", () => {
  it("delegates to the port and returns its result", async () => {
    const port = new FakePeerPartnerAuthAdapter({
      token: "t",
      expiresAt: "2026-01-01T00:00:00.000Z",
      peerPartnerName: "Dra. Ana",
    });
    const useCase = new LoginPeerPartnerUseCase(port);

    const result = await useCase.execute("ana@zelo-demo.local", "password");

    expect(result).toEqual({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z", peerPartnerName: "Dra. Ana" });
  });
});
