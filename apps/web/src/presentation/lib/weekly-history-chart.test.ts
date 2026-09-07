import { describe, expect, it } from 'vitest';
import { describeHistoryWeek } from './weekly-history-chart';

describe('describeHistoryWeek', () => {
  it('says there was no check-in for a null week', () => {
    const description = describeHistoryWeek(
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: null },
      0,
      5,
      -1,
    );
    expect(description).toBe('Semana de 31 de jul.: sem check-in');
  });

  // A sighted reader sees the bar's colour name the severity (band-severe,
  // band-moderate, bg-brand only for genuinely good news); a screen-reader
  // user hearing only "100%" gets no equivalent signal that this is the
  // worst possible reading, not a good one.
  it('names the severity band alongside the percentage, not a bare number', () => {
    const description = describeHistoryWeek(
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 1 },
      0,
      0,
      0,
    );
    expect(description).toContain('100%');
    expect(description).toContain('Grave');
  });

  it('names a minimal reading by its own band, not the severe one', () => {
    const description = describeHistoryWeek(
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.05 },
      0,
      0,
      -1,
    );
    expect(description).toContain('Mínimo');
  });

  it('still marks the latest and peak weeks positionally, alongside the band', () => {
    const latest = describeHistoryWeek(
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.5 },
      2,
      2,
      0,
    );
    expect(latest).toContain('mais recente');

    const peak = describeHistoryWeek(
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.9 },
      0,
      2,
      0,
    );
    expect(peak).toContain('pico');
  });
});
