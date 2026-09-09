import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpManagerAdminAdapter } from "./http-manager-admin.adapter";
import { SectorInviteCodeConflictError, SectorNameConflictError } from "@/ports/manager-admin.port";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpManagerAdminAdapter createSector", () => {
  it("sends the inviteCode when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sector-1", name: "UTI" }), { status: 201 }),
    );

    const adapter = new HttpManagerAdminAdapter();
    await adapter.createSector("token", { name: "UTI", inviteCode: "uti-2026" });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/manager/admin/sectors"),
      expect.objectContaining({ body: JSON.stringify({ name: "UTI", inviteCode: "uti-2026" }) }),
    );
  });

  it("throws SectorInviteCodeConflictError when the server reports a code conflict", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ conflict: "inviteCode" }), { status: 409 }),
    );

    const adapter = new HttpManagerAdminAdapter();
    await expect(
      adapter.createSector("token", { name: "PS", inviteCode: "shared" }),
    ).rejects.toThrow(SectorInviteCodeConflictError);
  });

  it("still throws SectorNameConflictError for a name conflict", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ conflict: "name" }), { status: 409 }),
    );

    const adapter = new HttpManagerAdminAdapter();
    await expect(adapter.createSector("token", { name: "Duplicada" })).rejects.toThrow(
      SectorNameConflictError,
    );
  });
});

describe("HttpManagerAdminAdapter updateSector", () => {
  it("sends the inviteCode when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const adapter = new HttpManagerAdminAdapter();
    await adapter.updateSector("token", "sector-1", { inviteCode: "uti-2026" });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/manager/admin/sectors/sector-1"),
      expect.objectContaining({ body: JSON.stringify({ inviteCode: "uti-2026" }) }),
    );
  });

  it("throws SectorInviteCodeConflictError when the server reports a code conflict", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ conflict: "inviteCode" }), { status: 409 }),
    );

    const adapter = new HttpManagerAdminAdapter();
    await expect(
      adapter.updateSector("token", "sector-1", { inviteCode: "shared" }),
    ).rejects.toThrow(SectorInviteCodeConflictError);
  });

  it("still throws SectorNameConflictError for a name conflict", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ conflict: "name" }), { status: 409 }),
    );

    const adapter = new HttpManagerAdminAdapter();
    await expect(
      adapter.updateSector("token", "sector-1", { inviteCode: "shared" }),
    ).rejects.toThrow(SectorNameConflictError);
  });
});
