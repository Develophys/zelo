export interface SignalRow {
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

export interface SignalRepository {
  findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]>;
}

export const SIGNAL_REPOSITORY = Symbol("SIGNAL_REPOSITORY");
