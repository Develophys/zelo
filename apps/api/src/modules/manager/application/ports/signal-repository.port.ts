export interface SignalRow {
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

export interface WeeklySignalRow {
  institutionId: string;
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

export interface SignalRepository {
  findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]>;

  /** Every institution's rows for the given weeks — this feeds the risk sweep, which is not scoped to one institution. */
  findAllForWeek(weekStarts: Date[]): Promise<WeeklySignalRow[]>;

  countBySector(sectorId: string): Promise<number>;
}

export const SIGNAL_REPOSITORY = Symbol("SIGNAL_REPOSITORY");
