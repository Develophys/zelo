import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders a pulsing gray block", () => {
    render(<Skeleton />);
    expect(screen.getByTestId("skeleton")).toHaveClass("animate-pulse", "bg-line");
  });

  it("merges a custom className for sizing and shape", () => {
    render(<Skeleton className="h-4 w-20 rounded-pill" />);
    expect(screen.getByTestId("skeleton")).toHaveClass("h-4", "w-20", "rounded-pill");
  });

  it('keeps a signal under reduced motion, like every other indefinite indicator', () => {
    render(<Skeleton />);
    // The universal reduced-motion kill in index.css strips animation-name from
    // everything; motion-essential is the opt-in that hands back an opacity
    // pulse. Without it a loading skeleton goes fully static and stops saying
    // anything is happening. The spinner and typing dots already opt in.
    expect(screen.getByTestId('skeleton')).toHaveClass('motion-essential');
  });
});
