import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
  label?: string;
  onClick: () => void;
}

export function BackButton({ label, onClick }: BackButtonProps) {
  return (
    <button
      type="button"
      data-testid="back-button"
      onClick={onClick}
      aria-label={label ? undefined : 'Voltar'}
      className="cursor-pointer flex min-h-11 min-w-11 items-center gap-1 text-label font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <ChevronLeft size={18} />
      {label}
    </button>
  );
}
