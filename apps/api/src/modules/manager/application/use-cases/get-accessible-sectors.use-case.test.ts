import { describe, expect, it } from "vitest";
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

describe("GetAccessibleSectorsUseCase", () => {
  it("returns every active sector for a HOSPITAL_ADMIN", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], []);
    const useCase = new GetAccessibleSectorsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "HOSPITAL_ADMIN", managerId: "m-1" });

    expect(result).toEqual([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
  });

  it("returns only a SECTOR_MANAGER's assigned active sectors", async () => {
    const repository = new FakeSectorRepository([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["b"]);
    const useCase = new GetAccessibleSectorsUseCase(repository as never);

    const result = await useCase.execute({ institutionId: "i-1", role: "SECTOR_MANAGER", managerId: "m-2" });

    expect(result).toEqual([{ id: "b", name: "B" }]);
  });
});
