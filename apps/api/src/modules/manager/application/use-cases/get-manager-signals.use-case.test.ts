import { describe, expect, it } from "vitest";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SignalRepository, SignalRow, WeeklySignalRow } from "../ports/signal-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../ports/simulated-follow-up-repository.port.ts";

class FakeSignalRepository implements SignalRepository {
  public lastCall: { institutionId: string; sectorIds: string[] } | null = null;
  constructor(private readonly rows: SignalRow[]) {}
  async findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]> {
    this.lastCall = { institutionId, sectorIds };
    return this.rows;
  }
  async findAllForWeek(): Promise<WeeklySignalRow[]> {
    throw new Error("not used in this test");
  }
  async countBySector(): Promise<never> {
    throw new Error("not used in this test");
  }
}

class FakeSimulatedFollowUpRepository implements SimulatedFollowUpRepository {
  constructor(private readonly rows: SimulatedFollowUpRow[]) {}
  async findAll(): Promise<SimulatedFollowUpRow[]> {
    return this.rows;
  }
}

const WEEK_1 = new Date("2026-06-15T00:00:00.000Z");
const WEEK_2 = new Date("2026-06-22T00:00:00.000Z"); // most recent

function makeUseCase(rows: SignalRow[]) {
  return new GetManagerSignalsUseCase(new FakeSignalRepository(rows), new FakeSimulatedFollowUpRepository([]));
}

