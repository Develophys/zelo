export interface TrendPoint {
  weekStart: string;
  concerningRate: number;
  checkIns: number;
  concerning: number;
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

// Padding the domain rather than scaling to the series' exact min/max: a
// straight min->max stretch draws a 6-point move and an 80-point move as the
// same "empty to full" shape, which is its own kind of misleading. Padding
// both ends means the shortest bar still reads as "some room below it" and
// the tallest as "some room above it" — only a swing that genuinely spans
// most of the scale gets to use most of the plot.
const CHART_DOMAIN_PADDING = 10;

/**
 * Bar proportions for both breakpoints, scaled to a padded version of the
 * series' own range rather than the fixed 0-100 axis `toTrendBars` draws
 * (kept only for its `isZero` flag now that mobile shares this scale too). A
 * realistic 40%-46% swing is real movement, but on a literal scale it is a
 * few pixels of an already-short bar — the printed percentage above each bar
 * states the number, the shape still has to show the trend. Real zero weeks
 * keep the same floor `toTrendBars` uses, since a zero reading is true
 * regardless of the rest of the series.
 */
export function toTrendBarHeights(trend: TrendPoint[]): number[] {
  const percents = trend.map((point) => Math.round(point.concerningRate * 100));
  const nonZero = percents.filter((percent) => percent > 0);

  if (nonZero.length === 0) return percents.map(() => ZERO_BAR_HEIGHT);

  const max = Math.max(...nonZero);
  const min = Math.min(...nonZero);
  const lo = Math.max(0, min - CHART_DOMAIN_PADDING);
  const hi = Math.min(100, max + CHART_DOMAIN_PADDING);
  const range = hi - lo;

  return percents.map((percent) => {
    if (percent === 0) return ZERO_BAR_HEIGHT;
    if (range <= 0) return 60;
    const normalized = (percent - lo) / range;
    return Math.round(Math.min(100, Math.max(MIN_NONZERO_BAR_HEIGHT, normalized * 100)));
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

export interface TrendWeekDetail {
  weekLabel: string;
  percent: number;
  concerning: number;
  checkIns: number;
  deltaPoints: number | null;
  isPeak: boolean;
  isLatest: boolean;
}

export function trendWeekDetail(
  trend: TrendPoint[],
  index: number,
  peakIndex: number,
): TrendWeekDetail {
  const point = trend[index]!;
  const previous = index > 0 ? trend[index - 1] : undefined;
  const percent = Math.round(point.concerningRate * 100);
  return {
    weekLabel: weekLabel(point.weekStart),
    percent,
    concerning: point.concerning,
    checkIns: point.checkIns,
    deltaPoints: previous ? percent - Math.round(previous.concerningRate * 100) : null,
    isPeak: index === peakIndex,
    isLatest: index === trend.length - 1,
  };
}

/**
 * Nome acessível de uma barra. Sai da mesma estrutura que a bolha do tooltip
 * renderiza, para que o que o leitor de tela ouve e o que o mouse mostra não
 * possam divergir.
 */
export function describeTrendWeek(detail: TrendWeekDetail): string {
  const week = detail.weekLabel ? `Semana de ${detail.weekLabel}` : 'Semana';
  const base = `${detail.concerning} de ${detail.checkIns} ${detail.checkIns === 1 ? 'resposta' : 'respostas'}`;

  let move: string;
  if (detail.deltaPoints === null) move = 'primeira semana da série';
  else if (detail.deltaPoints === 0) move = 'sem variação vs. a semana anterior';
  else if (detail.deltaPoints > 0) move = `${detail.deltaPoints} pontos acima da semana anterior`;
  else move = `${Math.abs(detail.deltaPoints)} pontos abaixo da semana anterior`;

  const marks = [detail.isPeak && 'pico', detail.isLatest && 'mais recente'].filter(Boolean);
  const suffix = marks.length > 0 ? ` (${marks.join(', ')})` : '';

  return `${week}: ${detail.percent}%, ${base}, ${move}${suffix}`;
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
