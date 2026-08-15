import { Button } from '@/presentation/ui/Button';

interface QuestionCardProps {
  question: string;
  options: readonly { value: number; label: string }[];
  selected?: number;
  onSelect: (value: number) => void;
  disabled?: boolean;
}

export function QuestionCard({
  question,
  options,
  selected,
  onSelect,
  disabled = false,
}: QuestionCardProps) {
  return (
    <div>
      <h2 className="mb-6.5 mt-2.5 min-h-[3lh] font-serif text-h2 text-ink md:min-h-[2lh]">
        {question}
      </h2>
      <div className="flex flex-col gap-2.75">
        {options.map((option) => (
          <Button
            key={option.value}
            variant="unstyled"
            full={false}
            type="button"
            aria-pressed={selected === option.value}
            onClick={() => onSelect(option.value)}
            disabled={disabled}
            className={`
              rounded-input border 
              px-4.5 py-4 
              text-left text-label font-semibold text-ink-2 
              duration-200 ease-out 
              enabled:hover:shadow-card
              enabled:hover:cursor-pointer
              enabled:hover:border-gray-500 
              ${
                selected === option.value
                  ? 'border-brand bg-surface-brand enabled:hover:border-brand-hover disabled:opacity-100!'
                  : 'border-line bg-surface enabled:hover:border-track enabled:hover:text-ink enabled:active:border-brand enabled:active:bg-surface-brand'
              }
            `}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
