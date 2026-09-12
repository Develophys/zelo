import type { WeeklyHistoryPoint } from '@/use-cases/get-assessment-history.usecase';
import { bandForSeverityFraction } from './band-for';

const MIN_BAR_HEIGHT = 8;
const EMPTY_BAR_HEIGHT = 6;

export function toBarHeights(points: WeeklyHistoryPoint[]): { height: number; hasData: boolean }[] {
  return points.map((point) =>
    point.severityFraction === null
      ? { height: EMPTY_BAR_HEIGHT, hasData: false }
      : {
          height: Math.min(100, Math.max(MIN_BAR_HEIGHT, Math.round(point.severityFraction * 100))),
          hasData: true,
        },
  );
}

export function findPeakIndex(points: WeeklyHistoryPoint[]): number {
  let peakIndex = -1;
  let peakValue = -1;
  points.forEach((point, index) => {
    if (point.severityFraction !== null && point.severityFraction > peakValue) {
      peakValue = point.severityFraction;
      peakIndex = index;
    }
  });
  return peakIndex;
}

export function mostRecentAssessmentPoint(points: WeeklyHistoryPoint[]): WeeklyHistoryPoint | null {
  const withData = points.filter(
    (point) => point.severityFraction !== null && point.weekStart !== '',
  );
  if (withData.length === 0) return null;
  return withData[withData.length - 1]!;
}

export function mostRecentAssessmentDate(points: WeeklyHistoryPoint[]): Date | null {
  const point = mostRecentAssessmentPoint(points);
  return point ? new Date(point.weekStart) : null;
}

export function describeHistoryWeek(
  point: WeeklyHistoryPoint,
  index: number,
  latestIndex: number,
  peakIndex: number,
): string {
  if (!point.weekStart) return 'Semana sem dado';

  // weekStart is UTC midnight; formatting in local time pushed the label a day back everywhere west of Greenwich (all of Brazil).
  const label = new Date(point.weekStart).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  if (point.severityFraction === null) return `Semana de ${label}: sem check-in`;

  const status = index === latestIndex ? ' (mais recente)' : index === peakIndex ? ' (pico)' : '';
  const band = bandForSeverityFraction(point.severityFraction).label;
  return `Semana de ${label}: ${Math.round(point.severityFraction * 100)}% — ${band}${status}`;
}
