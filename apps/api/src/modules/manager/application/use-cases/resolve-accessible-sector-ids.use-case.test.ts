import { describe, expect, it } from "vitest";
import { ResolveAccessibleSectorIdsUseCase } from "./resolve-accessible-sector-ids.use-case.ts";

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

describe("ResolveAccessibleSectorIdsUseCase", () => {
  it("returns every active sector id for a HOSPITAL_ADMIN with no requested filter", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], []);
    const useCase = new ResolveAccessibleSectorIdsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "HOSPITAL_ADMIN", managerId: "m-1" });

    expect(result).toEqual(["a", "b"]);
  });

  it("intersects a HOSPITAL_ADMIN's requested subset with all active sectors", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], []);
    const useCase = new ResolveAccessibleSectorIdsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "HOSPITAL_ADMIN", managerId: "m-1", requestedSectorIds: ["a"] });

    expect(result).toEqual(["a"]);
  });

  it("returns only a SECTOR_MANAGER's assigned sectors when no filter is requested", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["b"]);
    const useCase = new ResolveAccessibleSectorIdsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2" });

    expect(result).toEqual(["b"]);
  });

  it("silently drops a SECTOR_MANAGER's requested id that falls outside their assignment, rather than erroring", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["b"]);
    const useCase = new ResolveAccessibleSectorIdsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2", requestedSectorIds: ["a", "b"] });

    expect(result).toEqual(["b"]);
  });
});
