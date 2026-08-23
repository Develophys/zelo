import { describe, expect, it } from "vitest";
import { DeleteSectorUseCase } from "./delete-sector.use-case.ts";
import { SectorHasHistoryError, SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import type { SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import type { SignalRepository } from "../ports/signal-repository.port.ts";

function build(options: {
  sector?: { id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean } | null;
  signalCount?: number;
} = {}) {
  const deleted: string[] = [];
  const sectors = {
    findById: async () =>
      options.sector === undefined
        ? { id: "sector-1", institutionId: "institution-1", name: "UTI", managerId: null, isActive: true }
        : options.sector,
    delete: async (id: string) => {
      deleted.push(id);
    },
  } as unknown as SectorRepository;
  const signals = {
    countBySector: async () => options.signalCount ?? 0,
  } as unknown as SignalRepository;

  return { useCase: new DeleteSectorUseCase(sectors, signals), deleted };
}

const input = { institutionId: "institution-1", sectorId: "sector-1" };

describe("DeleteSectorUseCase", () => {
  it("deletes a sector that never received a check-in", async () => {
    const { useCase, deleted } = build();
    await useCase.execute(input);
    expect(deleted).toEqual(["sector-1"]);
  });

  // Signal rows are the aggregates the whole dashboard is built on. Cascading
  // here would silently rewrite the trend for every past week.
  it("refuses a sector that has check-in history", async () => {
    const { useCase, deleted } = build({ signalCount: 1 });
    await expect(useCase.execute(input)).rejects.toThrow(SectorHasHistoryError);
    expect(deleted).toEqual([]);
  });

  it("refuses a sector from another institution as not found", async () => {
    const { useCase } = build({
      sector: { id: "sector-1", institutionId: "institution-2", name: "UTI", managerId: null, isActive: true },
    });
    await expect(useCase.execute(input)).rejects.toThrow(SectorNotInInstitutionError);
  });

  it("refuses an unknown sector", async () => {
    const { useCase } = build({ sector: null });
    await expect(useCase.execute(input)).rejects.toThrow(SectorNotInInstitutionError);
  });

  it("checks history before deleting, never after", async () => {
    const { useCase, deleted } = build({ signalCount: 5 });
    await expect(useCase.execute(input)).rejects.toThrow(SectorHasHistoryError);
    expect(deleted).toEqual([]);
  });
});
