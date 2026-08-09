import type { ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
  // "muted-strong" is for placement on a background where "muted" (text-muted-2)
  // clears WCAG AA (4.5:1) with little to no margin — text-muted has ~5:1.
  tone?: "muted" | "muted-strong" | "brand";
}

const TONE_CLASS: Record<NonNullable<SectionLabelProps["tone"]>, string> = {
  muted: "text-muted-2",
  "muted-strong": "text-muted",
  brand: "text-brand",
};

export function SectionLabel({ children, tone = "muted" }: SectionLabelProps) {
  return (
    <span className={`font-mono text-eyebrow uppercase ${TONE_CLASS[tone]}`}>{children}</span>
  );
}
