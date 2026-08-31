import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreDial } from './ScoreDial';
import type { ScoreBandTone } from '@/presentation/lib/band-for';

describe('ScoreDial', () => {
  it('renders the score, max, and band label', () => {
    render(<ScoreDial score={12} max={27} band={{ label: 'Moderado', tone: 'moderate' }} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('/27')).toBeInTheDocument();
    expect(screen.getByText('Moderado')).toBeInTheDocument();
  });

  it('carries the band tone on the score itself, not only on the pill', () => {
    render(<ScoreDial score={12} max={27} band={{ label: 'Moderado', tone: 'moderate' }} />);
    expect(screen.getByTestId('score-value')).toHaveClass('text-band-moderate');
    expect(screen.getByText('Moderado')).toHaveClass('bg-band-moderate-bg', 'text-band-moderate');
  });

  it.each<[ScoreBandTone, string]>([
    ['minimal', 'text-band-minimal'],
    ['mild', 'text-band-mild'],
    ['moderate', 'text-band-moderate'],
    ['high', 'text-band-high'],
    ['severe', 'text-band-severe'],
  ])('maps the %s tone to its own palette token', (tone, expected) => {
    render(<ScoreDial score={12} max={27} band={{ label: tone, tone }} />);
    expect(screen.getByTestId('score-value')).toHaveClass(expected);
  });

  it('reads as one sentence, not four disconnected fragments', () => {
    render(<ScoreDial score={19} max={27} band={{ label: 'Moderadamente grave', tone: 'high' }} />);
    expect(screen.getByTestId('score-sentence')).toHaveTextContent(
      '19 de 27. Faixa: Moderadamente grave.',
    );
  });
});
