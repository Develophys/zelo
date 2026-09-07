import { describe, expect, it } from 'vitest';
import {
  peakSegmentLabel,
  peakTrendIndex,
  describeSegment,
  describeTrendWeek,
  trendWeekDetail,
  toTrendBarHeights,
  toTrendBars,
  weekLabel,
} from './manager-trend-chart';

describe('toTrendBars', () => {
  it('draws a zero week shorter than the smallest non-zero one', () => {
    const [zero, lowest] = toTrendBars([
      { weekStart: '', concerningRate: 0, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.01, checkIns: 0, concerning: 0 },
    ]);

    expect(zero!.height).toBeLessThan(lowest!.height);
    expect(zero!.isZero).toBe(true);
    expect(lowest!.isZero).toBe(false);
  });

  it('keeps a non-zero week legible without inflating it past its value', () => {
    expect(toTrendBars([{ weekStart: '', concerningRate: 0.5, checkIns: 0, concerning: 0 }])[0]!.height).toBe(50);
    expect(toTrendBars([{ weekStart: '', concerningRate: 0.02, checkIns: 0, concerning: 0 }])[0]!.height).toBe(8);
  });

  it('never overflows the plot area', () => {
    expect(toTrendBars([{ weekStart: '', concerningRate: 1.4, checkIns: 0, concerning: 0 }])[0]!.height).toBe(100);
  });
});

describe('toTrendBarHeights', () => {
  it('makes a real but small week-to-week move clearly visible, instead of a few percentage points of a 0-100 axis', () => {
    // 40% -> 46% is a meaningful rise, but on a 0-100 scale it is a ~6px sliver
    // of an already-short bar. The desktop chart's one job is to show whether
    // the team is getting worse; this must be visually obvious.
    const heights = toTrendBarHeights([
      { weekStart: '', concerningRate: 0.4, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.42, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.42, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.44, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.46, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.46, checkIns: 0, concerning: 0 },
    ]);

    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(15);
    // Monotonically non-decreasing, matching the underlying rise.
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]!).toBeGreaterThanOrEqual(heights[i - 1]!);
    }
  });

  it('does not stretch the series minimum to the floor and the maximum to the ceiling, which reads a modest move as "nothing to everything"', () => {
    // A padded domain, not the series' own exact min/max: a 6-point rise and
    // an 80-point rise must not render as the same "empty to full" shape.
    const smallMove = toTrendBarHeights([
      { weekStart: '', concerningRate: 0.4, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.46, checkIns: 0, concerning: 0 },
    ]);
    expect(Math.min(...smallMove)).toBeGreaterThan(8);
    expect(Math.max(...smallMove)).toBeLessThan(100);
  });

  it('lets a genuinely wide swing use most of the plot, unlike the padded small-move case', () => {
    const wideMove = toTrendBarHeights([
      { weekStart: '', concerningRate: 0.1, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.9, checkIns: 0, concerning: 0 },
    ]);
    expect(Math.max(...wideMove) - Math.min(...wideMove)).toBeGreaterThan(60);
  });

  it('keeps a real zero week pinned to the zero-height floor, not stretched by the relative scale', () => {
    const heights = toTrendBarHeights([
      { weekStart: '', concerningRate: 0, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.5, checkIns: 0, concerning: 0 },
    ]);
    expect(heights[0]).toBeLessThan(heights[1]!);
    expect(heights[0]).toBeLessThanOrEqual(4);
  });

  it('gives a flat, all-equal, non-zero series a visible mid height rather than collapsing to zero range', () => {
    const heights = toTrendBarHeights([
      { weekStart: '', concerningRate: 0.3, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.3, checkIns: 0, concerning: 0 },
    ]);
    expect(heights[0]).toBeGreaterThan(20);
    expect(heights[0]).toBe(heights[1]);
  });

  it('never exceeds the plot area', () => {
    for (const height of toTrendBarHeights([
      { weekStart: '', concerningRate: 0.1, checkIns: 0, concerning: 0 },
      { weekStart: '', concerningRate: 0.9, checkIns: 0, concerning: 0 },
    ])) {
      expect(height).toBeLessThanOrEqual(100);
      expect(height).toBeGreaterThanOrEqual(0);
    }
  });
});

