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

@Injectable()
export class GetManagerSignalsUseCase {
  constructor(
    @Inject(SIGNAL_REPOSITORY) private readonly repository: SignalRepository,
    @Inject(SIMULATED_FOLLOW_UP_REPOSITORY) private readonly followUpRepository: SimulatedFollowUpRepository,
  ) {}

  async execute(institutionId: string): Promise<ManagerSignalsResponse> {
    const rows = await this.repository.findAll(institutionId);
    // NOT institution-scoped — see technical-debt.md TD-003. SimulatedFollowUp has no
    // institutionId; every institution currently shares this one KPI.
    const followUpResponseRate = await this.computeFollowUpResponseRate();

    if (rows.length === 0) {
      return { overallConcerningRate: 0, checkInsLast4Weeks: 0, weeklyTrend: [], segments: [], followUpResponseRate };
    }

    const weekTimes = [...new Set(rows.map((r) => r.weekStart.getTime()))].sort((a, b) => a - b);
    const mostRecentWeek = weekTimes[weekTimes.length - 1]!;

    const byDepartment = new Map<string, SignalRow[]>();
    for (const row of rows) {
      const list = byDepartment.get(row.department) ?? [];
      list.push(row);
      byDepartment.set(row.department, list);
    }

    const segments: { label: string; value: number; n: number }[] = [];
    let visibleConcerning = 0;
    let visibleCheckIns = 0;

    for (const [department, deptRows] of byDepartment) {
      const currentWeekRow = deptRows.find((r) => r.weekStart.getTime() === mostRecentWeek);
      if (!currentWeekRow || currentWeekRow.checkIns < K_ANONYMITY_THRESHOLD) continue;

      segments.push({
        label: department,
        value: Math.round((currentWeekRow.concerning / currentWeekRow.checkIns) * 100),
        n: currentWeekRow.checkIns,
      });
      visibleConcerning += currentWeekRow.concerning;
      visibleCheckIns += currentWeekRow.checkIns;
    }

    const overallConcerningRate = visibleCheckIns === 0 ? 0 : visibleConcerning / visibleCheckIns;

    const recentWeekTimes = new Set(weekTimes.slice(-RECENT_WEEKS_FOR_VOLUME));
    const checkInsLast4Weeks = rows
      .filter((r) => recentWeekTimes.has(r.weekStart.getTime()))
      .reduce((sum, r) => sum + r.checkIns, 0);

    const weeklyTrend = weekTimes.map((weekTime) => {
      const weekRows = rows.filter((r) => r.weekStart.getTime() === weekTime);
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
