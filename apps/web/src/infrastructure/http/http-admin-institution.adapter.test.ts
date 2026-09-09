import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpAdminInstitutionAdapter } from "./http-admin-institution.adapter";
import { UnauthorizedAdminError } from "@/ports/admin-institution.port";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpAdminInstitutionAdapter listSectors", () => {
  it("fetches the institution's sectors with invite codes, authenticated", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
        ]),
        { status: 200 },
      ),
    );

    const adapter = new HttpAdminInstitutionAdapter();
    const result = await adapter.listSectors("token", "inst-1");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/admin/institutions/inst-1/sectors");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer token");
    expect(result).toEqual([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
    ]);
  });

  it("throws UnauthorizedAdminError on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const adapter = new HttpAdminInstitutionAdapter();
    await expect(adapter.listSectors("token", "inst-1")).rejects.toThrow(UnauthorizedAdminError);
  });
});
