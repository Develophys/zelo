export interface ResultLocationState {
  scaleType: 'PHQ-9' | 'GAD-7';
  totalScore: number;
  max: number;
  riskSignal: boolean;
  /**
   * The scoring happened on-device and the record is durably in IndexedDB, but
   * the upload failed — so this check-in is missing from the institution's
   * anonymous aggregate. Optional because an older navigation state will not
   * carry it; absent is treated as uploaded.
   */
  pendingSync?: boolean;
}

export function isResultState(value: unknown): value is ResultLocationState {
  return (
    !!value &&
    typeof value === 'object' &&
    'scaleType' in value &&
    'totalScore' in value &&
    'max' in value &&
    'riskSignal' in value
  );
}
