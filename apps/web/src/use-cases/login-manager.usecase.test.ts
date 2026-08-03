import { describe, expect, it } from "vitest";
import { LoginManagerUseCase } from "./login-manager.usecase";
import type { ManagerAuthPort, ManagerLoginResult } from "@/ports/manager-auth.port";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";

class FakeManagerAuthPort implements ManagerAuthPort {
  public lastArgs: { name: string; password: string } | null = null;
  constructor(private readonly result: ManagerLoginResult | Error) {}
  async login(name: string, password: string): Promise<ManagerLoginResult> {
    this.lastArgs = { name, password };
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("LoginManagerUseCase", () => {
  it("returns the token and expiry on success, forwarding name and password", async () => {
    const authPort = new FakeManagerAuthPort({ token: "abc.def", expiresAt: "2026-07-11T20:00:00.000Z", role: "HOSPITAL_ADMIN" });
    const useCase = new LoginManagerUseCase(authPort);

    const result = await useCase.execute("Ana Konder", "senha-correta");

    expect(result).toEqual({ token: "abc.def", expiresAt: "2026-07-11T20:00:00.000Z", role: "HOSPITAL_ADMIN" });
    expect(authPort.lastArgs).toEqual({ name: "Ana Konder", password: "senha-correta" });
  });

  it("propagates InvalidManagerCredentialsError on a wrong name or password", async () => {
    const useCase = new LoginManagerUseCase(new FakeManagerAuthPort(new InvalidManagerCredentialsError()));

    await expect(useCase.execute("Ana Konder", "wrong")).rejects.toBeInstanceOf(InvalidManagerCredentialsError);
  });
});
