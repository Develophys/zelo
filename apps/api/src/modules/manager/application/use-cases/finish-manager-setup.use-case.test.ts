import { describe, expect, it } from "vitest";
import { FinishManagerSetupUseCase, InvalidOrExpiredManagerSetupTokenError } from "./finish-manager-setup.use-case.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";
import { hashSetPasswordToken } from "@/shared/tokens/hash-set-password-token.js";

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(token: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => (r as unknown as { setPasswordToken?: string }).setPasswordToken === token) ?? null;
  }
  async findById(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    this.lastUpdate = { id, patch };
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
  async findActiveHospitalAdminIds(): Promise<never> {
    throw new Error("not used in this test");
  }
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

describe("FinishManagerSetupUseCase", () => {
  it("throws InvalidOrExpiredManagerSetupTokenError when no manager has this token", async () => {
    const repository = new FakeManagerRepository();
    const useCase = new FinishManagerSetupUseCase(repository, new ManagerPasswordService(), new FakeNotificationPublisher());

    await expect(useCase.execute({ token: "unknown-token", password: "new-password-123" })).rejects.toThrow(InvalidOrExpiredManagerSetupTokenError);
  });

  it("throws InvalidOrExpiredManagerSetupTokenError when the token has expired", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [
      Object.assign(
        { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() - 1000), institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true } as ManagerRow,
        { setPasswordToken: hashSetPasswordToken("abc123") },
      ),
    ];
    const useCase = new FinishManagerSetupUseCase(repository, new ManagerPasswordService(), new FakeNotificationPublisher());

    await expect(useCase.execute({ token: "abc123", password: "new-password-123" })).rejects.toThrow(InvalidOrExpiredManagerSetupTokenError);
  });

  it("hashes and sets the new password, then clears the token", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [
      Object.assign(
        { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true } as ManagerRow,
        { setPasswordToken: hashSetPasswordToken("abc123") },
      ),
    ];
    const passwordService = new ManagerPasswordService();
    const useCase = new FinishManagerSetupUseCase(repository, passwordService, new FakeNotificationPublisher());

    await useCase.execute({ token: "abc123", password: "new-password-123" });

    expect(repository.lastUpdate?.id).toBe("manager-1");
    expect(repository.lastUpdate?.patch.setPasswordToken).toBeNull();
    expect(repository.lastUpdate?.patch.setPasswordTokenExpiresAt).toBeNull();
    const newHash = repository.lastUpdate!.patch.passwordHash!;
    expect(await passwordService.verify("new-password-123", newHash)).toBe(true);
  });

  it("tells the hospital admins that the invite was accepted", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [
      Object.assign(
        { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true } as ManagerRow,
        { setPasswordToken: hashSetPasswordToken("abc123") },
      ),
    ];
    const notifications = new FakeNotificationPublisher();
    const useCase = new FinishManagerSetupUseCase(repository, new ManagerPasswordService(), notifications);

    await useCase.execute({ token: "abc123", password: "new-password-123" });

    expect(notifications.events).toEqual([
      {
        institutionId: "institution-1",
        type: "INVITE_ACCEPTED",
        payload: { kind: "manager", name: "Ana Konder" },
        dedupKey: "invite-accepted:manager:manager-1",
      },
    ]);
  });

  it("does not announce an acceptance that never happened", async () => {
    const repository = new FakeManagerRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new FinishManagerSetupUseCase(repository, new ManagerPasswordService(), notifications);

    await expect(useCase.execute({ token: "unknown", password: "new-password-123" })).rejects.toThrow(
      InvalidOrExpiredManagerSetupTokenError,
    );
    expect(notifications.events).toEqual([]);
  });
});
