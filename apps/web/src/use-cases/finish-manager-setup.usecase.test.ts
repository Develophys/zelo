import { describe, expect, it } from "vitest";
import { FinishManagerSetupUseCase } from "./finish-manager-setup.usecase";
import type { ManagerAuthPort, ManagerLoginResult } from "@/ports/manager-auth.port";

class FakeManagerAuthPort implements ManagerAuthPort {
  public lastArgs: { token: string; password: string } | null = null;
  async login(): Promise<ManagerLoginResult> {
    throw new Error("not used in this test");
  }
  async finishSetup(token: string, password: string): Promise<void> {
    this.lastArgs = { token, password };
  }
}

describe("FinishManagerSetupUseCase", () => {
  it("delegates to the port", async () => {
    const port = new FakeManagerAuthPort();
    const useCase = new FinishManagerSetupUseCase(port);

    await useCase.execute("some-token", "new-password-123");

    expect(port.lastArgs).toEqual({ token: "some-token", password: "new-password-123" });
  });
});
