import { describe, expect, it } from 'vitest';
import { isValidEmail } from './validate-email';

describe('isValidEmail', () => {
  it('accepts a well-formed email', () => {
    expect(isValidEmail('mauricio@zelo-demo.local')).toBe(true);
    expect(isValidEmail('m.souza+hospital@example.com.br')).toBe(true);
  });

  it('rejects strings with no @ or domain', () => {
    expect(isValidEmail('mauricio')).toBe(false);
    expect(isValidEmail('mauricio@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('mauricio example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});
