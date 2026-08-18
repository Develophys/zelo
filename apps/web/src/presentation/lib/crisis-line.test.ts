import { describe, expect, it } from 'vitest';
import { requestHumanHandoffUseCase } from '@/app/container';
import { getCrisisLine } from './crisis-line';

describe('getCrisisLine', () => {
  it('takes the number from the handoff use case, so no surface can hardcode one that drifts', () => {
    const { externalCrisisLine } = requestHumanHandoffUseCase.execute();
    const line = getCrisisLine();

    expect(line.phone).toBe(externalCrisisLine.phone);
    expect(line.telHref).toBe(`tel:${externalCrisisLine.phone}`);
    expect(line.fullLabel).toBe(externalCrisisLine.label);
  });

  it('shortens the label at the dash, the derivation all three crisis pages used to repeat', () => {
    const line = getCrisisLine();

    expect(line.fullLabel).toBe('CVV - Centro de Valorização da Vida');
    expect(line.label).toBe('CVV');
  });
});
