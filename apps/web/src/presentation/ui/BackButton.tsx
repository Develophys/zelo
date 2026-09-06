import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  // Screens that carry both the header's escape hatch and their own step-back
  // control name the second one, so neither queries nor tests can conflate them.
  testId?: string;
}

export function BackButton({
  label,
  onClick,
  disabled = false,
  className = '',
  testId = 'back-button',
}: BackButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      aria-label={label ? undefined : 'Voltar'}
      className={`cursor-pointer flex min-h-11 min-w-11 items-center justify-center gap-1 text-label font-semibold text-muted transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    >
      <ChevronLeft size={18} aria-hidden="true" />
      {label}
    </button>
  );
}
