import { describe, expect, it } from 'vitest';
import { getGreeting } from './get-greeting';

describe('getGreeting', () => {
  it.each([
    [0, 'Boa madrugada.'],
    [4, 'Boa madrugada.'],
    [5, 'Bom dia.'],
    [11, 'Bom dia.'],
    [12, 'Boa tarde.'],
    [17, 'Boa tarde.'],
    [18, 'Boa noite.'],
    [23, 'Boa noite.'],
  ])('greets hour %i with %s', (hour, expected) => {
    expect(getGreeting(hour)).toBe(expected);
  });

  it('does not fold the small hours into the evening, where plantão noturno lives', () => {
    // 04:30 is mid-shift for this product's primary user, not a late night.
    expect(getGreeting(4)).not.toBe('Boa noite.');
    expect(getGreeting(3)).not.toBe(getGreeting(22));
  });
});
