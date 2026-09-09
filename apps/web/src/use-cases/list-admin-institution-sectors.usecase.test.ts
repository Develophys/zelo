import { describe, expect, it, vi } from "vitest";
import { ListAdminInstitutionSectorsUseCase } from "./list-admin-institution-sectors.usecase";
import type { AdminInstitutionPort } from "@/ports/admin-institution.port";

describe("ListAdminInstitutionSectorsUseCase", () => {
  it("delegates to the port with the token and institution id", async () => {
    const port = { listSectors: vi.fn().mockResolvedValue([]) } as unknown as AdminInstitutionPort;
    const useCase = new ListAdminInstitutionSectorsUseCase(port);

    await useCase.execute("token", "inst-1");

    expect(port.listSectors).toHaveBeenCalledWith("token", "inst-1");
  });
});