describe("GetManagerSignalsUseCase", () => {
  it("passes the given institutionId and sectorIds through to the repository", async () => {
    const repository = new FakeSignalRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    await useCase.execute("institution-1", ["sector-a", "sector-b"]);

    expect(repository.lastCall).toEqual({ institutionId: "institution-1", sectorIds: ["sector-a", "sector-b"] });
  });

  it("returns the all-zero response without calling the repository when sectorIds is empty", async () => {
    const repository = new FakeSignalRepository([{ sectorId: "x", sectorName: "X", weekStart: WEEK_1, checkIns: 10, concerning: 5 }]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", []);

    expect(result).toEqual({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
      sectorCoverage: { visible: 0, total: 0 },
    });
    expect(repository.lastCall).toBeNull();
  });

  it("computes segments from the most recent week only, excluding sectors under k=5, labeling by sectorName", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["a", "b", "c"]);

    expect(result.segments).toEqual(
      expect.arrayContaining([
        { label: "A", value: 60, n: 10 },
        { label: "B", value: 40, n: 10 },
      ]),
    );
    expect(result.segments).toHaveLength(2); // "C" (n=4) suppressed
  });

  it("computes overallConcerningRate from only the visible sectors' most recent week", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["a", "b", "c"]);

    expect(result.overallConcerningRate).toBe(0.5); // (6+4)/(10+10), C excluded
  });

  it("computes weeklyTrend and checkInsLast4Weeks from the visible sectors only, excluding every week of a suppressed sector", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "a", sectorName: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
      { sectorId: "b", sectorName: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["a", "b", "c"]);

    // "C" is suppressed in every week, so its 4+4 check-ins never reach the sums.
    expect(result.weeklyTrend).toEqual([
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.35, checkIns: 20, concerning: 7 },
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5, checkIns: 20, concerning: 10 },
    ]);
    expect(result.checkInsLast4Weeks).toBe(40);
  });

  it("keeps a visible sector's earlier weeks in the sums even when that week was under k=5, matching how segments decides visibility", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "a", sectorName: "A", weekStart: WEEK_1, checkIns: 2, concerning: 1 },
      { sectorId: "a", sectorName: "A", weekStart: WEEK_2, checkIns: 10, concerning: 5 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["a"]);

    expect(result.weeklyTrend).toEqual([
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.5, checkIns: 2, concerning: 1 },
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5, checkIns: 10, concerning: 5 },
    ]);
    expect(result.checkInsLast4Weeks).toBe(12);
  });

  it("returns 0 for overallConcerningRate (not NaN) when every sector is suppressed", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "tiny", sectorName: "Tiny", weekStart: WEEK_2, checkIns: 2, concerning: 1 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["tiny"]);

    expect(result.segments).toEqual([]);
    expect(result.overallConcerningRate).toBe(0);
    expect(result.checkInsLast4Weeks).toBe(0);
  });

  it("suppresses weeklyTrend and checkInsLast4Weeks entirely when the sector filter narrows to a single under-k sector", async () => {
    const repository = new FakeSignalRepository([
      { sectorId: "c", sectorName: "C", weekStart: WEEK_1, checkIns: 3, concerning: 2 },
      { sectorId: "c", sectorName: "C", weekStart: WEEK_2, checkIns: 4, concerning: 3 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["c"]);

    expect(result.segments).toEqual([]);
    expect(result.overallConcerningRate).toBe(0);
    expect(result.weeklyTrend).toEqual([]);
    expect(result.checkInsLast4Weeks).toBe(0);
  });

  it("carries the denominator of every trend week, so a rate can be read against its base", async () => {
    const rows = [
      { sectorId: "s1", sectorName: "UTI", weekStart: new Date("2026-08-24T00:00:00.000Z"), checkIns: 10, concerning: 4 },
      { sectorId: "s1", sectorName: "UTI", weekStart: new Date("2026-08-31T00:00:00.000Z"), checkIns: 20, concerning: 9 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["s1"]);

    expect(result.weeklyTrend).toEqual([
      { weekStart: "2026-08-24T00:00:00.000Z", concerningRate: 0.4, checkIns: 10, concerning: 4 },
      { weekStart: "2026-08-31T00:00:00.000Z", concerningRate: 0.45, checkIns: 20, concerning: 9 },
    ]);
  });

  // A garantia mais importante do produto não pode depender de leitura de
  // código: um setor abaixo do limiar fica fora de TODOS os agregados,
  // inclusive do denominador da tendência, onde seria fácil vazá-lo.
  it("keeps a sub-threshold sector out of the trend denominators entirely", async () => {
    const week = new Date("2026-08-31T00:00:00.000Z");
    const rows = [
      { sectorId: "visible", sectorName: "UTI", weekStart: week, checkIns: 20, concerning: 9 },
      { sectorId: "hidden", sectorName: "Pediatria", weekStart: week, checkIns: 3, concerning: 3 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["visible", "hidden"]);

    expect(result.weeklyTrend).toHaveLength(1);
    expect(result.weeklyTrend[0]!.checkIns).toBe(20);
    expect(result.weeklyTrend[0]!.concerning).toBe(9);
    expect(result.segments.map((s) => s.label)).toEqual(["UTI"]);
  });

  it("reports how many sectors the reading covers and how many are suppressed", async () => {
    const week = new Date("2026-08-31T00:00:00.000Z");
    const rows = [
      { sectorId: "a", sectorName: "UTI", weekStart: week, checkIns: 20, concerning: 9 },
      { sectorId: "b", sectorName: "PS", weekStart: week, checkIns: 8, concerning: 2 },
      { sectorId: "c", sectorName: "Pediatria", weekStart: week, checkIns: 3, concerning: 1 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["a", "b", "c"]);

    expect(result.sectorCoverage).toEqual({ visible: 2, total: 3 });
  });

  // Quando nenhum setor chega ao limiar a página fica vazia, e "0 de 0" leria
  // como "esta instituição não tem setores" — que é outra coisa.
  it("still reports the total when every sector is suppressed", async () => {
    const week = new Date("2026-08-31T00:00:00.000Z");
    const rows = [
      { sectorId: "a", sectorName: "UTI", weekStart: week, checkIns: 2, concerning: 1 },
      { sectorId: "b", sectorName: "PS", weekStart: week, checkIns: 1, concerning: 0 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["a", "b"]);

    expect(result.sectorCoverage).toEqual({ visible: 0, total: 2 });
    expect(result.segments).toEqual([]);
  });

  it("reports the requested sector count as the total when there is no data at all", async () => {
    const useCase = makeUseCase([]);

    const result = await useCase.execute("inst-1", ["a"]);

    expect(result.sectorCoverage).toEqual({ visible: 0, total: 1 });
  });

  it("counts a sector that has never had a single check-in toward the total, not just sectors with rows", async () => {
    const week = new Date("2026-08-31T00:00:00.000Z");
    const rows = [{ sectorId: "a", sectorName: "UTI", weekStart: week, checkIns: 20, concerning: 9 }];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["a", "never-checked-in"]);

    expect(result.sectorCoverage).toEqual({ visible: 1, total: 2 });
  });
});

describe("GetManagerSignalsUseCase - followUpResponseRate", () => {
  it("computes the rate from the most recent week only", async () => {
    const repository = new FakeSignalRepository([]);
    const followUpRepository = new FakeSimulatedFollowUpRepository([
      { weekStart: WEEK_1, sent: 20, responded: 5 },
      { weekStart: WEEK_2, sent: 20, responded: 15 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, followUpRepository);

    const result = await useCase.execute("institution-1", ["a"]);

    expect(result.followUpResponseRate).toBe(0.75);
  });

  it("does not blank the whole dashboard because one sector has a fresh under-k week", async () => {
    // A real check-in writes a Signal row for the CURRENT ISO week with a
    // handful of check-ins. That row is newer than every other sector's latest
    // week, so it becomes `mostRecentWeek` — and because no sector reaches k in
    // it, every sector is suppressed and the response collapses to zeros.
    //
    // Observed in the demo institution: filtering to two sectors returned
    // 50% / 72, while a strict superset of those two returned 0% / 0.
    const WEEK_3 = new Date("2026-06-29T00:00:00.000Z"); // newer than WEEK_2
    const repository = new FakeSignalRepository([
      { sectorId: "busy", sectorName: "Plantão noturno", weekStart: WEEK_1, checkIns: 18, concerning: 9 },
      { sectorId: "busy", sectorName: "Plantão noturno", weekStart: WEEK_2, checkIns: 18, concerning: 9 },
      // One doctor checked in this week in a different sector.
      { sectorId: "fresh", sectorName: "UTI", weekStart: WEEK_3, checkIns: 1, concerning: 1 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1", ["busy", "fresh"]);

    // The busy sector still has 18 check-ins in its own most recent week; a
    // single under-k row elsewhere must not erase it.
    expect(result.segments).toEqual([{ label: "Plantão noturno", value: 50, n: 18 }]);
    expect(result.checkInsLast4Weeks).toBeGreaterThan(0);
  });

  it("stays monotonic: adding a sector never returns less than the subset did", async () => {
    const WEEK_3 = new Date("2026-06-29T00:00:00.000Z");
    const rows: SignalRow[] = [
      { sectorId: "busy", sectorName: "Plantão noturno", weekStart: WEEK_2, checkIns: 18, concerning: 9 },
      { sectorId: "fresh", sectorName: "UTI", weekStart: WEEK_3, checkIns: 1, concerning: 1 },
    ];
    const useCase = new GetManagerSignalsUseCase(
      new FakeSignalRepository(rows.filter((r) => r.sectorId === "busy")),
      new FakeSimulatedFollowUpRepository([]),
    );
    const subset = await useCase.execute("institution-1", ["busy"]);

    const allUseCase = new GetManagerSignalsUseCase(
      new FakeSignalRepository(rows),
      new FakeSimulatedFollowUpRepository([]),
    );
    const all = await allUseCase.execute("institution-1", ["busy", "fresh"]);

    expect(all.checkInsLast4Weeks).toBeGreaterThanOrEqual(subset.checkInsLast4Weeks);
  });
});
