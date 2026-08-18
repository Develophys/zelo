import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/stores/theme.store';

export function ThemeSwitchButton({ className = '' }: { className?: string }) {
  const resolved = useThemeStore((state) => state.resolved);
  const toggle = useThemeStore((state) => state.toggle);
  const goingDark = resolved === 'light';
  const label = goingDark ? 'Ativar tema escuro' : 'Ativar tema claro';

  return (
    <button
      type="button"
      data-testid="theme-switch"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-input text-muted transition-colors duration-150 hover:bg-canvas-alt hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    >
      {goingDark ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
    </button>
  );
}
