import { describe, expect, it } from "vitest";
import { LookupInstitutionUseCase } from "./lookup-institution.usecase";
import type { InstitutionLinkPort, InstitutionSector, LinkCodeResult } from "@/ports/institution-link.port";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

class FakeInstitutionLinkPort implements InstitutionLinkPort {
  public lastCode: string | null = null;
  constructor(private readonly result: LinkCodeResult | Error) {}
  async lookupByCode(code: string): Promise<LinkCodeResult> {
    this.lastCode = code;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
  async listSectors(): Promise<InstitutionSector[]> {
    throw new Error("not used in this test");
  }
}

describe("LookupInstitutionUseCase", () => {
  it("returns the institution on success, forwarding the code", async () => {
    const port = new FakeInstitutionLinkPort({ institution: { id: "inst-1", name: "Hospital São Lucas" } });
    const useCase = new LookupInstitutionUseCase(port);

    const result = await useCase.execute("sao-lucas-2026");

    expect(result).toEqual({ institution: { id: "inst-1", name: "Hospital São Lucas" } });
    expect(port.lastCode).toBe("sao-lucas-2026");
  });

  it("returns the institution and sector together, forwarding the code", async () => {
    const port = new FakeInstitutionLinkPort({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });
    const useCase = new LookupInstitutionUseCase(port);

    const result = await useCase.execute("uti-2026");

    expect(result).toEqual({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });
    expect(port.lastCode).toBe("uti-2026");
  });

  it("propagates InstitutionNotFoundError for an unknown code", async () => {
    const useCase = new LookupInstitutionUseCase(new FakeInstitutionLinkPort(new InstitutionNotFoundError()));

    await expect(useCase.execute("unknown")).rejects.toBeInstanceOf(InstitutionNotFoundError);
  });
});
