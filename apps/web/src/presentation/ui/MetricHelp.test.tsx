import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricHelp } from './MetricHelp';

describe('MetricHelp', () => {
  it('names the trigger after the metric it explains', () => {
    render(<MetricHelp label="Taxa de resposta do follow-up" content="Como é calculado." />);

    expect(
      screen.getByRole('button', { name: 'Sobre: Taxa de resposta do follow-up' }),
    ).toBeInTheDocument();
  });

  it('describes the trigger with the bubble once opened, so the explanation is not read as the name', async () => {
    const user = userEvent.setup();
    render(<MetricHelp label="Cobertura desta leitura" content="Quantos setores entram na conta." />);

    const trigger = screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' });
    await user.tab();
    expect(trigger).toHaveFocus();

    const bubble = await screen.findByTestId('tooltip');
    expect(bubble).toHaveTextContent('Quantos setores entram na conta.');
    expect(trigger).toHaveAttribute('aria-describedby', bubble.id);
  });
});
