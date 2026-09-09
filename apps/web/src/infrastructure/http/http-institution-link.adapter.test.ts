import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpInstitutionLinkAdapter } from "./http-institution-link.adapter";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpInstitutionLinkAdapter.lookupByCode", () => {
  it("returns just the institution when the code has no sector", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ institution: { id: "inst-1", name: "Hospital São Lucas" } }),
        { status: 200 },
      ),
    );

    const adapter = new HttpInstitutionLinkAdapter();
    const result = await adapter.lookupByCode("sao-lucas-2026");

    expect(result).toEqual({ institution: { id: "inst-1", name: "Hospital São Lucas" } });
  });

  it("returns the institution and sector together when the code resolves a sector", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          institution: { id: "inst-1", name: "Hospital São Lucas" },
          sector: { id: "sector-1", name: "UTI" },
        }),
        { status: 200 },
      ),
    );

    const adapter = new HttpInstitutionLinkAdapter();
    const result = await adapter.lookupByCode("uti-2026");

    expect(result).toEqual({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });
  });

  it("throws InstitutionNotFoundError on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));

    const adapter = new HttpInstitutionLinkAdapter();
    await expect(adapter.lookupByCode("unknown")).rejects.toThrow(InstitutionNotFoundError);
  });
});
