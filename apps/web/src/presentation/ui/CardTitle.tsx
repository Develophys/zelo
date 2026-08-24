import type { ReactNode } from "react";

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-serif text-lg text-ink">{children}</h2>;
}
