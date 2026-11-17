import { describe, expect, it } from "vitest";
import { LogoutManagerUseCase } from "./logout-manager.usecase";
import type { ManagerAuthPort, ManagerLoginResult, ManagerProfile } from "@/ports/manager-auth.port";

class FakeManagerAuthPort implements ManagerAuthPort {
  public logoutCalls = 0;
  async login(): Promise<ManagerLoginResult> {
    throw new Error("not used in this test");
  }
  async me(): Promise<ManagerProfile> {
    throw new Error("not used in this test");
  }
  async logout(): Promise<void> {
    this.logoutCalls += 1;
  }
  async finishSetup(): Promise<void> {
    throw new Error("not used in this test");
  }
  async requestPasswordReset(): Promise<void> {
    throw new Error("not used in this test");
  }
}

describe("LogoutManagerUseCase", () => {
  it("delegates to the port's logout() once and resolves", async () => {
    const authPort = new FakeManagerAuthPort();
    const useCase = new LogoutManagerUseCase(authPort);

    await expect(useCase.execute()).resolves.toBeUndefined();

    expect(authPort.logoutCalls).toBe(1);
  });

  it("propagates a failure from the port so the caller can decide what to do", async () => {
    const authPort = new FakeManagerAuthPort();
    authPort.logout = async () => {
      throw new Error("network down");
    };
    const useCase = new LogoutManagerUseCase(authPort);

    await expect(useCase.execute()).rejects.toThrow("network down");
  });
});
