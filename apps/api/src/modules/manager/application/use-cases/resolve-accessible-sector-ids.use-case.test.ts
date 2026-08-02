import { describe, expect, it } from "vitest";
import { ResolveAccessibleSectorIdsUseCase } from "./resolve-accessible-sector-ids.use-case.ts";
import { GetAccessibleSectorsUseCase } from "./get-accessible-sectors.use-case.ts";

class FakeSectorRepository {
  constructor(private readonly active: { id: string; name: string }[], private readonly assigned: string[]) {}
  async findActiveByInstitution() {
    return this.active;
  }
  async findActiveByIds(_institutionId: string, ids: string[]) {
    return this.active.filter((sector) => ids.includes(sector.id));
  }
  async findAssignedSectorIds() {
    return this.assigned;
  }
}

function buildUseCase(repository: FakeSectorRepository): ResolveAccessibleSectorIdsUseCase {
  return new ResolveAccessibleSectorIdsUseCase(new GetAccessibleSectorsUseCase(repository as never));
}

describe("ResolveAccessibleSectorIdsUseCase", () => {
  it("returns every active sector id for a HOSPITAL_ADMIN with no requested filter", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], []);
    const useCase = buildUseCase(repository);

    const result = await useCase.execute({ institutionId: "i-1", role: "HOSPITAL_ADMIN", managerId: "m-1" });

    expect(result).toEqual(["a", "b"]);
  });

  it("intersects a HOSPITAL_ADMIN's requested subset with all active sectors", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], []);
    const useCase = buildUseCase(repository);

    const result = await useCase.execute({ institutionId: "i-1", role: "HOSPITAL_ADMIN", managerId: "m-1", requestedSectorIds: ["a"] });

    expect(result).toEqual(["a"]);
  });

  it("returns only a SECTOR_MANAGER's assigned sectors when no filter is requested", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["b"]);
    const useCase = buildUseCase(repository);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2" });

    expect(result).toEqual(["b"]);
  });

  it("silently drops a SECTOR_MANAGER's requested id that falls outside their assignment, rather than erroring", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["b"]);
    const useCase = buildUseCase(repository);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2", requestedSectorIds: ["a", "b"] });

    expect(result).toEqual(["b"]);
  });

  it("excludes a SECTOR_MANAGER's assigned-but-deactivated sector, matching GetAccessibleSectorsUseCase", async () => {
    // "b" is still assigned to the manager but no longer active in the institution.
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }], ["b"]);
    const getAccessibleSectors = new GetAccessibleSectorsUseCase(repository as never);
    const useCase = new ResolveAccessibleSectorIdsUseCase(getAccessibleSectors);

    const resolved = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2" });
    const listed = await getAccessibleSectors.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2" });

    expect(resolved).toEqual([]);
    expect(listed).toEqual([]);
  });

  it("drops a deactivated sector a SECTOR_MANAGER explicitly requests", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }], ["a", "b"]);
    const useCase = buildUseCase(repository);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2", requestedSectorIds: ["a", "b"] });

    expect(result).toEqual(["a"]);
  });
});
