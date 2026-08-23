import { describe, expect, it } from "vitest";
import { ResolveNotificationRecipientsUseCase } from "./resolve-notification-recipients.use-case.ts";
import type { NotificationEvent, NotificationType } from "../ports/notification.port.ts";
import type { ManagerRepository } from "../../../manager/application/ports/manager-repository.port.ts";
import type { SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";

const INSTITUTION = "institution-1";

class FakeManagerRepository {
  adminIds: string[] = ["admin-1", "admin-2"];
  managers = new Map<string, { isActive: boolean }>([["sector-manager-1", { isActive: true }]]);
  async findActiveHospitalAdminIds(institutionId: string): Promise<string[]> {
    return institutionId === INSTITUTION ? this.adminIds : [];
  }
  async findById(id: string) {
    const manager = this.managers.get(id);
    return manager ? { id, isActive: manager.isActive } : null;
  }
}

class FakeSectorRepository {
  sector: { id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean } | null = {
    id: "sector-1",
    institutionId: INSTITUTION,
    name: "UTI",
    managerId: "sector-manager-1",
    isActive: true,
  };
  async findById(id: string) {
    return this.sector && this.sector.id === id ? this.sector : null;
  }
}

function build(managers = new FakeManagerRepository(), sectors = new FakeSectorRepository()) {
  return new ResolveNotificationRecipientsUseCase(
    managers as unknown as ManagerRepository,
    sectors as unknown as SectorRepository,
  );
}

function event(type: NotificationType, sectorId?: string): NotificationEvent {
  return { institutionId: INSTITUTION, type, payload: {}, sectorId, dedupKey: `${type}:x` };
}

// Derived from a Record keyed by the full NotificationType union, so adding a
// new type without deciding "account" or "sector" here is a compile error,
// not a silently-uncovered case.
const NOTIFICATION_SCOPE: Record<NotificationType, "account" | "sector"> = {
  INVITE_ACCEPTED: "account",
  INVITE_EXPIRED: "account",
  INVITE_EMAIL_FAILED: "account",
  ACCOUNT_DEACTIVATED: "account",
  ACCOUNT_REACTIVATED: "account",
  SECTOR_BECAME_VISIBLE: "sector",
  SECTOR_RISK_THRESHOLD: "sector",
};

const ACCOUNT_TYPES = (Object.keys(NOTIFICATION_SCOPE) as NotificationType[]).filter(
  (type) => NOTIFICATION_SCOPE[type] === "account",
);

const SECTOR_TYPES = (Object.keys(NOTIFICATION_SCOPE) as NotificationType[]).filter(
  (type) => NOTIFICATION_SCOPE[type] === "sector",
);

describe("ResolveNotificationRecipientsUseCase", () => {
  it.each(ACCOUNT_TYPES)("sends %s to every active hospital admin and nobody else", async (type) => {
    const recipients = await build().execute(event(type));
    expect(recipients).toEqual(["admin-1", "admin-2"]);
  });

  it.each(SECTOR_TYPES)("sends %s to the admins plus the sector's own manager", async (type) => {
    const recipients = await build().execute(event(type, "sector-1"));
    expect(recipients.sort()).toEqual(["admin-1", "admin-2", "sector-manager-1"]);
  });

  it("does not duplicate a recipient who is both an admin and the sector's manager", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = { id: "sector-1", institutionId: INSTITUTION, name: "UTI", managerId: "admin-1", isActive: true };
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_RISK_THRESHOLD", "sector-1"),
    );
    expect(recipients).toEqual(["admin-1", "admin-2"]);
  });

  it("delivers nothing about a sector that belongs to another institution", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = {
      id: "sector-1",
      institutionId: "institution-2",
      name: "UTI",
      managerId: "sector-manager-1",
      isActive: true,
    };
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_RISK_THRESHOLD", "sector-1"),
    );
    expect(recipients).toEqual([]);
  });

  it("delivers nothing when the sector no longer exists", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = null;
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_BECAME_VISIBLE", "sector-1"),
    );
    expect(recipients).toEqual([]);
  });

  it("reaches the admins even when the sector has no manager assigned", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = { id: "sector-1", institutionId: INSTITUTION, name: "UTI", managerId: null, isActive: true };
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_BECAME_VISIBLE", "sector-1"),
    );
    expect(recipients).toEqual(["admin-1", "admin-2"]);
  });

  // The invariant, stated as a test: a sector-scoped event must not resolve a
  // recipient by any path other than "admin of that institution" or "manager of
  // that exact sector". A future type added without a rule must fail here.
  it("never resolves a sector event to a manager of a different sector", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = {
      id: "sector-1",
      institutionId: INSTITUTION,
      name: "UTI",
      managerId: "sector-manager-1",
      isActive: true,
    };
    const managers = new FakeManagerRepository();
    managers.adminIds = [];
    const recipients = await build(managers, sectors).execute(event("SECTOR_RISK_THRESHOLD", "sector-1"));
    expect(recipients).toEqual(["sector-manager-1"]);
  });

  it("treats a sector-scoped event with no sectorId as undeliverable rather than institution-wide", async () => {
    const recipients = await build().execute(event("SECTOR_RISK_THRESHOLD"));
    expect(recipients).toEqual([]);
  });

  it("resolves to the admins only when the sector's assigned manager is inactive", async () => {
    const managers = new FakeManagerRepository();
    managers.managers.set("sector-manager-1", { isActive: false });
    const recipients = await build(managers).execute(event("SECTOR_RISK_THRESHOLD", "sector-1"));
    expect(recipients).toEqual(["admin-1", "admin-2"]);
  });

  it("resolves to the admins only, without throwing, when the sector's managerId points at a manager that no longer exists", async () => {
    const sectors = new FakeSectorRepository();
    sectors.sector = {
      id: "sector-1",
      institutionId: INSTITUTION,
      name: "UTI",
      managerId: "ghost-manager",
      isActive: true,
    };
    const recipients = await build(new FakeManagerRepository(), sectors).execute(
      event("SECTOR_RISK_THRESHOLD", "sector-1"),
    );
    expect(recipients).toEqual(["admin-1", "admin-2"]);
  });

  // A deactivated sector is not listable by anyone, admins included
  // (GetAccessibleSectorsUseCase filters through findActiveByInstitution /
  // findActiveByIds). Fanning out a notification for it would announce a
  // sector nobody can see on the panel.
  it.each(SECTOR_TYPES)("delivers nothing about %s for a deactivated sector, even to admins", async (type) => {
    const sectors = new FakeSectorRepository();
    sectors.sector = {
      id: "sector-1",
      institutionId: INSTITUTION,
      name: "UTI",
      managerId: "sector-manager-1",
      isActive: false,
    };
    const recipients = await build(new FakeManagerRepository(), sectors).execute(event(type, "sector-1"));
    expect(recipients).toEqual([]);
  });
});
