export interface RecordSignalIncrementParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  dedupKey: string;
  increments: Partial<{ checkIns: number; concerning: number; abandoned: number; unsentChatDrafts: number }>;
}

export interface SignalCounters {
  checkIns: number;
  concerning: number;
  abandoned: number;
  unsentChatDrafts: number;
}

export interface SignalCheckinRepository {
  /** The row's counters after the increment, or null when deduplicated. */
  recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null>;
}

export const SIGNAL_CHECKIN_REPOSITORY = Symbol("SIGNAL_CHECKIN_REPOSITORY");

// Thrown by the repository when institutionId or sectorId don't match a real
// Institution/Sector (a foreign-key violation on the Signal insert/update) —
// mapped to a 400 by the controller.
export class UnknownInstitutionOrSectorError extends Error {}
