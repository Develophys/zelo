import { describe, expect, it } from "vitest";
import { FinishPeerPartnerSetupUseCase } from "./finish-peer-partner-setup.usecase";
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

class FakePeerPartnerAuthPort implements PeerPartnerAuthPort {
  public lastArgs: { token: string; password: string } | null = null;
  async login(): Promise<PeerPartnerLoginResult> {
    throw new Error("not used in this test");
  }
  async finishSetup(token: string, password: string): Promise<void> {
    this.lastArgs = { token, password };
  }
}

describe("FinishPeerPartnerSetupUseCase", () => {
  it("delegates to the port", async () => {
    const port = new FakePeerPartnerAuthPort();
    const useCase = new FinishPeerPartnerSetupUseCase(port);

    await useCase.execute("some-token", "new-password-123");

    expect(port.lastArgs).toEqual({ token: "some-token", password: "new-password-123" });
  });
});
