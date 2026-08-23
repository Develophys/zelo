import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpManagerAdminAdapter } from "./http-manager-admin.adapter";
import { AdminDeleteConflictError, deleteConflictMessage } from "@/ports/manager-admin.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpManagerAdminAdapter deletes", () => {
  it("sends DELETE with the bearer token", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await new HttpManagerAdminAdapter().deleteManager("token", "m1");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/manager/admin/managers/m1");
    expect(init!.method).toBe("DELETE");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it.each([
    ["MANAGER_OWNS_SECTORS", "manager"],
    ["LAST_ADMIN", "manager"],
  ])("raises a typed conflict carrying the %s reason", async (reason) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: reason }), { status: 409 }),
    );

    await expect(new HttpManagerAdminAdapter().deleteManager("token", "m1")).rejects.toMatchObject({
      reason,
    });
  });

  it("raises a conflict with UNKNOWN when the body carries no recognised reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 409 }));

    await expect(new HttpManagerAdminAdapter().deleteSector("token", "s1")).rejects.toMatchObject({
      reason: "UNKNOWN",
    });
  });

  it("raises UnauthorizedManagerError on a 401, like every other call on this port", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    await expect(new HttpManagerAdminAdapter().deletePeerPartner("token", "p1")).rejects.toThrow(
      UnauthorizedManagerError,
    );
  });

  it("deletes a sector and a peer partner through their own routes", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await new HttpManagerAdminAdapter().deleteSector("token", "s1");
    await new HttpManagerAdminAdapter().deletePeerPartner("token", "p1");

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/manager/admin/sectors/s1");
    expect(String(fetchSpy.mock.calls[1]![0])).toContain("/manager/admin/peer-partners/p1");
  });
});

describe("deleteConflictMessage", () => {
  it("names the way out for a sector with history", () => {
    expect(deleteConflictMessage(new AdminDeleteConflictError("SECTOR_HAS_HISTORY"))).toBe(
      "Este setor tem histórico de check-ins e não pode ser excluído. Pause-o para tirá-lo do painel.",
    );
  });

  it("names the way out for a manager who still owns sectors", () => {
    expect(deleteConflictMessage(new AdminDeleteConflictError("MANAGER_OWNS_SECTORS"))).toBe(
      "Este gestor ainda é responsável por setores. Reatribua os setores antes de excluí-lo.",
    );
  });

  it("names the way out for the last admin", () => {
    expect(deleteConflictMessage(new AdminDeleteConflictError("LAST_ADMIN"))).toBe(
      "Este é o último administrador ativo do hospital. Cadastre outro antes de excluí-lo.",
    );
  });

  it("falls back to a plain retry sentence", () => {
    expect(deleteConflictMessage(new AdminDeleteConflictError("UNKNOWN"))).toBe(
      "Não foi possível excluir. Tente de novo.",
    );
  });

  it("returns null for an error that is not a delete conflict", () => {
    expect(deleteConflictMessage(new Error("network"))).toBeNull();
  });
});
