import { describe, expect, it } from "vitest";
import { GetManagerSessionUseCase } from "./get-manager-session.usecase";
import type { ManagerAuthPort, ManagerLoginResult, ManagerProfile } from "@/ports/manager-auth.port";

class FakeManagerAuthPort implements ManagerAuthPort {
  public meCalls = 0;
  constructor(private readonly profile: ManagerProfile) {}
  async login(): Promise<ManagerLoginResult> {
    throw new Error("not used in this test");
  }
  async me(): Promise<ManagerProfile> {
    this.meCalls += 1;
    return this.profile;
  }
  async logout(): Promise<void> {
    throw new Error("not used in this test");
  }
  async finishSetup(): Promise<void> {
    throw new Error("not used in this test");
  }
  async requestPasswordReset(): Promise<void> {
    throw new Error("not used in this test");
  }
}

describe("GetManagerSessionUseCase", () => {
  it("delegates to the port's me() once and returns the profile", async () => {
    const authPort = new FakeManagerAuthPort({ name: "Ana", role: "HOSPITAL_ADMIN" });
    const useCase = new GetManagerSessionUseCase(authPort);

    const result = await useCase.execute();

    expect(result).toEqual({ name: "Ana", role: "HOSPITAL_ADMIN" });
    expect(authPort.meCalls).toBe(1);
  });
});
