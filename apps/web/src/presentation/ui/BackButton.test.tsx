import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackButton } from "./BackButton";

describe("BackButton", () => {
  it("renders icon-only with a 'Voltar' accessible name when no label is given", () => {
    render(<BackButton onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
  });

  it("renders the given label as visible text and accessible name", () => {
    render(<BackButton label="Início" onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Início" })).toBeInTheDocument();
  });

  it("calls onClick when tapped", async () => {
    const onClick = vi.fn();
    render(<BackButton label="Voltar" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("meets the 44px hit-target minimum and has a visible focus ring class", () => {
    render(<BackButton onClick={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("min-h-11", "min-w-11");
    expect(button).toHaveClass("focus-visible:ring-2");
  });
});
