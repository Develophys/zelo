import { Check } from 'lucide-react';
import { MANAGER_ACCENTS, type ManagerAccent } from '@/stores/manager-prefs.store';
import { ACCENT_LABEL } from './settings-options';

interface AccentFieldProps {
  value: ManagerAccent;
  onChange: (value: ManagerAccent) => void;
}

export function AccentField({ value, onChange }: AccentFieldProps) {
  return (
    <div role="radiogroup" aria-label="Cor de destaque" className="grid grid-cols-4 gap-2">
      {MANAGER_ACCENTS.map((accent) => {
        const isSelected = value === accent;
        const isSage = accent === 'sage';
        return (
          <label
            key={accent}
            className={`flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control border p-2 text-caption font-semibold transition-colors duration-150 has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-brand ${
              isSelected ? 'border-brand-fill bg-surface-brand text-ink' : 'border-line text-muted hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name="manager-accent"
              value={accent}
              checked={isSelected}
              onChange={() => onChange(accent)}
              className="sr-only"
            />
            <span
              data-accent={isSage ? undefined : accent}
              data-testid={`accent-swatch-${accent}`}
              aria-hidden="true"
              className={`flex h-6 w-6 items-center justify-center rounded-full text-on-fill ${
                isSage ? 'bg-accent-sage-fill' : 'bg-brand-fill'
              }`}
            >
              {isSelected && <Check size={14} strokeWidth={3} aria-hidden="true" />}
            </span>
            {ACCENT_LABEL[accent]}
          </label>
        );
      })}
    </div>
  );
}
