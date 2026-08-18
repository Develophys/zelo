interface ProgressBarProps {
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.75 overflow-hidden rounded-pill bg-line"
    >
      <div
        data-testid="progress-fill"
        className="h-full rounded-pill bg-brand transition-[width] duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
