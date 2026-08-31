export interface TrendPoint {
  weekStart: string;
  concerningRate: number;
}

export interface TrendBar {
  height: number;
  isZero: boolean;
}

// A zero week is a real reading and must not be drawn at the same height as a
// low-but-nonzero one. It keeps a hairline so the column still reads as a slot
// on the axis, and the accessible description says the number outright.
const ZERO_BAR_HEIGHT = 2;
const MIN_NONZERO_BAR_HEIGHT = 8;

export function toTrendBars(trend: TrendPoint[]): TrendBar[] {
  return trend.map((point) => {
    const percent = Math.round(point.concerningRate * 100);
    return percent === 0
      ? { height: ZERO_BAR_HEIGHT, isZero: true }
      : { height: Math.min(100, Math.max(MIN_NONZERO_BAR_HEIGHT, percent)), isZero: false };
  });
}

export function weekLabel(weekStart: string): string {
  if (!weekStart) return '';
  const date = new Date(weekStart);
  if (Number.isNaN(date.getTime())) return '';
  // weekStart is a UTC week boundary. Formatting it in local time shifts the
  // label a day for anyone behind UTC — including all of Brazil.
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function describeTrendWeek(point: TrendPoint, index: number, latestIndex: number): string {
  const label = weekLabel(point.weekStart);
  const percent = Math.round(point.concerningRate * 100);
  const suffix = index === latestIndex ? ' (mais recente)' : '';
  const week = label ? `Semana de ${label}` : `Semana ${index + 1}`;
  return `${week}: ${percent}%${suffix}`;
}

export function describeSegment(segment: { label: string; value: number; n: number }): string {
  return `${segment.label}: ${segment.value}%, ${segment.n} ${
    segment.n === 1 ? 'resposta' : 'respostas'
  }`;
}

/**
 * Which week carries the most signals, or -1 if none does.
 *
 * Relative, not threshold-based. Painting every bar `bg-brand` made a sector at
 * 90% draw a long, healthy-looking sage bar, so a coordinator scanning for the
 * worst one was scanning for the longest *green* bar. Marking the highest says
 * "this is the peak here" without claiming what counts as bad — which PRODUCT.md
 * lists as an open question. It is the same relative treatment the médico's own
 * chart already uses.
 */
export function peakTrendIndex(trend: TrendPoint[]): number {
  let peak = -1;
  let highest = 0;
  trend.forEach((point, index) => {
    if (point.concerningRate > highest) {
      highest = point.concerningRate;
      peak = index;
    }
  });
  return peak;
}

/** The sector carrying the most signals, or null if none does. */
export function peakSegmentLabel(
  segments: readonly { label: string; value: number; n: number }[],
): string | null {
  let peak: string | null = null;
  let highest = 0;
  for (const segment of segments) {
    if (segment.value > highest) {
      highest = segment.value;
      peak = segment.label;
    }
  }
  return peak;
}
