export interface RecordCheckinParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  concerning: boolean;
  dedupKey: string;
}

export interface SignalCheckinRepository {
  recordCheckin(params: RecordCheckinParams): Promise<void>;
}

export const SIGNAL_CHECKIN_REPOSITORY = Symbol("SIGNAL_CHECKIN_REPOSITORY");

// Thrown by the repository when institutionId or sectorId don't match a real
// Institution/Sector (a foreign-key violation on the Signal insert/update) —
// mapped to a 400 by the controller.
export class UnknownInstitutionOrSectorError extends Error {}
