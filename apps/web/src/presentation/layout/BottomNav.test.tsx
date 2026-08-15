import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("renders the four PT-BR tab labels", () => {
    render(<BottomNav active="home" onNavigate={vi.fn()} />);
    expect(screen.getByText("Início")).toBeInTheDocument();
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("Conversar")).toBeInTheDocument();
    expect(screen.getByText("Você")).toBeInTheDocument();
  });

  it("styles the active tab with brand color", () => {
    render(<BottomNav active="chat" onNavigate={vi.fn()} />);
    expect(screen.getByText("Conversar").closest("button")).toHaveClass("text-brand");
    expect(screen.getByText("Início").closest("button")).toHaveClass("text-muted");
  });

  it("calls onNavigate with the tapped tab", async () => {
    const onNavigate = vi.fn();
    render(<BottomNav active="home" onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole("button", { name: /check-in/i }));
    expect(onNavigate).toHaveBeenCalledWith("checkin");
  });
});
