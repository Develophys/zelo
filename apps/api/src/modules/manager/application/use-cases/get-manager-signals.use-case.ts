import { Inject, Injectable } from "@nestjs/common";
import { K_ANONYMITY_THRESHOLD } from "../constants.ts";
import { SIGNAL_REPOSITORY, type SignalRepository, type SignalRow } from "../ports/signal-repository.port.ts";
import {
  SIMULATED_FOLLOW_UP_REPOSITORY,
  type SimulatedFollowUpRepository,
} from "../ports/simulated-follow-up-repository.port.ts";

export interface ManagerSignalsResponse {
  overallConcerningRate: number;
  checkInsLast4Weeks: number;
  weeklyTrend: { weekStart: string; concerningRate: number }[];
  segments: { label: string; value: number; n: number }[];
  followUpResponseRate: number;
}

const RECENT_WEEKS_FOR_VOLUME = 4;
const EMPTY_RESPONSE: Omit<ManagerSignalsResponse, "followUpResponseRate"> = {
  overallConcerningRate: 0,
  checkInsLast4Weeks: 0,
  weeklyTrend: [],
  segments: [],
};

/**
 * The newest week where some sector clears the k-anonymity threshold, or null
 * when no week does. Walking back from the newest is what stops a partial
 * current week from deciding visibility for every sector.
 */
function referenceWeek(bySector: Map<string, SignalRow[]>): number | null {
  const weeks = [...new Set([...bySector.values()].flat().map((r) => r.weekStart.getTime()))].sort(
    (a, b) => b - a,
  );

  for (const week of weeks) {
    for (const sectorRows of bySector.values()) {
      const row = sectorRows.find((r) => r.weekStart.getTime() === week);
      if (row && row.checkIns >= K_ANONYMITY_THRESHOLD) return week;
    }
  }
  return null;
}

@Injectable()
export class GetManagerSignalsUseCase {
  constructor(
    @Inject(SIGNAL_REPOSITORY) private readonly repository: SignalRepository,
    @Inject(SIMULATED_FOLLOW_UP_REPOSITORY) private readonly followUpRepository: SimulatedFollowUpRepository,
  ) {}

  async execute(institutionId: string, sectorIds: string[]): Promise<ManagerSignalsResponse> {
    const followUpResponseRate = await this.computeFollowUpResponseRate();

    if (sectorIds.length === 0) {
      return { ...EMPTY_RESPONSE, followUpResponseRate };
    }

    const rows = await this.repository.findAll(institutionId, sectorIds);
    if (rows.length === 0) {
      return { ...EMPTY_RESPONSE, followUpResponseRate };
    }

    const bySector = new Map<string, SignalRow[]>();
    for (const row of rows) {
      const list = bySector.get(row.sectorId) ?? [];
      list.push(row);
      bySector.set(row.sectorId, list);
    }

    // The newest week is not automatically the reference week. A week in
    // progress is partial by definition — on a Monday every sector has almost
    // no check-ins, and a single doctor checking in creates a 1-check-in row
    // that is newer than everything else. Anchoring to it would suppress every
    // sector at once and blank the whole dashboard: observed as a filter
    // returning less than a strict subset of itself, and it would recur at the
    // start of every week.
    //
    // So: the most recent week in which at least one sector actually reaches k.
    // That keeps the single shared reference week the segments depend on, and
    // keeps a suppressed sector out of every aggregate.
    const mostRecentWeek = referenceWeek(bySector);
    if (mostRecentWeek === null) {
      return { ...EMPTY_RESPONSE, followUpResponseRate };
    }

    // A sector is either fully visible or fully suppressed, decided solely by
    // its most-recent-week check-in count. Every downstream aggregate reads
    // from this one set, so a narrow sectorIds filter can never leak an
    // under-k sector's numbers through the institution-wide sums.
    const visibleSectorIds = new Set<string>();
    for (const [sectorId, sectorRows] of bySector) {
      const currentWeekRow = sectorRows.find((r) => r.weekStart.getTime() === mostRecentWeek);
      if (currentWeekRow && currentWeekRow.checkIns >= K_ANONYMITY_THRESHOLD) {
        visibleSectorIds.add(sectorId);
      }
    }

    const segments: { label: string; value: number; n: number }[] = [];
    let visibleConcerning = 0;
    let visibleCheckIns = 0;

    for (const sectorId of visibleSectorIds) {
      const currentWeekRow = bySector.get(sectorId)!.find((r) => r.weekStart.getTime() === mostRecentWeek)!;

      segments.push({
        label: currentWeekRow.sectorName,
        value: Math.round((currentWeekRow.concerning / currentWeekRow.checkIns) * 100),
        n: currentWeekRow.checkIns,
      });
      visibleConcerning += currentWeekRow.concerning;
      visibleCheckIns += currentWeekRow.checkIns;
    }

    const overallConcerningRate = visibleCheckIns === 0 ? 0 : visibleConcerning / visibleCheckIns;

    const visibleRows = rows.filter((r) => visibleSectorIds.has(r.sectorId));
    const weekTimes = [...new Set(visibleRows.map((r) => r.weekStart.getTime()))].sort((a, b) => a - b);

    const recentWeekTimes = new Set(weekTimes.slice(-RECENT_WEEKS_FOR_VOLUME));
    const checkInsLast4Weeks = visibleRows
      .filter((r) => recentWeekTimes.has(r.weekStart.getTime()))
      .reduce((sum, r) => sum + r.checkIns, 0);

    const weeklyTrend = weekTimes.map((weekTime) => {
      const weekRows = visibleRows.filter((r) => r.weekStart.getTime() === weekTime);
      const totalCheckIns = weekRows.reduce((sum, r) => sum + r.checkIns, 0);
      const totalConcerning = weekRows.reduce((sum, r) => sum + r.concerning, 0);
      return {
        weekStart: new Date(weekTime).toISOString(),
        concerningRate: totalCheckIns === 0 ? 0 : totalConcerning / totalCheckIns,
      };
    });

    return { overallConcerningRate, checkInsLast4Weeks, weeklyTrend, segments, followUpResponseRate };
  }

  private async computeFollowUpResponseRate(): Promise<number> {
    const rows = await this.followUpRepository.findAll();
    if (rows.length === 0) return 0;

    const mostRecent = rows.reduce((latest, row) => (row.weekStart > latest.weekStart ? row : latest));
    return mostRecent.sent === 0 ? 0 : mostRecent.responded / mostRecent.sent;
  }
}
