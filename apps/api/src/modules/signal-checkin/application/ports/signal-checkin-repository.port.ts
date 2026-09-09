export interface RecordCheckinParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  concerning: boolean;
  dedupKey: string;
}

export interface RecordAbandonmentParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  dedupKey: string;
}

export interface SignalCheckinRepository {
  /** The row's check-in count after the increment, or null when deduplicated. */
  recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null>;
  /** The row's abandoned count after the increment, or null when deduplicated. */
  recordAbandonment(params: RecordAbandonmentParams): Promise<{ abandoned: number } | null>;
}

export const SIGNAL_CHECKIN_REPOSITORY = Symbol("SIGNAL_CHECKIN_REPOSITORY");

// Thrown by the repository when institutionId or sectorId don't match a real
// Institution/Sector (a foreign-key violation on the Signal insert/update) —
// mapped to a 400 by the controller.
export class UnknownInstitutionOrSectorError extends Error {}
