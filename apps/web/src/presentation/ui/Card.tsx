import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  size?: "md" | "lg";
  tone?: "surface" | "brand" | "brand-tint";
  className?: string;
  "data-testid"?: string;
}

export function Card({ children, size = "md", tone = "surface", className = "", ...rest }: CardProps) {
  const radius = size === "lg" ? "rounded-card-lg" : "rounded-card";
  const padding = size === "lg" ? "p-[22px]" : "p-[18px]";
  // Surface cards use the heavier shadow at lg size (design-tokens.md: shadow-card-lg
  // is reserved for "Result card" — the only lg+surface composition in the specs).
  const toneClass =
    tone === "brand"
      ? "bg-brand-fill text-on-fill shadow-hero"
      : tone === "brand-tint"
        ? "bg-surface-brand"
        : `bg-surface ${size === "lg" ? "shadow-card-lg" : "shadow-card"}`;
  return (
    <div className={[radius, padding, toneClass, className].join(" ")} {...rest}>
      {children}
    </div>
  );
}
