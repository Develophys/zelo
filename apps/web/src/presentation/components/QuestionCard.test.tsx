import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionCard } from "./QuestionCard";

const OPTIONS = [
  { value: 0, label: "Nenhuma vez" },
  { value: 1, label: "Vários dias" },
];

describe("QuestionCard", () => {
  it("renders the question and all options", () => {
    render(<QuestionCard question="Pouco interesse..." options={OPTIONS} onSelect={vi.fn()} />);
    expect(screen.getByText("Pouco interesse...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nenhuma vez" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vários dias" })).toBeInTheDocument();
  });

  it("calls onSelect with the option value", async () => {
    const onSelect = vi.fn();
    render(<QuestionCard question="Q" options={OPTIONS} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Vários dias" }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("marks the selected option as pressed", () => {
    render(<QuestionCard question="Q" options={OPTIONS} selected={0} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Nenhuma vez" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Vários dias" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disables every option button when disabled is true", () => {
    render(<QuestionCard question="Q" options={OPTIONS} onSelect={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Nenhuma vez" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vários dias" })).toBeDisabled();
  });

  it("keeps only the selected option fully opaque while disabled, so the pick stays visible while submitting", () => {
    render(<QuestionCard question="Q" options={OPTIONS} selected={0} onSelect={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Nenhuma vez" })).toHaveClass(
      "disabled:opacity-100!",
    );
    expect(screen.getByRole("button", { name: "Vários dias" })).not.toHaveClass(
      "disabled:opacity-100!",
    );
  });
});
