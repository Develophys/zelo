import { describe, expect, it } from "vitest";
import { DeleteManagerUseCase } from "./delete-manager.use-case.ts";
import {
  LastActiveHospitalAdminError,
  ManagerNotFoundError,
  ManagerOwnsSectorsError,
} from "./manager-admin-errors.ts";
import type { ManagerRepository, ManagerRow } from "../ports/manager-repository.port.ts";
import type { SectorRepository } from "@/modules/sector/application/ports/sector-repository.port.js";

const MANAGER: ManagerRow = {
  id: "manager-2",
  name: "Bruno",
  email: "bruno@zelo-demo.local",
  passwordHash: "hash",
  setPasswordTokenExpiresAt: null,
  institutionId: "institution-1",
  role: "SECTOR_MANAGER",
  isActive: true,
};

function build(options: {
  manager?: ManagerRow | null;
  ownedSectorIds?: string[];
  activeAdmins?: number;
} = {}) {
  const deleted: string[] = [];
  const managers = {
    findById: async () => (options.manager === undefined ? MANAGER : options.manager),
    countActiveHospitalAdmins: async () => options.activeAdmins ?? 2,
    delete: async (id: string) => {
      deleted.push(id);
    },
  } as unknown as ManagerRepository;
  const sectors = {
    findAssignedSectorIds: async () => options.ownedSectorIds ?? [],
  } as unknown as SectorRepository;

  return { useCase: new DeleteManagerUseCase(managers, sectors), deleted };
}

const input = { institutionId: "institution-1", managerId: "manager-2" };

describe("DeleteManagerUseCase", () => {
  it("deletes a manager who owns no sector", async () => {
    const { useCase, deleted } = build();
    await useCase.execute(input);
    expect(deleted).toEqual(["manager-2"]);
  });

  it("refuses a manager from another institution as not found, revealing nothing", async () => {
    const { useCase, deleted } = build({
      manager: { ...MANAGER, institutionId: "institution-2" },
    });
    await expect(useCase.execute(input)).rejects.toThrow(ManagerNotFoundError);
    expect(deleted).toEqual([]);
  });

  it("refuses an unknown manager", async () => {
    const { useCase } = build({ manager: null });
    await expect(useCase.execute(input)).rejects.toThrow(ManagerNotFoundError);
  });

  // Deleting the sector's owner would leave the sector orphaned at the database
  // level (Sector.managerId RESTRICTs), so the check is explicit and the message
  // tells the admin what to do about it.
  it("refuses a manager who still owns sectors", async () => {
    const { useCase, deleted } = build({ ownedSectorIds: ["sector-1"] });
    await expect(useCase.execute(input)).rejects.toThrow(ManagerOwnsSectorsError);
    expect(deleted).toEqual([]);
  });

  // Same guard UpdateManagerUseCase already applies to deactivation and
  // demotion — without it an institution locks itself out with no recovery.
  it("refuses to delete the last active hospital admin", async () => {
    const { useCase, deleted } = build({
      manager: { ...MANAGER, role: "HOSPITAL_ADMIN" },
      activeAdmins: 1,
    });
    await expect(useCase.execute(input)).rejects.toThrow(LastActiveHospitalAdminError);
    expect(deleted).toEqual([]);
  });

  it("allows deleting a hospital admin while another active one remains", async () => {
    const { useCase, deleted } = build({
      manager: { ...MANAGER, role: "HOSPITAL_ADMIN" },
      activeAdmins: 2,
    });
    await useCase.execute(input);
    expect(deleted).toEqual(["manager-2"]);
  });

  // An inactive admin is not holding the door open for anyone, so the
  // last-admin guard must not count them and must not block on them.
  it("deletes an inactive hospital admin without consulting the last-admin guard", async () => {
    const { useCase, deleted } = build({
      manager: { ...MANAGER, role: "HOSPITAL_ADMIN", isActive: false },
      activeAdmins: 1,
    });
    await useCase.execute(input);
    expect(deleted).toEqual(["manager-2"]);
  });
});
