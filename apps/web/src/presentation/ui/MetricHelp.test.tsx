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

  // The whole point of the click trigger: a plain tap is the gesture everyone
  // tries first, and under the shared Tooltip's long-press it did nothing at
  // all — pointerup cancelled the timer before 450ms elapsed.
  it('opens on a plain click, with no press-and-hold', async () => {
    const user = userEvent.setup();
    render(<MetricHelp label="Cobertura desta leitura" content="Quantos setores entram na conta." />);

    await user.click(screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' }));

    expect(await screen.findByTestId('tooltip')).toHaveTextContent(
      'Quantos setores entram na conta.',
    );
  });

  it('closes again when the trigger is clicked a second time', async () => {
    const user = userEvent.setup();
    render(<MetricHelp label="Cobertura desta leitura" content="Quantos setores entram na conta." />);

    const trigger = screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' });
    await user.click(trigger);
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
  });

  it('announces its open state on the trigger', async () => {
    const user = userEvent.setup();
    render(<MetricHelp label="Cobertura desta leitura" content="Quantos setores entram na conta." />);

    const trigger = screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    render(<MetricHelp label="Cobertura desta leitura" content="Quantos setores entram na conta." />);

    const trigger = screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' });
    await user.click(trigger);
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when something outside it is pressed', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MetricHelp label="Cobertura desta leitura" content="Quantos setores entram na conta." />
        <button type="button">fora</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' }));
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'fora' }));

    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
  });

  it('describes the trigger with the bubble while it is open', async () => {
    const user = userEvent.setup();
    render(<MetricHelp label="Cobertura desta leitura" content="Quantos setores entram na conta." />);

    const trigger = screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' });
    await user.click(trigger);

    const bubble = screen.getByTestId('tooltip');
    expect(trigger).toHaveAttribute('aria-describedby', bubble.id);
  });

  // PRODUCT.md commits to 44x44 hit targets, not WCAG 2.5.8's 24x24 floor.
  // The icon stays 14px; the button grows around it and pulls the extra height
  // back with negative margin so a card's label line keeps its rhythm.
  it('gives the trigger a 44px touch target without changing the line it sits on', () => {
    render(<MetricHelp label="Cobertura desta leitura" content="Qualquer coisa." />);

    const trigger = screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' });
    expect(trigger.className).toContain('h-11');
    expect(trigger.className).toContain('w-11');
    expect(trigger.className).toContain('-m-2.5');
  });
});
