import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-fetch";
import { API_BASE_URL } from "./api-base-url";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubFetch() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200 } as Response);
  }

  it("prefixes the API base URL and always sends credentials", async () => {
    const fetchSpy = stubFetch();

    await apiFetch("/manager/me");

    expect(fetchSpy).toHaveBeenCalledWith(`${API_BASE_URL}/manager/me`, { credentials: "include" });
  });

  it("keeps the caller's method, headers and body", async () => {
    const fetchSpy = stubFetch();

    await apiFetch("/manager/admin/sectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

    expect(fetchSpy).toHaveBeenCalledWith(`${API_BASE_URL}/manager/admin/sectors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "include",
    });
  });

  it("does not let a caller turn credentials off", async () => {
    const fetchSpy = stubFetch();

    await apiFetch("/x", { credentials: "omit" });

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("never adds an Authorization header", async () => {
    const fetchSpy = stubFetch();

    await apiFetch("/x");

    expect(JSON.stringify(fetchSpy.mock.calls[0]?.[1])).not.toContain("Authorization");
  });
});
