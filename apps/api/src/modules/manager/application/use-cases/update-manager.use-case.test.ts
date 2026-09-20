import { describe, expect, it } from "vitest";
import { UpdateManagerUseCase } from "./update-manager.use-case.ts";
import { LastActiveHospitalAdminError, ManagerNotFoundError, SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  public activeHospitalAdmins = 1;
  public lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    this.lastUpdate = { id, patch };
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  }
  async countActiveHospitalAdmins(): Promise<number> {
    return this.activeHospitalAdmins;
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

class FakeSectorRepository {
  public lastReassign: { institutionId: string; managerId: string; sectorIds: string[] } | null = null;
  public knownSectorIds = new Set<string>();
  async findByIdsInInstitution(institutionId: string, sectorIds: string[]) {
    return sectorIds.filter((id) => this.knownSectorIds.has(id)).map((id) => ({ id }));
  }
  async reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]) {
    this.lastReassign = { institutionId, managerId, sectorIds };
  }
}

class FakeSendManagerSetPasswordEmailUseCase {
  public calls: { institutionId: string; managerId: string }[] = [];
  async execute(input: { institutionId: string; managerId: string }): Promise<void> {
    this.calls.push(input);
  }
}

function managerRow(overrides: Partial<ManagerRow> = {}): ManagerRow {
  return { id: "manager-1", name: "Ana", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true, ...overrides };
}

function build(rows: ManagerRow[], options: { activeHospitalAdmins?: number; knownSectorIds?: string[] } = {}) {
  const managerRepository = new FakeManagerRepository();
  managerRepository.rows = rows;
  managerRepository.activeHospitalAdmins = options.activeHospitalAdmins ?? 1;
  const sectorRepository = new FakeSectorRepository();
  sectorRepository.knownSectorIds = new Set(options.knownSectorIds ?? []);
  const notifications = new FakeNotificationPublisher();
  const sendManagerSetPasswordEmail = new FakeSendManagerSetPasswordEmailUseCase();
  const useCase = new UpdateManagerUseCase(managerRepository, sectorRepository as never, notifications, sendManagerSetPasswordEmail as never);
  return { useCase, managerRepository, sectorRepository, notifications, sendManagerSetPasswordEmail };
}

