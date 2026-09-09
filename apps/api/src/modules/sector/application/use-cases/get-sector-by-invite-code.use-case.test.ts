import { describe, expect, it, vi } from "vitest";
import { GetSectorByInviteCodeUseCase } from "./get-sector-by-invite-code.use-case.ts";
import type { SectorRepository, SectorWithInstitution } from "../ports/sector-repository.port.ts";

function repositoryStub(row: SectorWithInstitution | null): SectorRepository {
  return {
    findByInviteCode: vi.fn().mockResolvedValue(row),
  } as unknown as SectorRepository;
}

describe("GetSectorByInviteCodeUseCase", () => {
  it("returns the sector when it and its institution are active", async () => {
    const row: SectorWithInstitution = {
      id: "sector-1",
      name: "UTI",
      isActive: true,
      institution: { id: "inst-1", name: "Hospital São Lucas", isActive: true },
    };
    const useCase = new GetSectorByInviteCodeUseCase(repositoryStub(row));

    expect(await useCase.execute("uti-2026")).toEqual(row);
  });

  it("returns null when the code does not match any sector", async () => {
    const useCase = new GetSectorByInviteCodeUseCase(repositoryStub(null));
    expect(await useCase.execute("unknown")).toBeNull();
  });

  it("returns null when the sector itself is inactive", async () => {
    const row: SectorWithInstitution = {
      id: "sector-1",
      name: "UTI",
      isActive: false,
      institution: { id: "inst-1", name: "Hospital São Lucas", isActive: true },
    };
    const useCase = new GetSectorByInviteCodeUseCase(repositoryStub(row));

    expect(await useCase.execute("uti-2026")).toBeNull();
  });

  it("returns null when the sector's institution is inactive", async () => {
    const row: SectorWithInstitution = {
      id: "sector-1",
      name: "UTI",
      isActive: true,
      institution: { id: "inst-1", name: "Hospital Encerrado", isActive: false },
    };
    const useCase = new GetSectorByInviteCodeUseCase(repositoryStub(row));

    expect(await useCase.execute("uti-2026")).toBeNull();
  });
});
