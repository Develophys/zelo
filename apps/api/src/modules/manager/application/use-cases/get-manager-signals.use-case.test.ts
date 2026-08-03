import { describe, expect, it } from "vitest";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SignalRepository, SignalRow } from "../ports/signal-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../ports/simulated-follow-up-repository.port.ts";

class FakeSignalRepository implements SignalRepository {
  public lastCall: { institutionId: string; sectorIds: string[] } | null = null;
  constructor(private readonly rows: SignalRow[]) {}
  async findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]> {
    this.lastCall = { institutionId, sectorIds };
    return this.rows;
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
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.35 },
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5 },
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
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.5 },
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5 },
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
});
