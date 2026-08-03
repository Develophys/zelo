import { describe, expect, it, vi, afterEach } from "vitest";
import { HttpManagerSignalsAdapter } from "./http-manager-signals.adapter";

const VALID_RESPONSE_BODY = {
  overallConcerningRate: 0,
  checkInsLast4Weeks: 0,
  weeklyTrend: [],
  segments: [],
  followUpResponseRate: 0,
};

function stubFetchOk() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => VALID_RESPONSE_BODY,
  } as Response);
}

describe("HttpManagerSignalsAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits the sectorIds query param entirely when sectorIds is undefined (no filter ever requested)", async () => {
    const fetchSpy = stubFetchOk();
    const adapter = new HttpManagerSignalsAdapter();

    await adapter.fetchSignals("token-1");

    const requestedUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(requestedUrl).not.toContain("sectorIds");
  });

  it("sends an explicit empty sectorIds param (not omitted) when sectorIds is an empty array — deliberately zero sectors selected", async () => {
    const fetchSpy = stubFetchOk();
    const adapter = new HttpManagerSignalsAdapter();

    await adapter.fetchSignals("token-1", []);

    const requestedUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain("?sectorIds=");
    // Must NOT be indistinguishable from the "no filter" case above.
    expect(requestedUrl.endsWith("?sectorIds=")).toBe(true);
  });

  it("sends the joined, encoded sectorIds when a non-empty array is given", async () => {
    const fetchSpy = stubFetchOk();
    const adapter = new HttpManagerSignalsAdapter();

    await adapter.fetchSignals("token-1", ["sector-a", "sector-b"]);

    const requestedUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain("?sectorIds=sector-a,sector-b");
  });
});
