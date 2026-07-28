import { ChevronLeft } from "lucide-react";

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
      aria-label={label ? undefined : "Voltar"}
      className="flex min-h-[44px] min-w-[44px] items-center gap-1 text-label font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <ChevronLeft size={18} />
      {label}
    </button>
  );
}
