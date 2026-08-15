export interface ResultLocationState {
  scaleType: 'PHQ-9' | 'GAD-7';
  totalScore: number;
  max: number;
  riskSignal: boolean;
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
