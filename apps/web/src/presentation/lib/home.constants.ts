import type { WeeklyHistoryPoint } from '@/use-cases/get-assessment-history.usecase';

export const EMPTY_POINTS: WeeklyHistoryPoint[] = Array.from({ length: 6 }, () => ({
  weekStart: '',
  severityFraction: null,
}));
