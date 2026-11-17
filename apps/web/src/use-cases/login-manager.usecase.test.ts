import { describe, expect, it } from "vitest";
import { LoginManagerUseCase } from "./login-manager.usecase";
import type { ManagerAuthPort, ManagerLoginResult, ManagerProfile } from "@/ports/manager-auth.port";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";

class FakeManagerAuthPort implements ManagerAuthPort {
  public lastArgs: { name: string; password: string } | null = null;
  constructor(private readonly result: ManagerLoginResult | Error) {}
  async login(name: string, password: string): Promise<ManagerLoginResult> {
    this.lastArgs = { name, password };
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
  async me(): Promise<ManagerProfile> {
    throw new Error("not used in this test");
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

describe("LoginManagerUseCase", () => {
  it("returns the role and name on success, forwarding name and password", async () => {
    const authPort = new FakeManagerAuthPort({ role: "HOSPITAL_ADMIN", name: "Ana Konder" });
    const useCase = new LoginManagerUseCase(authPort);

    const result = await useCase.execute("Ana Konder", "senha-correta");

    expect(result).toEqual({ role: "HOSPITAL_ADMIN", name: "Ana Konder" });
    expect(authPort.lastArgs).toEqual({ name: "Ana Konder", password: "senha-correta" });
  });

  it("propagates InvalidManagerCredentialsError on a wrong name or password", async () => {
    const useCase = new LoginManagerUseCase(new FakeManagerAuthPort(new InvalidManagerCredentialsError()));

    await expect(useCase.execute("Ana Konder", "wrong")).rejects.toBeInstanceOf(InvalidManagerCredentialsError);
  });
});
