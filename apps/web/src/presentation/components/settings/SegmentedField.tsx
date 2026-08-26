interface SegmentedFieldProps<T extends string> {
  name: string;
  ariaLabel: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedField<T extends string>({
  name,
  ariaLabel,
  options,
  value,
  onChange,
}: SegmentedFieldProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-control bg-canvas-alt p-1"
    >
      {options.map(({ value: optionValue, label }) => {
        const isSelected = value === optionValue;
        return (
          <label
            key={optionValue}
            className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control text-label font-semibold transition-colors duration-150 has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-brand ${
              isSelected
                ? 'border border-fill-edge bg-brand-fill text-on-fill shadow-card'
                : 'border border-transparent text-muted hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={isSelected}
              onChange={() => onChange(optionValue)}
              className="sr-only"
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}
