import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginPeerPartnerUseCase, InvalidPeerPartnerCredentialsError } from "./login-peer-partner.use-case.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import { PeerPartnerTokenService } from "../services/peer-partner-token.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByEmail(email: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginPeerPartnerUseCase", () => {
  it("issues a token carrying the peer partner's institutionId when email and password match", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("ana@zelo-demo.local", "correct-password");

    expect(tokenService.verify(result.token)).toEqual({ peerPartnerId: "peer-1", peerPartnerName: "Dra. Ana", institutionId: "institution-1" });
  });

  it("throws InvalidPeerPartnerCredentialsError when the email is unknown", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const repository = new FakePeerPartnerRepository();
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("throws InvalidPeerPartnerCredentialsError when the password is wrong", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "wrong-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("throws InvalidPeerPartnerCredentialsError for a correct password on a deactivated peer partner", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: false }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "correct-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("throws InvalidPeerPartnerCredentialsError for a peer partner whose invite hasn't been completed yet", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "any-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("pays the same password-verification cost for an unknown email as for a known one", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const repository = new FakePeerPartnerRepository();
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
