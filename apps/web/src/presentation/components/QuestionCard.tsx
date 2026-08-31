import { useId } from 'react';
import { Button } from '@/presentation/ui/Button';

interface QuestionCardProps {
  question: string;
  options: readonly { value: number; label: string }[];
  selected?: number;
  // Records a choice without moving. Every keyboard interaction lands here: a
  // keyboard user must be able to walk the scale without the screen changing
  // under them, on an instrument whose last item asks about self-harm.
  onSelect: (value: number) => void;
  // Records and moves on — the one-tap path, unchanged.
  onCommit: (value: number) => void;
  advanceLabel?: string;
  disabled?: boolean;
}

export function QuestionCard({
  question,
  options,
  selected,
  onSelect,
  onCommit,
  advanceLabel = 'Próxima',
  disabled = false,
}: QuestionCardProps) {
  const headingId = useId();
  // Scoped per question so a revisited answer cannot bleed across items.
  const groupName = `${useId()}-scale`;
  const hasAnswer = typeof selected === 'number';

  return (
    <div>
      <h2
        id={headingId}
        className="mb-6.5 mt-2.5 min-h-[3lh] font-serif text-h2 text-ink md:min-h-[2lh]"
      >
        {question}
      </h2>

      <div
        role="radiogroup"
        aria-labelledby={headingId}
        className="flex flex-col gap-2.75"
      >
        {options.map((option) => {
          const isSelected = selected === option.value;

          return (
            <label
              key={option.value}
              className={`
                rounded-control border
                px-4.5 py-4
                text-left text-label font-semibold text-ink-2
                duration-200 ease-out
                has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-brand
                ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:border-faint hover:shadow-card'}
                ${disabled && !isSelected ? 'opacity-50' : ''}
                ${
                  isSelected
                    ? 'border-brand bg-surface-brand'
                    : 'border-line bg-surface hover:border-track hover:text-ink active:border-brand active:bg-surface-brand'
                }
              `}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onSelect(option.value)}
                // Keyboard selection runs a radio's full activation behavior,
                // so arrow keys fire click too. UIEvent.detail is the honest
                // discriminator: 0 for a keyboard-generated click, >=1 for a
                // real pointer. Without it, arrowing through the scale would
                // throw the user to the next question.
                onClick={(event) => {
                  if (event.detail > 0) onCommit(option.value);
                }}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>

      {/* Only ever seen by someone who chose without moving — a keyboard user, or
          anyone returning from the review to a question they already answered.
          A pointer tap advances before this could render. */}
      {hasAnswer && (
        <div className="mt-4">
          <Button
            type="button"
            data-testid="question-advance"
            variant="primary"
            onClick={() => onCommit(selected)}
            disabled={disabled}
          >
            {advanceLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
