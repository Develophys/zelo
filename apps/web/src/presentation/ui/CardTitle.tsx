import type { ReactNode } from "react";

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-serif text-card-title text-ink">{children}</h2>;
}
