import { describe, expect, it } from "vitest";
import { RequestPeerPartnerPasswordResetUseCase } from "./request-peer-partner-password-reset.usecase";
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

class FakePeerPartnerAuthPort implements PeerPartnerAuthPort {
  public lastEmail: string | null = null;
  async login(): Promise<PeerPartnerLoginResult> {
    throw new Error("not used in this test");
  }
  async finishSetup(): Promise<void> {
    throw new Error("not used in this test");
  }
  async requestPasswordReset(email: string): Promise<void> {
    this.lastEmail = email;
  }
}

describe("RequestPeerPartnerPasswordResetUseCase", () => {
  it("delegates to the port", async () => {
    const port = new FakePeerPartnerAuthPort();
    const useCase = new RequestPeerPartnerPasswordResetUseCase(port);

    await useCase.execute("bia@zelo-demo.local");

    expect(port.lastEmail).toBe("bia@zelo-demo.local");
  });
});
