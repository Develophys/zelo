import { describe, expect, it } from "vitest";
import { SweepSectorRiskUseCase } from "./sweep-sector-risk.use-case.ts";
import type { NotificationEvent, NotificationPublisher } from "../ports/notification.port.ts";
import { RISK_DELTA_THRESHOLD, RISK_MIN_CHECK_INS, RISK_RATE_THRESHOLD } from "../thresholds.ts";

class FakePublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

// The sweep runs Monday 03:00 UTC over the week that closed at Monday 00:00.
const NOW = new Date("2026-08-24T03:00:00.000Z");
const CLOSED_WEEK = new Date("2026-08-17T00:00:00.000Z");
const PRIOR_WEEK = new Date("2026-08-10T00:00:00.000Z");

type Row = {
  institutionId: string;
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
};

function row(weekStart: Date, checkIns: number, concerning: number, sectorId = "sector-1"): Row {
  return { institutionId: "institution-1", sectorId, sectorName: "UTI", weekStart, checkIns, concerning };
}

function build(rows: Row[]) {
  const publisher = new FakePublisher();
  const useCase = new SweepSectorRiskUseCase({ findAllForWeek: async () => rows } as never, publisher);
  return { useCase, publisher };
}

describe("SweepSectorRiskUseCase", () => {
  it("fires a level alert at or above the rate with a large enough denominator", async () => {
    const { useCase, publisher } = build([row(CLOSED_WEEK, 12, 5)]); // 41.7%

    await useCase.execute(NOW);

    expect(publisher.events).toHaveLength(1);
    expect(publisher.events[0]).toEqual({
      institutionId: "institution-1",
      type: "SECTOR_RISK_THRESHOLD",
      sectorId: "sector-1",
      payload: {
        trigger: "level",
        sectorName: "UTI",
        weekStart: "2026-08-17T00:00:00.000Z",
        rate: 5 / 12,
        checkIns: 12,
      },
      dedupKey: "sector-risk:sector-1:2026-08-17T00:00:00.000Z",
    });
  });

  // The whole reason RISK_MIN_CHECK_INS sits above the k-anonymity floor: at
  // n=6 one person is 16 points, so 50% here is noise, not a signal.
  it("stays quiet at a high rate when the denominator is too small", async () => {
    const { useCase, publisher } = build([row(CLOSED_WEEK, 6, 3)]); // 50%, n=6

    await useCase.execute(NOW);

    expect(publisher.events).toEqual([]);
  });

  it("stays quiet below the rate however large the denominator", async () => {
    const { useCase, publisher } = build([row(CLOSED_WEEK, 20, 6)]); // 30%, n=20

    await useCase.execute(NOW);

    expect(publisher.events).toEqual([]);
  });

  it("fires a delta alert on a steep week-over-week rise below the level threshold", async () => {
    const { useCase, publisher } = build([
      row(PRIOR_WEEK, 20, 3), // 15%
      row(CLOSED_WEEK, 20, 7), // 35% — +20 points, still under 40%
    ]);

    await useCase.execute(NOW);

    expect(publisher.events).toHaveLength(1);
    expect(publisher.events[0]!.payload).toMatchObject({ trigger: "delta" });
  });

  it("stays quiet on a small rise", async () => {
    const { useCase, publisher } = build([
      row(PRIOR_WEEK, 20, 6), // 30%
      row(CLOSED_WEEK, 20, 7), // 35% — +5 points
    ]);

    await useCase.execute(NOW);

    expect(publisher.events).toEqual([]);
  });

  it("does not compute a delta against a prior week too small to trust", async () => {
    const { useCase, publisher } = build([
      row(PRIOR_WEEK, 5, 0), // 0%, n=5
      row(CLOSED_WEEK, 20, 7), // 35%
    ]);

    await useCase.execute(NOW);

    expect(publisher.events).toEqual([]);
  });

  it("reports level rather than delta when both rules fire, and sends one notification", async () => {
    const { useCase, publisher } = build([
      row(PRIOR_WEEK, 20, 3), // 15%
      row(CLOSED_WEEK, 20, 9), // 45% — over the level AND +30 points
    ]);

    await useCase.execute(NOW);

    expect(publisher.events).toHaveLength(1);
    expect(publisher.events[0]!.payload).toMatchObject({ trigger: "level" });
  });

  it("evaluates each sector independently", async () => {
    const { useCase, publisher } = build([
      row(CLOSED_WEEK, 12, 5, "sector-1"), // fires
      row(CLOSED_WEEK, 12, 2, "sector-2"), // does not
    ]);

    await useCase.execute(NOW);

    expect(publisher.events.map((e) => e.sectorId)).toEqual(["sector-1"]);
  });

  // Boundary pins. thresholds.ts is documented as the seam AppSettings will
  // later replace, so these comparisons will be edited again by someone
  // without today's context. Flipping any `>=` to `>` (or the current-week
  // `checkIns < RISK_MIN_CHECK_INS` skip to `<=`) must fail one of these,
  // even though it passes every test above. Fixtures are derived from the
  // thresholds rather than hardcoded, so a future change to the constants
  // does not silently make these stop testing the boundary.
  describe("boundary pins", () => {
    it("fires level exactly at RISK_RATE_THRESHOLD, isolated from the check-ins boundary", async () => {
      // checkIns well above RISK_MIN_CHECK_INS so this cannot be saved by a
      // `checkIns < MIN` -> `<=` mutation; only pins `rate >= RATE_THRESHOLD`.
      const checkIns = RISK_MIN_CHECK_INS * 3;
      const concerning = Math.round(RISK_RATE_THRESHOLD * checkIns);
      const rate = concerning / checkIns;
      expect(rate).toBe(RISK_RATE_THRESHOLD); // fixture sanity: exact, not "close to"

      const { useCase, publisher } = build([row(CLOSED_WEEK, checkIns, concerning)]);
      await useCase.execute(NOW);

      expect(publisher.events).toHaveLength(1);
      expect(publisher.events[0]!.payload).toMatchObject({ trigger: "level" });
    });

    it("still evaluates a sector at exactly RISK_MIN_CHECK_INS check-ins, not just above it", async () => {
      // Rate is unambiguously above threshold (100%) so this pins only the
      // `checkIns < RISK_MIN_CHECK_INS` skip, not the rate comparison.
      const checkIns = RISK_MIN_CHECK_INS;
      const concerning = checkIns;

      const { useCase, publisher } = build([row(CLOSED_WEEK, checkIns, concerning)]);
      await useCase.execute(NOW);

      expect(publisher.events).toHaveLength(1);
    });

    it("fires delta on a rise of exactly RISK_DELTA_THRESHOLD off a prior week at exactly RISK_MIN_CHECK_INS", async () => {
      // previousRate pinned at 0 (0 / RISK_MIN_CHECK_INS) so the subtraction
      // that computes the rise introduces no floating-point rounding of its
      // own; rate alone is set to land exactly on RISK_DELTA_THRESHOLD. This
      // pins both the prior-week eligibility (`previous.checkIns >= MIN`)
      // and the delta comparison in one fixture. Current week's checkIns is
      // well above MIN so the level rule cannot fire and mask a broken delta
      // comparison.
      const priorCheckIns = RISK_MIN_CHECK_INS;
      const priorConcerning = 0;
      const checkIns = RISK_MIN_CHECK_INS * 2;
      const concerning = Math.round(RISK_DELTA_THRESHOLD * checkIns);
      const rate = concerning / checkIns;
      expect(rate).toBe(RISK_DELTA_THRESHOLD); // fixture sanity
      expect(rate).toBeLessThan(RISK_RATE_THRESHOLD); // isolates delta from level

      const { useCase, publisher } = build([
        row(PRIOR_WEEK, priorCheckIns, priorConcerning),
        row(CLOSED_WEEK, checkIns, concerning),
      ]);
      await useCase.execute(NOW);

      expect(publisher.events).toHaveLength(1);
      expect(publisher.events[0]!.payload).toMatchObject({ trigger: "delta" });
    });
  });
});
