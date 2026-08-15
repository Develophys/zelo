import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WaveText } from "./WaveText";

describe("WaveText", () => {
  it("exposes the text as one word to assistive tech, not letter by letter", () => {
    render(<WaveText text="Enviando..." />);
    expect(screen.getByText("Enviando...")).toBeInTheDocument();
  });

  it("hides the animated letters from assistive tech to avoid a double reading", () => {
    render(<WaveText text="Oi" />);
    expect(screen.getByTestId("wave-text-letters")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders one animated span per character", () => {
    render(<WaveText text="Oi" />);
    const letters = screen.getByTestId("wave-text-letters").children;
    expect(letters).toHaveLength(2);
    expect(letters[0]).toHaveTextContent("O");
    expect(letters[1]).toHaveTextContent("i");
    expect(letters[0]).toHaveClass("animate-letter-wave");
  });

  it("staggers each letter so the wave travels left to right", () => {
    render(<WaveText text="Oi" />);
    const letters = screen.getByTestId("wave-text-letters").children;
    expect(letters[0]).toHaveStyle({ animationDelay: "0ms" });
    expect(letters[1]).toHaveStyle({ animationDelay: "60ms" });
  });

  it("preserves spaces between words", () => {
    render(<WaveText text="a b" />);
    const letters = screen.getByTestId("wave-text-letters");
    expect(letters.children).toHaveLength(3);
    expect(letters).toHaveClass("whitespace-pre");
  });

  it("applies a caller-supplied className to the wrapper", () => {
    render(<WaveText text="Oi" className="text-muted" />);
    expect(screen.getByTestId("wave-text")).toHaveClass("text-muted");
  });
});
