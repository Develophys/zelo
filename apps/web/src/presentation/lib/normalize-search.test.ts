import { describe, expect, it } from 'vitest';
import { normalize } from './normalize-search';

describe('normalize', () => {
  it('strips accents and lowercases, so an accent-free query still matches', () => {
    expect(normalize('João')).toBe('joao');
    expect(normalize('BEATRIZ')).toBe('beatriz');
    expect(normalize('Pronto-Socorro')).toBe('pronto-socorro');
  });
});
