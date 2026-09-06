import { describe, expect, it } from "vitest";
import { FinishPeerPartnerSetupUseCase, InvalidOrExpiredPeerPartnerSetupTokenError } from "./finish-peer-partner-setup.use-case.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow, UpdatePeerPartnerParams } from "../ports/peer-partner-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  lastUpdate: { id: string; patch: UpdatePeerPartnerParams } | null = null;
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(token: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => (r as unknown as { setPasswordToken?: string }).setPasswordToken === token) ?? null;
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
  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    this.lastUpdate = { id, patch };
  }
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

describe("FinishPeerPartnerSetupUseCase", () => {
  it("throws InvalidOrExpiredPeerPartnerSetupTokenError when no peer partner has this token", async () => {
    const repository = new FakePeerPartnerRepository();
    const useCase = new FinishPeerPartnerSetupUseCase(repository, new PeerPartnerPasswordService(), new FakeNotificationPublisher());

    await expect(useCase.execute({ token: "unknown-token", password: "new-password-123" })).rejects.toThrow(InvalidOrExpiredPeerPartnerSetupTokenError);
  });

  it("throws InvalidOrExpiredPeerPartnerSetupTokenError when the token has expired", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [
      Object.assign(
        { id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() - 1000), institutionId: "institution-1", specialty: "Clínica médica", isActive: true } as PeerPartnerRow,
        { setPasswordToken: hashSetPasswordToken("abc123") },
      ),
    ];
    const useCase = new FinishPeerPartnerSetupUseCase(repository, new PeerPartnerPasswordService(), new FakeNotificationPublisher());

    await expect(useCase.execute({ token: "abc123", password: "new-password-123" })).rejects.toThrow(InvalidOrExpiredPeerPartnerSetupTokenError);
  });

  it("hashes and sets the new password, then clears the token", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [
      Object.assign(
        { id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", specialty: "Clínica médica", isActive: true } as PeerPartnerRow,
        { setPasswordToken: hashSetPasswordToken("abc123") },
      ),
    ];
    const passwordService = new PeerPartnerPasswordService();
    const useCase = new FinishPeerPartnerSetupUseCase(repository, passwordService, new FakeNotificationPublisher());

    await useCase.execute({ token: "abc123", password: "new-password-123" });

    expect(repository.lastUpdate?.id).toBe("peer-1");
    expect(repository.lastUpdate?.patch.setPasswordToken).toBeNull();
    expect(repository.lastUpdate?.patch.setPasswordTokenExpiresAt).toBeNull();
    const newHash = repository.lastUpdate!.patch.passwordHash!;
    expect(await passwordService.verify("new-password-123", newHash)).toBe(true);
  });

  it("tells the hospital admins that the invite was accepted", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [
      Object.assign(
        { id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", specialty: "Clínica médica", isActive: true } as PeerPartnerRow,
        { setPasswordToken: hashSetPasswordToken("abc123") },
      ),
    ];
    const notifications = new FakeNotificationPublisher();
    const useCase = new FinishPeerPartnerSetupUseCase(repository, new PeerPartnerPasswordService(), notifications);

    await useCase.execute({ token: "abc123", password: "new-password-123" });

    expect(notifications.events).toEqual([
      {
        institutionId: "institution-1",
        type: "INVITE_ACCEPTED",
        payload: { kind: "peer-partner", name: "Dra. Ana" },
        dedupKey: "invite-accepted:peer-partner:peer-1",
      },
    ]);
  });

  it("does not announce an acceptance that never happened", async () => {
    const repository = new FakePeerPartnerRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new FinishPeerPartnerSetupUseCase(repository, new PeerPartnerPasswordService(), notifications);

    await expect(useCase.execute({ token: "unknown", password: "new-password-123" })).rejects.toThrow(
      InvalidOrExpiredPeerPartnerSetupTokenError,
    );
    expect(notifications.events).toEqual([]);
  });
});
