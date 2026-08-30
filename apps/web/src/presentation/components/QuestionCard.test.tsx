import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionCard } from './QuestionCard';

const OPTIONS = [
  { value: 0, label: 'Nenhuma vez' },
  { value: 1, label: 'Vários dias' },
];

function renderCard(props: Partial<Parameters<typeof QuestionCard>[0]> = {}) {
  return render(
    <QuestionCard
      question="Pouco interesse..."
      options={OPTIONS}
      onSelect={vi.fn()}
      onCommit={vi.fn()}
      {...props}
    />,
  );
}

describe('QuestionCard', () => {
  it('presents the options as one mutually exclusive group, not a row of buttons', () => {
    renderCard();

    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAccessibleName('Pouco interesse...');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Nenhuma vez' })).not.toBeInTheDocument();
  });

  it('checks the selected option', () => {
    renderCard({ selected: 0 });
    expect(screen.getByRole('radio', { name: 'Nenhuma vez' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Vários dias' })).not.toBeChecked();
  });

  it('records a pointer choice and moves on in one tap', async () => {
    const onSelect = vi.fn();
    const onCommit = vi.fn();
    const user = userEvent.setup();
    renderCard({ onSelect, onCommit });

    await user.click(screen.getByRole('radio', { name: 'Vários dias' }));

    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onCommit).toHaveBeenCalledWith(1);
  });

  it('lets the keyboard explore the scale without being thrown to the next question', async () => {
    const onSelect = vi.fn();
    const onCommit = vi.fn();
    const user = userEvent.setup();
    renderCard({ onSelect, onCommit });

    await user.tab();
    await user.keyboard('{ArrowDown}');

    expect(onSelect).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not advance on Space either, so every keyboard path stays put', async () => {
    const onSelect = vi.fn();
    const onCommit = vi.fn();
    const user = userEvent.setup();
    renderCard({ onSelect, onCommit });

    await user.tab();
    await user.keyboard(' ');

    expect(onSelect).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('offers no forward control until something has been chosen', () => {
    renderCard();
    expect(screen.queryByTestId('question-advance')).not.toBeInTheDocument();
  });

  it('offers a forward control once an answer is on record, so a keyboard user is not stranded', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    renderCard({ selected: 1, onCommit });

    const advance = screen.getByTestId('question-advance');
    expect(advance).toHaveTextContent('Próxima');

    await user.click(advance);
    expect(onCommit).toHaveBeenCalledWith(1);
  });

  it('names the forward control for where it actually goes', () => {
    renderCard({ selected: 1, advanceLabel: 'Revisar respostas' });
    expect(screen.getByTestId('question-advance')).toHaveTextContent('Revisar respostas');
  });

  it('locks every option while a submission is in flight', () => {
    renderCard({ disabled: true });
    screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled());
  });

  it('keeps the chosen option legible while the rest dim during submit', () => {
    renderCard({ selected: 0, disabled: true });

    const chosen = screen.getByRole('radio', { name: 'Nenhuma vez' }).closest('label')!;
    const other = screen.getByRole('radio', { name: 'Vários dias' }).closest('label')!;

    expect(chosen.className).not.toMatch(/\bopacity-50\b/);
    expect(other.className).toMatch(/\bopacity-50\b/);
  });
});