const TREND = [
  { weekStart: '2026-08-24T00:00:00.000Z', concerningRate: 0.4, checkIns: 20, concerning: 8 },
  { weekStart: '2026-08-31T00:00:00.000Z', concerningRate: 0.47, checkIns: 62, concerning: 29 },
];

describe('trendWeekDetail', () => {
  it('carries the numerator, the denominator and the move from the previous week', () => {
    expect(trendWeekDetail(TREND, 1, 1)).toEqual({
      weekLabel: '31 de ago.',
      percent: 47,
      concerning: 29,
      checkIns: 62,
      deltaPoints: 7,
      isPeak: true,
      isLatest: true,
    });
  });

  it('has no delta on the first week of the series', () => {
    expect(trendWeekDetail(TREND, 0, 1).deltaPoints).toBeNull();
  });
});

describe('describeTrendWeek', () => {
  // O nome acessível e a bolha saem da mesma estrutura, então não podem
  // divergir — que é o modo de falha de manter duas descrições paralelas.
  it('reads the week, the rate, the base and the move', () => {
    expect(describeTrendWeek(trendWeekDetail(TREND, 1, 1))).toBe(
      'Semana de 31 de ago.: 47%, 29 de 62 respostas, 7 pontos acima da semana anterior (pico, mais recente)',
    );
  });

  it('reads a week with no movement and no marks', () => {
    const flat = [
      { weekStart: '2026-08-24T00:00:00.000Z', concerningRate: 0.4, checkIns: 20, concerning: 8 },
      { weekStart: '2026-08-31T00:00:00.000Z', concerningRate: 0.4, checkIns: 20, concerning: 8 },
    ];
    expect(describeTrendWeek(trendWeekDetail(flat, 1, 0))).toBe(
      'Semana de 31 de ago.: 40%, 8 de 20 respostas, sem variação vs. a semana anterior (mais recente)',
    );
  });
});

describe('weekLabel', () => {
  it('is empty for a missing or unparseable date', () => {
    expect(weekLabel('')).toBe('');
    expect(weekLabel('not-a-date')).toBe('');
  });
});

describe('describeSegment', () => {
  it('spells out the sample size instead of statistical notation', () => {
    expect(describeSegment({ label: 'UTI', value: 44, n: 9 })).toBe('UTI: 44%, 9 respostas');
  });

  it('agrees in number for a single response', () => {
    expect(describeSegment({ label: 'UTI', value: 44, n: 1 })).toBe('UTI: 44%, 1 resposta');
  });
});
describe('peakTrendIndex', () => {
  it('marks the worst week, so severity is not drawn in the brand colour', () => {
    // Relative, not threshold-based: it says "this is the highest here" without
    // claiming what counts as bad, which PRODUCT.md lists as an open question.
    expect(
      peakTrendIndex([
        { weekStart: '', concerningRate: 0.2, checkIns: 0, concerning: 0 },
        { weekStart: '', concerningRate: 0.7, checkIns: 0, concerning: 0 },
        { weekStart: '', concerningRate: 0.3, checkIns: 0, concerning: 0 },
      ]),
    ).toBe(1);
  });

  it('has no peak when nothing has been measured', () => {
    expect(peakTrendIndex([])).toBe(-1);
    expect(
      peakTrendIndex([
        { weekStart: '', concerningRate: 0, checkIns: 0, concerning: 0 },
        { weekStart: '', concerningRate: 0, checkIns: 0, concerning: 0 },
      ]),
    ).toBe(-1);
  });
});

describe('peakSegmentLabel', () => {
  it('names the sector carrying the most signals', () => {
    expect(
      peakSegmentLabel([
        { label: 'UTI', value: 44, n: 9 },
        { label: 'PS', value: 61, n: 12 },
      ]),
    ).toBe('PS');
  });

  it('names nothing when every sector is at zero', () => {
    expect(peakSegmentLabel([{ label: 'UTI', value: 0, n: 9 }])).toBeNull();
  });
});

