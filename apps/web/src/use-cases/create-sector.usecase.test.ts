import { describe, expect, it, vi } from "vitest";
import { CreateSectorUseCase } from "./create-sector.usecase";
import type { ManagerAdminPort } from "@/ports/manager-admin.port";

function makePort(overrides: Partial<ManagerAdminPort> = {}): ManagerAdminPort {
  return {
    listSectors: vi.fn(),
    createSector: vi.fn(),
    updateSector: vi.fn(),
    listManagers: vi.fn(),
    createManager: vi.fn(),
    updateManager: vi.fn(),
    sendManagerSetPasswordEmail: vi.fn(),
    listPeerPartners: vi.fn(),
    createPeerPartner: vi.fn(),
    updatePeerPartner: vi.fn(),
    sendPeerPartnerSetPasswordEmail: vi.fn(),
    deleteManager: vi.fn(),
    deleteSector: vi.fn(),
    deletePeerPartner: vi.fn(),
    ...overrides,
  };
}

describe("CreateSectorUseCase", () => {
  it("forwards the name to the port", async () => {
    const createSector = vi.fn().mockResolvedValue({ id: "sector-1", name: "UTI" });
    const useCase = new CreateSectorUseCase(makePort({ createSector }));

    const result = await useCase.execute("token", { name: "UTI" });

    expect(createSector).toHaveBeenCalledWith("token", { name: "UTI" });
    expect(result).toEqual({ id: "sector-1", name: "UTI" });
  });

  it("forwards the inviteCode to the port when provided", async () => {
    const createSector = vi.fn().mockResolvedValue({ id: "sector-1", name: "UTI" });
    const useCase = new CreateSectorUseCase(makePort({ createSector }));

    await useCase.execute("token", { name: "UTI", inviteCode: "uti-2026" });

    expect(createSector).toHaveBeenCalledWith("token", { name: "UTI", inviteCode: "uti-2026" });
  });
});
