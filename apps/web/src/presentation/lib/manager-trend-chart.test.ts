import { describe, expect, it } from 'vitest';
import {
  peakSegmentLabel,
  peakTrendIndex,
  describeSegment,
  describeTrendWeek,
  toTrendBarHeights,
  toTrendBars,
  weekLabel,
} from './manager-trend-chart';

describe('toTrendBars', () => {
  it('draws a zero week shorter than the smallest non-zero one', () => {
    const [zero, lowest] = toTrendBars([
      { weekStart: '', concerningRate: 0 },
      { weekStart: '', concerningRate: 0.01 },
    ]);

    expect(zero!.height).toBeLessThan(lowest!.height);
    expect(zero!.isZero).toBe(true);
    expect(lowest!.isZero).toBe(false);
  });

  it('keeps a non-zero week legible without inflating it past its value', () => {
    expect(toTrendBars([{ weekStart: '', concerningRate: 0.5 }])[0]!.height).toBe(50);
    expect(toTrendBars([{ weekStart: '', concerningRate: 0.02 }])[0]!.height).toBe(8);
  });

  it('never overflows the plot area', () => {
    expect(toTrendBars([{ weekStart: '', concerningRate: 1.4 }])[0]!.height).toBe(100);
  });
});

describe('toTrendBarHeights', () => {
  it('makes a real but small week-to-week move clearly visible, instead of a few percentage points of a 0-100 axis', () => {
    // 40% -> 46% is a meaningful rise, but on a 0-100 scale it is a ~6px sliver
    // of an already-short bar. The desktop chart's one job is to show whether
    // the team is getting worse; this must be visually obvious.
    const heights = toTrendBarHeights([
      { weekStart: '', concerningRate: 0.4 },
      { weekStart: '', concerningRate: 0.42 },
      { weekStart: '', concerningRate: 0.42 },
      { weekStart: '', concerningRate: 0.44 },
      { weekStart: '', concerningRate: 0.46 },
      { weekStart: '', concerningRate: 0.46 },
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
      { weekStart: '', concerningRate: 0.4 },
      { weekStart: '', concerningRate: 0.46 },
    ]);
    expect(Math.min(...smallMove)).toBeGreaterThan(8);
    expect(Math.max(...smallMove)).toBeLessThan(100);
  });

  it('lets a genuinely wide swing use most of the plot, unlike the padded small-move case', () => {
    const wideMove = toTrendBarHeights([
      { weekStart: '', concerningRate: 0.1 },
      { weekStart: '', concerningRate: 0.9 },
    ]);
    expect(Math.max(...wideMove) - Math.min(...wideMove)).toBeGreaterThan(60);
  });

  it('keeps a real zero week pinned to the zero-height floor, not stretched by the relative scale', () => {
    const heights = toTrendBarHeights([
      { weekStart: '', concerningRate: 0 },
      { weekStart: '', concerningRate: 0.5 },
    ]);
    expect(heights[0]).toBeLessThan(heights[1]!);
    expect(heights[0]).toBeLessThanOrEqual(4);
  });

  it('gives a flat, all-equal, non-zero series a visible mid height rather than collapsing to zero range', () => {
    const heights = toTrendBarHeights([
      { weekStart: '', concerningRate: 0.3 },
      { weekStart: '', concerningRate: 0.3 },
    ]);
    expect(heights[0]).toBeGreaterThan(20);
    expect(heights[0]).toBe(heights[1]);
  });

  it('never exceeds the plot area', () => {
    for (const height of toTrendBarHeights([
      { weekStart: '', concerningRate: 0.1 },
      { weekStart: '', concerningRate: 0.9 },
    ])) {
      expect(height).toBeLessThanOrEqual(100);
      expect(height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('describeTrendWeek', () => {
  it('states the week and its value, marking the most recent', () => {
    const trend = [
      { weekStart: '2026-06-01T00:00:00.000Z', concerningRate: 0.3 },
      { weekStart: '2026-06-08T00:00:00.000Z', concerningRate: 0 },
    ];

    expect(describeTrendWeek(trend[0]!, 0, 1)).toBe('Semana de 1 de jun.: 30%');
    expect(describeTrendWeek(trend[1]!, 1, 1)).toBe('Semana de 8 de jun.: 0% (mais recente)');
  });

  it('falls back to an ordinal when the week has no date', () => {
    expect(describeTrendWeek({ weekStart: '', concerningRate: 0.1 }, 2, 5)).toBe('Semana 3: 10%');
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
        { weekStart: '', concerningRate: 0.2 },
        { weekStart: '', concerningRate: 0.7 },
        { weekStart: '', concerningRate: 0.3 },
      ]),
    ).toBe(1);
  });

  it('has no peak when nothing has been measured', () => {
    expect(peakTrendIndex([])).toBe(-1);
    expect(
      peakTrendIndex([
        { weekStart: '', concerningRate: 0 },
        { weekStart: '', concerningRate: 0 },
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

