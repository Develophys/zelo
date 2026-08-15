import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function BackButton({ label, onClick, disabled = false }: BackButtonProps) {
  return (
    <button
      type="button"
      data-testid="back-button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label ? undefined : 'Voltar'}
      className="cursor-pointer flex min-h-11 min-w-11 items-center gap-1 text-label font-semibold text-muted transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <ChevronLeft size={18} />
      {label}
    </button>
  );
}
