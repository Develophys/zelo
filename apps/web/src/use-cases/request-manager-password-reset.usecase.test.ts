import { describe, expect, it } from "vitest";
import { RequestManagerPasswordResetUseCase } from "./request-manager-password-reset.usecase";
import type { ManagerAuthPort, ManagerLoginResult } from "@/ports/manager-auth.port";

class FakeManagerAuthPort implements ManagerAuthPort {
  public lastEmail: string | null = null;
  async login(): Promise<ManagerLoginResult> {
    throw new Error("not used in this test");
  }
  async finishSetup(): Promise<void> {
    throw new Error("not used in this test");
  }
  async requestPasswordReset(email: string): Promise<void> {
    this.lastEmail = email;
  }
}

describe("RequestManagerPasswordResetUseCase", () => {
  it("delegates to the port", async () => {
    const port = new FakeManagerAuthPort();
    const useCase = new RequestManagerPasswordResetUseCase(port);

    await useCase.execute("ana@zelo-demo.local");

    expect(port.lastEmail).toBe("ana@zelo-demo.local");
  });
});
