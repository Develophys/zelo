import { describe, expect, it } from 'vitest';
import { plural } from './plural';

describe('plural', () => {
  it('appends "es" to the singular, matching the panel nouns gestor/setor/par', () => {
    expect(plural('gestor')).toBe('gestores');
    expect(plural('setor')).toBe('setores');
    expect(plural('par')).toBe('pares');
  });
});
