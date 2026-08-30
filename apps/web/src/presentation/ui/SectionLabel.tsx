import type { ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
  // At 12px uppercase mono this is the app's least legible recurring text, so
  // the default is the tone that clears AA on every surface. `subtle` is
  // text-muted-2, which in light mode measures 4.41:1 on canvas-alt and 4.16:1
  // on surface-brand — below the 4.5:1 floor — so it is an opt-in for surface
  // and canvas only, never the default.
  tone?: "muted" | "subtle" | "brand";
}

const TONE_CLASS: Record<NonNullable<SectionLabelProps["tone"]>, string> = {
  muted: "text-muted",
  subtle: "text-muted-2",
  brand: "text-brand",
};

export function SectionLabel({ children, tone = "muted" }: SectionLabelProps) {
  return (
    <span className={`font-mono text-eyebrow uppercase ${TONE_CLASS[tone]}`}>{children}</span>
  );
}
