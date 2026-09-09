import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpSignalCheckinAdapter } from "./http-signal-checkin.adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpSignalCheckinAdapter abandon", () => {
  it("posts to /signals/abandon with the given params", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const adapter = new HttpSignalCheckinAdapter();
    await adapter.abandon({ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/signals/abandon");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-1",
    });
  });

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    const adapter = new HttpSignalCheckinAdapter();
    await expect(
      adapter.abandon({ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" }),
    ).rejects.toThrow();
  });
});
