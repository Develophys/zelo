import { describe, expect, it } from "vitest";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SignalRepository, SignalRow } from "../ports/signal-repository.port.ts";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "../ports/simulated-follow-up-repository.port.ts";

class FakeSignalRepository implements SignalRepository {
  public lastInstitutionId: string | null = null;
  constructor(private readonly rows: SignalRow[]) {}
  async findAll(institutionId: string): Promise<SignalRow[]> {
    this.lastInstitutionId = institutionId;
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
  it("passes the given institutionId through to the repository", async () => {
    const repository = new FakeSignalRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    await useCase.execute("institution-1");

    expect(repository.lastInstitutionId).toBe("institution-1");
  });

  it("computes segments from the most recent week only, excluding departments under k=5", async () => {
    const repository = new FakeSignalRepository([
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { department: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
      { department: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.segments).toEqual(
      expect.arrayContaining([
        { label: "A", value: 60, n: 10 },
        { label: "B", value: 40, n: 10 },
      ]),
    );
    expect(result.segments).toHaveLength(2); // "C" (n=4) suppressed
  });

  it("computes overallConcerningRate from only the visible departments' most recent week", async () => {
    const repository = new FakeSignalRepository([
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.overallConcerningRate).toBe(0.5); // (6+4)/(10+10), C excluded
  });

  it("computes weeklyTrend and checkInsLast4Weeks as org-wide sums including the suppressed department", async () => {
    const repository = new FakeSignalRepository([
      { department: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.weeklyTrend).toEqual([
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.375 }, // (3+4+2)/(10+10+4)
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5 }, // (6+4+2)/(10+10+4)
    ]);
    expect(result.checkInsLast4Weeks).toBe(48); // both weeks, all 3 departments: 24+24
  });

  it("sums only the trailing 4 weeks for checkInsLast4Weeks when more than 4 weeks exist", async () => {
    const weeks = [
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-08T00:00:00.000Z"),
      new Date("2026-06-15T00:00:00.000Z"),
      new Date("2026-06-22T00:00:00.000Z"),
      new Date("2026-06-29T00:00:00.000Z"),
    ];
    const repository = new FakeSignalRepository(
      weeks.map((weekStart) => ({ department: "A", weekStart, checkIns: 10, concerning: 5 })),
    );
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.checkInsLast4Weeks).toBe(40); // trailing 4 of 5 weeks, not all 5 (which would be 50)
    expect(result.weeklyTrend).toHaveLength(5); // but the trend still returns every week
  });

  it("returns 0 for overallConcerningRate (not NaN) when every department is suppressed", async () => {
    const repository = new FakeSignalRepository([
      { department: "Tiny", weekStart: WEEK_2, checkIns: 2, concerning: 1 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result.segments).toEqual([]);
    expect(result.overallConcerningRate).toBe(0);
    expect(result.checkInsLast4Weeks).toBe(2); // org-wide sum still includes the suppressed dept
  });

  it("returns all-zero/empty output for an unseeded (empty) database, without crashing", async () => {
    const repository = new FakeSignalRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository, new FakeSimulatedFollowUpRepository([]));

    const result = await useCase.execute("institution-1");

    expect(result).toEqual({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
    });
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

    const result = await useCase.execute("institution-1");

    expect(result.followUpResponseRate).toBe(0.75); // WEEK_2 (most recent): 15/20
  });

  it("returns 0, not NaN, when the most recent week's sent is 0", async () => {
    const repository = new FakeSignalRepository([]);
    const followUpRepository = new FakeSimulatedFollowUpRepository([{ weekStart: WEEK_2, sent: 0, responded: 0 }]);
    const useCase = new GetManagerSignalsUseCase(repository, followUpRepository);

    const result = await useCase.execute("institution-1");

    expect(result.followUpResponseRate).toBe(0);
  });

  it("returns 0 when there is no follow-up data at all", async () => {
    const repository = new FakeSignalRepository([]);
    const followUpRepository = new FakeSimulatedFollowUpRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository, followUpRepository);

    const result = await useCase.execute("institution-1");

    expect(result.followUpResponseRate).toBe(0);
  });
});
