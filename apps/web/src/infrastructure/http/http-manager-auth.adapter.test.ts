import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpManagerAuthAdapter } from "./http-manager-auth.adapter";
import { API_BASE_URL } from "./api-base-url";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

describe("HttpManagerAuthAdapter session", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("login sends credentials so the browser stores the cookie, and returns only the profile", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "ignored", expiresAt: "ignored", role: "HOSPITAL_ADMIN", name: "Ana" }),
    } as Response);

    const result = await new HttpManagerAuthAdapter().login("ana@zelo-demo.local", "secret-password");

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/manager/login`);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(result).toEqual({ role: "HOSPITAL_ADMIN", name: "Ana" });
  });

  it("me returns the profile", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ name: "Ana", role: "SECTOR_MANAGER" }) } as Response);

    await expect(new HttpManagerAuthAdapter().me()).resolves.toEqual({ name: "Ana", role: "SECTOR_MANAGER" });
  });

  it("me throws UnauthorizedManagerError on a 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(new HttpManagerAuthAdapter().me()).rejects.toBeInstanceOf(UnauthorizedManagerError);
  });

  it("me throws a plain error on any other failure, so the route shows its error page instead of the login form", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(new HttpManagerAuthAdapter().me()).rejects.not.toBeInstanceOf(UnauthorizedManagerError);
  });

  it("logout posts with credentials and resolves on 204", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 204 } as Response);

    await new HttpManagerAuthAdapter().logout();

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/manager/logout`);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: "POST", credentials: "include" });
  });
});
