import type { ComponentType } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/stores/theme.store';
import type { ThemePreference } from '@/presentation/lib/theme';

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

const OPTIONS: readonly ThemeOption[] = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
];

export function ThemeToggle() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <fieldset data-testid="theme-toggle">
      <legend className="sr-only">Tema da interface</legend>
      <div className="flex gap-1 rounded-control bg-canvas-alt p-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const isSelected = preference === value;
          return (
            <label
              key={value}
              className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control text-label font-semibold transition-colors duration-150 has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-brand ${
                isSelected
                  ? 'border border-fill-edge bg-brand-fill text-on-fill shadow-card'
                  : 'border border-transparent text-muted hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name="theme-preference"
                value={value}
                checked={isSelected}
                onChange={() => setPreference(value)}
                className="sr-only"
              />
              <Icon size={16} aria-hidden="true" />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
