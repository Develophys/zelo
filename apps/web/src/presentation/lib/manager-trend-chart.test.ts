import { describe, expect, it } from 'vitest';
import {
  peakSegmentLabel,
  peakTrendIndex,
  describeSegment,
  describeTrendWeek,
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

