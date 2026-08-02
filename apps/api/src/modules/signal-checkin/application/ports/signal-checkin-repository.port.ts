export interface RecordCheckinParams {
  institutionId: string;
  department: string;
  weekStart: Date;
  concerning: boolean;
  dedupKey: string;
}

export interface SignalCheckinRepository {
  recordCheckin(params: RecordCheckinParams): Promise<void>;
}

export const SIGNAL_CHECKIN_REPOSITORY = Symbol("SIGNAL_CHECKIN_REPOSITORY");

// Thrown by the repository when institutionId doesn't match any real Institution
// (a foreign-key violation on the Signal insert/update) — mapped to a 400 by the controller.
export class UnknownInstitutionError extends Error {}