describe("UpdateManagerUseCase", () => {
  it("throws ManagerNotFoundError when the manager doesn't belong to the given institution", async () => {
    const { useCase } = build([managerRow({ institutionId: "institution-other" })]);

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { isActive: false } })).rejects.toThrow(ManagerNotFoundError);
  });

  it("throws LastActiveHospitalAdminError when deactivating the institution's only active HOSPITAL_ADMIN", async () => {
    const { useCase } = build([managerRow({ role: "HOSPITAL_ADMIN" })], { activeHospitalAdmins: 1 });

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { isActive: false } })).rejects.toThrow(LastActiveHospitalAdminError);
  });

  it("allows deactivating a HOSPITAL_ADMIN when another active HOSPITAL_ADMIN exists, clearing their sectors", async () => {
    const { useCase, managerRepository, sectorRepository } = build([managerRow({ role: "HOSPITAL_ADMIN" })], { activeHospitalAdmins: 2 });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { isActive: false } });

    expect(managerRepository.lastUpdate).toEqual({ id: "manager-1", patch: { isActive: false } });
    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-1", sectorIds: [] });
  });

  it("throws LastActiveHospitalAdminError when demoting the institution's only active HOSPITAL_ADMIN to SECTOR_MANAGER", async () => {
    const { useCase, managerRepository } = build([managerRow({ role: "HOSPITAL_ADMIN" })], { activeHospitalAdmins: 1 });

    await expect(
      useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { role: "SECTOR_MANAGER" } }),
    ).rejects.toThrow(LastActiveHospitalAdminError);
    expect(managerRepository.lastUpdate).toBeNull();
  });

  it("allows demoting a HOSPITAL_ADMIN when another active HOSPITAL_ADMIN exists", async () => {
    const { useCase, managerRepository, sectorRepository } = build([managerRow({ role: "HOSPITAL_ADMIN" })], {
      activeHospitalAdmins: 2,
      knownSectorIds: ["sector-a"],
    });

    await useCase.execute({
      institutionId: "institution-1",
      managerId: "manager-1",
      patch: { role: "SECTOR_MANAGER", sectorIds: ["sector-a"] },
    });

    expect(managerRepository.lastUpdate).toEqual({ id: "manager-1", patch: { isActive: undefined, role: "SECTOR_MANAGER" } });
    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-1", sectorIds: ["sector-a"] });
  });

  it("allows re-affirming the HOSPITAL_ADMIN role on the last active hospital admin", async () => {
    const { useCase, managerRepository } = build([managerRow({ role: "HOSPITAL_ADMIN" })], { activeHospitalAdmins: 1 });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { role: "HOSPITAL_ADMIN" } });

    expect(managerRepository.lastUpdate).toEqual({ id: "manager-1", patch: { isActive: undefined, role: "HOSPITAL_ADMIN" } });
  });

  it("allows demoting a SECTOR_MANAGER-role manager regardless of the hospital-admin count", async () => {
    const { useCase, managerRepository } = build([managerRow({ role: "SECTOR_MANAGER" })], { activeHospitalAdmins: 0 });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { role: "SECTOR_MANAGER" } });

    expect(managerRepository.lastUpdate).toEqual({ id: "manager-1", patch: { isActive: undefined, role: "SECTOR_MANAGER" } });
  });

  it("allows deactivating a SECTOR_MANAGER unconditionally, clearing their sectors", async () => {
    const { useCase, sectorRepository } = build([managerRow({ role: "SECTOR_MANAGER" })], { activeHospitalAdmins: 0 });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { isActive: false } });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-1", sectorIds: [] });
  });

  it("reassigns sectors when sectorIds is provided without deactivating", async () => {
    const { useCase, sectorRepository } = build([managerRow()], { knownSectorIds: ["sector-a"] });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { sectorIds: ["sector-a"] } });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-1", sectorIds: ["sector-a"] });
  });

  it("throws SectorNotInInstitutionError when a provided sectorId doesn't belong to the institution", async () => {
    const { useCase } = build([managerRow()]);

    await expect(
      useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { sectorIds: ["sector-unknown"] } }),
    ).rejects.toThrow(SectorNotInInstitutionError);
  });

  it("announces a deactivation with the instant it happened, so a later reactivation is a separate event", async () => {
    const { useCase, notifications } = build([managerRow({ id: "manager-2" })], { activeHospitalAdmins: 2 });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-2", patch: { isActive: false } });

    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]!.type).toBe("ACCOUNT_DEACTIVATED");
    expect(notifications.events[0]!.dedupKey).toMatch(/^account-status:manager:manager-2:\d{4}-/);
  });

  it("announces a reactivation as its own event", async () => {
    const { useCase, notifications } = build([managerRow({ id: "manager-2", isActive: false })], { activeHospitalAdmins: 2 });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-2", patch: { isActive: true } });

    expect(notifications.events[0]!.type).toBe("ACCOUNT_REACTIVATED");
  });

  it("says nothing when isActive was not part of the patch", async () => {
    const { useCase, notifications } = build([managerRow({ id: "manager-2" })], { activeHospitalAdmins: 2 });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-2", patch: { role: "SECTOR_MANAGER" } });

    expect(notifications.events).toEqual([]);
  });

  it("says nothing when isActive is set to the value it already had", async () => {
    const { useCase, notifications } = build([managerRow({ id: "manager-2" })], { activeHospitalAdmins: 2 });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-2", patch: { isActive: true } });

    expect(notifications.events).toEqual([]);
  });

  it("sends the pending manager's invite email when a sector is linked for the first time", async () => {
    const pending = managerRow({ passwordHash: null, setPasswordTokenExpiresAt: null });
    const { useCase, sendManagerSetPasswordEmail } = build([pending], { knownSectorIds: ["sector-a"] });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { sectorIds: ["sector-a"] } });

    expect(sendManagerSetPasswordEmail.calls).toEqual([{ institutionId: "institution-1", managerId: "manager-1" }]);
  });

  it("does not send an invite when the manager already has a password", async () => {
    const { useCase, sendManagerSetPasswordEmail } = build([managerRow({ passwordHash: "hash" })], { knownSectorIds: ["sector-a"] });

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { sectorIds: ["sector-a"] } });

    expect(sendManagerSetPasswordEmail.calls).toEqual([]);
  });

  it("does not send an invite when sectorIds is set to empty (unassigning)", async () => {
    const pending = managerRow({ passwordHash: null, setPasswordTokenExpiresAt: null });
    const { useCase, sendManagerSetPasswordEmail } = build([pending]);

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1", patch: { sectorIds: [] } });

    expect(sendManagerSetPasswordEmail.calls).toEqual([]);
  });

  it("uses the patched role, not the stored one, when role and sectorIds change together", async () => {
    const pending = managerRow({ role: "HOSPITAL_ADMIN", passwordHash: null, setPasswordTokenExpiresAt: null });
    const { useCase, sendManagerSetPasswordEmail } = build([pending], { activeHospitalAdmins: 2, knownSectorIds: ["sector-a"] });

    await useCase.execute({
      institutionId: "institution-1",
      managerId: "manager-1",
      patch: { role: "SECTOR_MANAGER", sectorIds: ["sector-a"] },
    });

    expect(sendManagerSetPasswordEmail.calls).toEqual([{ institutionId: "institution-1", managerId: "manager-1" }]);
  });
});
