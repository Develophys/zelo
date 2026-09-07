import { describe, expect, it } from "vitest";
import { ManagerSignalsResponseSchema } from "./manager-signals.port";

const VALID = {
  overallConcerningRate: 0.47,
  checkInsLast4Weeks: 312,
  weeklyTrend: [{ weekStart: "2026-08-31T00:00:00.000Z", concerningRate: 0.47, checkIns: 62, concerning: 29 }],
  segments: [{ label: "UTI", value: 44, n: 20 }],
  followUpResponseRate: 0.72,
  sectorCoverage: { visible: 4, total: 7 },
};

describe("ManagerSignalsResponseSchema", () => {
  it("accepts a response carrying weekly denominators and coverage", () => {
    expect(ManagerSignalsResponseSchema.parse(VALID)).toEqual(VALID);
  });

  // Silenciar a ausência com um default esconderia uma API desatualizada e
  // faria a tela desenhar "0 de 0 setores" como se tivesse sido medido.
  it("rejects a trend point without its denominator", () => {
    const stale = { ...VALID, weeklyTrend: [{ weekStart: "2026-08-31T00:00:00.000Z", concerningRate: 0.47 }] };
    expect(() => ManagerSignalsResponseSchema.parse(stale)).toThrow();
  });

  it("rejects a response without coverage", () => {
    const stale: Partial<typeof VALID> = { ...VALID };
    delete stale.sectorCoverage;
    expect(() => ManagerSignalsResponseSchema.parse(stale)).toThrow();
  });
});
