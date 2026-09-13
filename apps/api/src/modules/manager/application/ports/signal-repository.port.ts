export interface SignalRow {
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
  abandoned: number;
  unsentChatDrafts: number;
}

export interface WeeklySignalRow {
  institutionId: string;
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

export interface FollowUpTotals {
  sent: number;
  answered: number;
}

export interface SignalRepository {
  findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]>;

  /** Every institution's rows for the given weeks — this feeds the risk sweep, which is not scoped to one institution. */
  findAllForWeek(weekStarts: Date[]): Promise<WeeklySignalRow[]>;

  countBySector(sectorId: string): Promise<number>;

  /**
   * Summed real follow-up counters for exactly the given (already-visible)
   * sectors, at one week — kept separate from `findAll`'s heavier per-row
   * shape since only the reference week's total is ever needed here.
   */
  findFollowUpTotals(institutionId: string, sectorIds: string[], weekStart: Date): Promise<FollowUpTotals>;
}

export const SIGNAL_REPOSITORY = Symbol("SIGNAL_REPOSITORY");
