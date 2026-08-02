import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger";
  full?: boolean;
  loading?: boolean;
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  ghost: "bg-transparent text-muted",
  outline: "bg-surface text-ink border border-line",
  danger: "bg-danger text-white",
};

export function Button({
  variant = "primary",
  full = true,
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        "rounded-pill py-4 font-sans text-[16px] font-bold transition disabled:opacity-50",
        "min-h-13 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        VARIANT_CLASS[variant],
        full ? "w-full" : "",
        className,
      ].join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          data-testid="button-spinner"
          className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span className={loading ? "sr-only" : undefined}>{children}</span>
    </button>
  );
}
